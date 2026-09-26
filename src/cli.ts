import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

export type Controls = {
  maxResults: number;
  persistMode: "never" | "workflow-only";
};

export type CatalogSkill = {
  id: string;
  source: string;
  skillId: string;
  name: string;
  installs: number;
  description?: string;
  sourceType?: string;
  installUrl?: string;
  url?: string;
};

export type RankedSkill = CatalogSkill & {
  rank: number;
};

export type DiscoveryCandidate = {
  id: string;
  title: string;
  description: string;
};

export type SkillMetadata = {
  title: string;
  description: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type CommandOptions = {
  env?: Record<string, string>;
  timeoutMs?: number;
};

type MaterializedSkill = {
  reviewId: string;
  reviewRoot: string;
  skillDir: string;
  skillPath: string;
  skillName: string;
  skillPathSha256: string;
  files: string[];
  hasWorkflowFiles: boolean;
};

export type Review = {
  schemaVersion: 1;
  reviewId: string;
  skill: {
    id: string;
    name: string;
    title: string;
    description: string;
    skillPath: string;
    skillPathSha256: string;
  };
  supportPath: string | null;
  files: string[];
  hasWorkflowFiles: boolean;
  storage: "os-temp";
  handoff: {
    approvedSkills: Array<{
      id: string;
      name: string;
      instructionsPath: string;
      instructionsSha256: string;
    }>;
    rules: string[];
  };
  diagnostics: string;
};

export type InstallResult = {
  name: string;
  status: "installed";
  source: string;
  ref: string | null;
  hash: string | null;
  path: string;
  scope: "global";
  agents: string[];
  mode: string;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsCommand = ["skills@1.7.0"];
const skillsEnvironment = {
  DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1",
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseControls(value: unknown): Controls {
  const item = record(value, "router controls");
  const allowed = new Set(["maxResults", "persistMode"]);
  if (Object.keys(item).some((key) => !allowed.has(key))) {
    throw new Error("Unknown router control");
  }
  const persistMode = stringValue(item.persistMode, "persistMode");
  if (persistMode !== "never" && persistMode !== "workflow-only") {
    throw new Error("Invalid persistMode");
  }
  const controls: Controls = {
    maxResults: integerValue(item.maxResults, "maxResults"),
    persistMode,
  };
  if (controls.maxResults === 0) {
    throw new Error("maxResults must be positive");
  }
  return controls;
}

export async function loadControls(): Promise<Controls> {
  return parseControls(await Bun.file(join(root, "config/policy.json")).json());
}

export function parseCatalogSkill(value: unknown): CatalogSkill {
  const item = record(value, "catalog skill");
  const installs =
    item.installs === undefined ? 0 : integerValue(item.installs, "installs");
  const skillId = stringValue(
    item.skillId ?? item.slug ?? item.name,
    "catalog skill name",
  );
  const result: CatalogSkill = {
    id: stringValue(item.id, "catalog skill id"),
    source: stringValue(item.source, "catalog source"),
    skillId,
    name: stringValue(item.name ?? skillId, "catalog display name"),
    installs,
  };
  if (typeof item.description === "string" && item.description.length > 0) {
    result.description = item.description;
  }
  if (
    typeof item.summary === "string" &&
    item.summary.length > 0 &&
    result.description === undefined
  ) {
    result.description = item.summary;
  }
  if (item.sourceType !== undefined) {
    result.sourceType = stringValue(item.sourceType, "source type");
  }
  if (item.installUrl !== undefined) {
    result.installUrl = stringValue(item.installUrl, "install URL");
  }
  if (item.url !== undefined) result.url = stringValue(item.url, "skill URL");
  return result;
}

export function rankSkills(
  skills: CatalogSkill[],
  controls: Controls,
): RankedSkill[] {
  return skills
    .slice(0, controls.maxResults)
    .map((skill, index) => ({ ...skill, rank: index + 1 }));
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const child = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
  });
  let timedOut = false;
  const timer = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs)
    : undefined;
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (timedOut) throw new Error(`${command} timed out`);
    return { stdout, stderr, exitCode };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function searchCatalog(query: string): Promise<CatalogSkill[]> {
  const url = new URL("https://skills.sh/api/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "200");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        if (response.status >= 500 && attempt === 0) {
          await Bun.sleep(300);
          continue;
        }
        throw new Error(
          `${response.status} ${response.statusText}: catalog search`,
        );
      }
      const body = record(await response.json(), "catalog response");
      if (!Array.isArray(body.skills)) {
        throw new Error("Invalid catalog skill list");
      }
      return body.skills.map(parseCatalogSkill);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await Bun.sleep(300);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Catalog search failed");
}

export function extractJsonLdMetadata(
  html: string,
  fallbackTitle: string,
): SkillMetadata | null {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    let values: unknown[];
    if (Array.isArray(parsed)) {
      values = parsed;
    } else {
      const data = record(parsed, "JSON-LD");
      values = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
    }
    for (const value of values) {
      const item = record(value, "JSON-LD item");
      const type = item["@type"];
      const isSoftwareApplication =
        type === "SoftwareApplication" ||
        (Array.isArray(type) && type.includes("SoftwareApplication"));
      if (!isSoftwareApplication) continue;
      const title = normalizedText(
        typeof item.name === "string" ? item.name : fallbackTitle,
      );
      const description =
        typeof item.description === "string"
          ? normalizedText(item.description)
          : "";
      if (!title || !description) return null;
      return { title, description: description.slice(0, 1024) };
    }
  }
  return null;
}

async function fetchSkillMetadata(
  skill: CatalogSkill,
): Promise<SkillMetadata | null> {
  const path = skill.id
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  const response = await fetch(new URL(path, "https://skills.sh/"), {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: skill metadata`,
    );
  }
  return extractJsonLdMetadata(await response.text(), skill.name);
}

export async function search(
  query: string,
  controlsOverride?: Controls,
): Promise<{
  query: string;
  controls: Controls;
  rawCount: number;
  omittedWithoutDescription: number;
  candidates: DiscoveryCandidate[];
}> {
  const controls = controlsOverride ?? (await loadControls());
  const results = await searchCatalog(query);
  const ranked = rankSkills(results, controls);
  const metadata = await Promise.all(
    ranked.map((skill) => fetchSkillMetadata(skill).catch(() => null)),
  );
  const candidates = ranked.flatMap((skill, index) => {
    const value = metadata[index];
    if (!value) return [];
    return [
      { id: skill.id, title: value.title, description: value.description },
    ];
  });
  return {
    query,
    controls,
    rawCount: results.length,
    omittedWithoutDescription: ranked.length - candidates.length,
    candidates,
  };
}

export function parseSkillId(id: string): {
  source: string;
  skill: string;
  normalized: string;
} {
  const parts = id.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Invalid skill id");
  const skill = parts.pop()!;
  const source = parts.join("/");
  if (!source || !skill) throw new Error("Invalid skill id");
  return { source, skill, normalized: `${source}/${skill}` };
}

function expandHome(value: string): string {
  return value === "~"
    ? homedir()
    : value.startsWith("~/")
      ? join(homedir(), value.slice(2))
      : value;
}

function sanitizedSkillName(skill: string): string {
  const result = skill
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!result) throw new Error("Invalid skill name");
  return result;
}

function validateReviewId(value: string): string {
  if (!/^autoskills-review-[A-Za-z0-9]+$/.test(value)) {
    throw new Error("Invalid review id");
  }
  return value;
}

async function trashDirectory(path: string): Promise<boolean> {
  try {
    const result = await runCommand("trash", [path], { timeoutMs: 30_000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function createReviewRoot(): Promise<string> {
  const temporaryRoot = await realpath(tmpdir());
  return realpath(await mkdtemp(join(temporaryRoot, "autoskills-review-")));
}

async function collectFiles(
  directory: string,
  current = directory,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(directory, path)));
    } else if (entry.isFile()) {
      files.push(relative(directory, path));
    } else {
      throw new Error(`Unsupported review entry: ${path}`);
    }
  }
  return [...files].sort();
}

function frontmatterName(content: string, fallback: string): string {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const value = frontmatter
    ?.split(/\r?\n/)
    .find((line) => line.startsWith("name:"))
    ?.slice("name:".length)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  return value || fallback;
}

export async function discoverMaterializedSkill(
  reviewRoot: string,
): Promise<MaterializedSkill> {
  const canonicalRoot = await realpath(reviewRoot);
  const rootEntries = await readdir(canonicalRoot, { withFileTypes: true });
  const useEntries = rootEntries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("skills-use-"),
  );
  if (useEntries.length !== 1) {
    throw new Error("Unexpected review layout");
  }
  const useRoot = join(canonicalRoot, useEntries[0]!.name);
  const skillEntries = await readdir(useRoot, { withFileTypes: true });
  const skillDirectories = skillEntries.filter((entry) => entry.isDirectory());
  if (skillEntries.length !== 1 || skillDirectories.length !== 1) {
    throw new Error("Unexpected materialized skill layout");
  }
  const skillDir = await realpath(join(useRoot, skillDirectories[0]!.name));
  const skillPath = join(skillDir, "SKILL.md");
  const skillInfo = await lstat(skillPath);
  if (!skillInfo.isFile() || skillInfo.isSymbolicLink()) {
    throw new Error("Invalid materialized SKILL.md");
  }
  const content = await readFile(skillPath, "utf8");
  const files = await collectFiles(skillDir);
  const supportFiles = files.filter((file) => file !== "SKILL.md");
  return {
    reviewId: basename(canonicalRoot),
    reviewRoot: canonicalRoot,
    skillDir,
    skillPath,
    skillName: frontmatterName(content, basename(skillDir)),
    skillPathSha256: createHash("sha256").update(content).digest("hex"),
    files,
    hasWorkflowFiles: supportFiles.length > 0,
  };
}

async function cleanFailedReview(
  reviewRoot: string,
  error: unknown,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  if (await trashDirectory(reviewRoot)) throw new Error(message);
  throw new Error(`${message}; cleanup failed for ${reviewRoot}`);
}

async function useSkill(id: string): Promise<Review> {
  const parsed = parseSkillId(id);
  const reviewRoot = await createReviewRoot();
  let materialized: MaterializedSkill;
  let diagnostics = "";
  try {
    const result = await runCommand(
      "bunx",
      [...skillsCommand, "use", `${parsed.source}@${parsed.skill}`],
      {
        env: { ...skillsEnvironment, TMPDIR: reviewRoot },
        timeoutMs: 60_000,
      },
    );
    diagnostics = result.stderr.trim();
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() || result.stdout.trim() || "Could not read skill",
      );
    }
    materialized = await discoverMaterializedSkill(reviewRoot);
  } catch (error) {
    return cleanFailedReview(reviewRoot, error);
  }
  const catalogSkill = parseCatalogSkill({
    id: parsed.normalized,
    source: parsed.source,
    skillId: parsed.skill,
    name: materialized.skillName,
    installs: 0,
  });
  const metadata = await fetchSkillMetadata(catalogSkill).catch(() => null);
  const supportFiles = materialized.files.filter((file) => file !== "SKILL.md");
  return {
    schemaVersion: 1,
    reviewId: materialized.reviewId,
    skill: {
      id: parsed.normalized,
      name: materialized.skillName,
      title: metadata?.title ?? materialized.skillName,
      description: metadata?.description ?? "",
      skillPath: materialized.skillPath,
      skillPathSha256: materialized.skillPathSha256,
    },
    supportPath: supportFiles.length > 0 ? materialized.skillDir : null,
    files: materialized.files,
    hasWorkflowFiles: materialized.hasWorkflowFiles,
    storage: "os-temp",
    handoff: {
      approvedSkills: [
        {
          id: parsed.normalized,
          name: materialized.skillName,
          instructionsPath: materialized.skillPath,
          instructionsSha256: materialized.skillPathSha256,
        },
      ],
      rules: [
        "Read each exact approved instructionsPath before starting work.",
        "Keep the reviewed local temporary files available for the rest of the task.",
        "Use only skills listed in approvedSkills.",
        "Do not invoke AutoSkills or repeat discovery, search, review, or installation.",
        "Do not substitute an unapproved skill.",
        "Treat staged files as read-only and do not modify them.",
        "If an instructionsPath is unavailable or its digest changed, stop and report instead of rediscovering.",
      ],
    },
    diagnostics,
  };
}

export async function review(id: string) {
  return useSkill(id);
}

export async function cleanupReview(
  reviewId: string,
): Promise<{ reviewId: string; cleaned: boolean; reason?: string }> {
  const validated = validateReviewId(reviewId);
  const temporaryRoot = await realpath(tmpdir());
  const path = join(temporaryRoot, validated);
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(path);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      return { reviewId: validated, cleaned: false, reason: "already missing" };
    }
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Invalid review directory");
  }
  const canonicalPath = await realpath(path);
  if (dirname(canonicalPath) !== temporaryRoot) {
    throw new Error("Review directory escaped temporary root");
  }
  if (!(await trashDirectory(canonicalPath))) {
    throw new Error(`Could not move review to Trash: ${canonicalPath}`);
  }
  return { reviewId: validated, cleaned: true };
}

function parseInstallOutput(value: string): unknown[] {
  const clean = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("Invalid installer JSON output");
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("Expected one installer result");
  }
  return parsed;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return stringValue(value, label);
}

export function parseInstallResult(value: string): InstallResult {
  const item = record(parseInstallOutput(value)[0], "installer result");
  if (item.status !== "installed") throw new Error("Skill was not installed");
  if (item.scope !== "global") {
    throw new Error("Skill was not installed globally");
  }
  if (
    !Array.isArray(item.agents) ||
    !item.agents.every((agent) => typeof agent === "string")
  ) {
    throw new Error("Invalid installer agents");
  }
  return {
    name: stringValue(item.name, "installed skill name"),
    status: "installed",
    source: stringValue(item.source, "installed skill source"),
    ref: optionalString(item.ref, "installed skill ref"),
    hash: optionalString(item.hash, "installed skill hash"),
    path: stringValue(item.path, "installed skill path"),
    scope: "global",
    agents: item.agents,
    mode: optionalString(item.mode, "installed skill mode") ?? "unknown",
  };
}

async function installedPath(platform: string, skill: string): Promise<string> {
  const name = sanitizedSkillName(skill);
  if (platform === "claude-code") {
    const claudeRoot = expandHome(
      process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
    );
    return join(claudeRoot, "skills", name);
  }
  return join(homedir(), ".agents", "skills", name);
}

export function installArgs(
  skillDir: string,
  skillName: string,
  platform: string,
): string[] {
  return [
    ...skillsCommand,
    "add",
    skillDir,
    "--skill",
    skillName,
    "--global",
    "--agent",
    platform,
    "--copy",
    "--yes",
    "--json",
  ];
}

export function persistenceBlock(
  hasWorkflowFiles: boolean,
  persistMode: Controls["persistMode"],
): string | null {
  if (persistMode === "never") return "persistence disabled";
  if (persistMode === "workflow-only" && !hasWorkflowFiles) {
    return "markdown-only skill";
  }
  return null;
}

async function loadReview(reviewId: string): Promise<MaterializedSkill> {
  const validated = validateReviewId(reviewId);
  const temporaryRoot = await realpath(tmpdir());
  const reviewRoot = join(temporaryRoot, validated);
  const info = await lstat(reviewRoot);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Invalid review directory");
  }
  return discoverMaterializedSkill(reviewRoot);
}

export async function install(
  reviewId: string,
  platform: string,
  controlsOverride?: Controls,
) {
  if (
    platform !== "opencode" &&
    platform !== "claude-code" &&
    platform !== "codex"
  ) {
    throw new Error("Invalid platform");
  }
  const controls = controlsOverride ?? (await loadControls());
  const materialized = await loadReview(reviewId);
  const blocked = persistenceBlock(
    materialized.hasWorkflowFiles,
    controls.persistMode,
  );
  if (blocked) {
    return {
      persisted: false,
      reason: blocked,
      reviewId: materialized.reviewId,
    };
  }
  const expectedPath = await installedPath(platform, materialized.skillName);
  try {
    await lstat(expectedPath);
    return {
      persisted: false,
      reason: "already installed",
      path: expectedPath,
      reviewId: materialized.reviewId,
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") throw error;
  }
  const result = await runCommand(
    "bunx",
    installArgs(materialized.skillDir, materialized.skillName, platform),
    {
      env: skillsEnvironment,
      timeoutMs: 120_000,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        "Skill installation failed",
    );
  }
  const installResult = parseInstallResult(result.stdout);
  const normalizeAgent = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    !installResult.agents.some(
      (agent) => normalizeAgent(agent) === normalizeAgent(platform),
    )
  ) {
    throw new Error("Installer did not target the requested agent");
  }
  const [actualPath, canonicalExpectedPath] = await Promise.all([
    realpath(installResult.path),
    realpath(expectedPath),
  ]);
  if (resolve(actualPath) !== resolve(canonicalExpectedPath)) {
    throw new Error(
      `Installer path mismatch: expected ${expectedPath}, received ${installResult.path}`,
    );
  }
  return {
    persisted: true,
    path: actualPath,
    reviewId: materialized.reviewId,
    installResult,
  };
}

async function doctor() {
  const controls = await loadControls();
  const result = await runCommand("bunx", [...skillsCommand, "--version"], {
    env: skillsEnvironment,
    timeoutMs: 30_000,
  });
  return {
    ok: result.exitCode === 0,
    bun: Bun.version,
    platform: process.platform,
    trashAvailable: Bun.which("trash") !== null,
    controls,
    skillsCli:
      result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

async function main(): Promise<void> {
  const [command, ...args] = Bun.argv.slice(2);
  if (command === "search") {
    const query = args.join(" ").trim();
    if (query.length < 2) {
      throw new Error("Search query must contain at least 2 characters");
    }
    process.stdout.write(`${JSON.stringify(await search(query), null, 2)}\n`);
    return;
  }
  if (command === "review") {
    const [id] = args;
    if (!id) throw new Error("Usage: cli.ts review <skill-id>");
    process.stdout.write(`${JSON.stringify(await review(id), null, 2)}\n`);
    return;
  }
  if (command === "install") {
    const [reviewId, platform] = args;
    if (!reviewId || !platform) {
      throw new Error(
        "Usage: cli.ts install <review-id> <opencode|claude-code|codex>",
      );
    }
    process.stdout.write(
      `${JSON.stringify(await install(reviewId, platform), null, 2)}\n`,
    );
    return;
  }
  if (command === "cleanup") {
    const [reviewId] = args;
    if (!reviewId) throw new Error("Usage: cli.ts cleanup <review-id>");
    process.stdout.write(
      `${JSON.stringify(await cleanupReview(reviewId), null, 2)}\n`,
    );
    return;
  }
  if (command === "doctor") {
    const result = await doctor();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error("Usage: cli.ts <search|review|install|cleanup|doctor> ...");
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
