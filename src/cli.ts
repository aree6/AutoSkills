import { lstat, readdir, realpath } from "node:fs/promises";
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
  minimumInstalls: number;
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

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type CommandOptions = {
  env?: Record<string, string>;
  timeoutMs?: number;
};

type Review = {
  source: string;
  skill: string;
  prompt: string;
  diagnostics: string;
  supportPath: string | null;
  hasWorkflowFiles: boolean;
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

export function parseControls(value: unknown): Controls {
  const item = record(value, "router controls");
  const allowed = new Set(["maxResults", "minimumInstalls", "persistMode"]);
  if (Object.keys(item).some((key) => !allowed.has(key))) {
    throw new Error("Unknown router control");
  }
  const persistMode = stringValue(item.persistMode, "persistMode");
  if (persistMode !== "never" && persistMode !== "workflow-only") {
    throw new Error("Invalid persistMode");
  }
  const controls: Controls = {
    maxResults: integerValue(item.maxResults, "maxResults"),
    minimumInstalls: integerValue(item.minimumInstalls, "minimumInstalls"),
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
  if (typeof item.description === "string" && item.description.length > 0)
    result.description = item.description;
  if (
    typeof item.summary === "string" &&
    item.summary.length > 0 &&
    result.description === undefined
  )
    result.description = item.summary;
  if (item.sourceType !== undefined)
    result.sourceType = stringValue(item.sourceType, "source type");
  if (item.installUrl !== undefined)
    result.installUrl = stringValue(item.installUrl, "install URL");
  if (item.url !== undefined) result.url = stringValue(item.url, "skill URL");
  return result;
}

export function rankSkills(
  skills: CatalogSkill[],
  controls: Controls,
): RankedSkill[] {
  return skills
    .map((skill, index) => ({ skill, index }))
    .filter(({ skill }) => skill.installs >= controls.minimumInstalls)
    .sort((a, b) => b.skill.installs - a.skill.installs || a.index - b.index)
    .slice(0, controls.maxResults)
    .map(({ skill }, index) => ({ ...skill, rank: index + 1 }));
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
      if (!Array.isArray(body.skills))
        throw new Error("Invalid catalog skill list");
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

export async function search(query: string, controlsOverride?: Controls) {
  const controls = controlsOverride ?? (await loadControls());
  const results = await searchCatalog(query);
  return {
    query,
    controls,
    rawCount: results.length,
    candidates: rankSkills(results, controls),
  };
}

export function extractSupportPath(output: string): string | null {
  const marker = "Supporting files for this skill were downloaded to:";
  const index = output.lastIndexOf(marker);
  if (index < 0) return null;
  const match = output.slice(index + marker.length).match(/\r?\n([^\r\n]+)/);
  return match?.[1]?.trim() || null;
}

async function validateSupportPath(
  value: string | null,
): Promise<string | null> {
  if (!value || !isAbsolute(value)) return null;
  try {
    const [root, supportPath] = await Promise.all([
      realpath(tmpdir()),
      realpath(value),
    ]);
    const relativePath = relative(root, supportPath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) return null;
    if (!basename(dirname(supportPath)).startsWith("skills-use-")) return null;
    return supportPath;
  } catch {
    return null;
  }
}

async function useSkill(source: string, skill: string): Promise<Review> {
  const result = await runCommand(
    "bunx",
    [...skillsCommand, "use", `${source}@${skill}`],
    { env: skillsEnvironment, timeoutMs: 60_000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "Could not read skill",
    );
  }
  const extractedSupportPath = extractSupportPath(result.stdout);
  const supportPath = await validateSupportPath(extractedSupportPath);
  const entries = supportPath ? await readdir(supportPath) : [];
  const diagnostics = [
    result.stderr.trim(),
    extractedSupportPath && !supportPath ? "Ignored invalid support path" : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    source,
    skill,
    prompt: result.stdout.trim(),
    diagnostics,
    supportPath,
    hasWorkflowFiles: entries.some((entry) => entry !== "SKILL.md"),
  };
}

export async function review(source: string, skill: string) {
  return useSkill(source, skill);
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
  if (item.scope !== "global")
    throw new Error("Skill was not installed globally");
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
  source: string,
  skill: string,
  platform: string,
): string[] {
  return [
    ...skillsCommand,
    "add",
    `${source}@${skill}`,
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

export async function install(
  source: string,
  skill: string,
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
  const reviewed = await useSkill(source, skill);
  const blocked = persistenceBlock(
    reviewed.hasWorkflowFiles,
    controls.persistMode,
  );
  if (blocked) {
    return {
      persisted: false,
      reason: blocked,
      review: reviewed,
    };
  }
  const expectedPath = await installedPath(platform, skill);
  try {
    await lstat(expectedPath);
    return {
      persisted: false,
      reason: "already installed",
      path: expectedPath,
      review: reviewed,
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
    installArgs(source, skill, platform),
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
    review: reviewed,
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
    controls,
    skillsCli:
      result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

async function main(): Promise<void> {
  const [command, ...args] = Bun.argv.slice(2);
  if (command === "search") {
    const query = args.join(" ").trim();
    if (query.length < 2)
      throw new Error("Search query must contain at least 2 characters");
    process.stdout.write(`${JSON.stringify(await search(query), null, 2)}\n`);
    return;
  }
  if (command === "review") {
    const [source, skill] = args;
    if (!source || !skill)
      throw new Error("Usage: cli.ts review <source> <skill>");
    process.stdout.write(
      `${JSON.stringify(await review(source, skill), null, 2)}\n`,
    );
    return;
  }
  if (command === "install") {
    const [source, skill, platform] = args;
    if (!source || !skill || !platform) {
      throw new Error(
        "Usage: cli.ts install <source> <skill> <opencode|claude-code|codex>",
      );
    }
    process.stdout.write(
      `${JSON.stringify(await install(source, skill, platform), null, 2)}\n`,
    );
    return;
  }
  if (command === "doctor") {
    const result = await doctor();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error("Usage: cli.ts <search|review|install|doctor> ...");
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
