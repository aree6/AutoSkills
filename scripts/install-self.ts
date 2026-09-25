import { lstat, mkdir, mkdtemp, readdir, realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.argv[2];
const skill = "autoskills";
const platforms = new Set(["opencode", "claude-code", "codex"]);

if (!platforms.has(platform)) {
  throw new Error(
    "Usage: bun scripts/install-self.ts <opencode|claude-code|codex>",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") return false;
    throw error;
  }
}

async function trashPath(path: string): Promise<boolean> {
  try {
    const child = Bun.spawn(["trash", path], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return (await child.exited) === 0;
  } catch {
    return false;
  }
}

async function copyEntry(source: string, destination: string): Promise<void> {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink: ${source}`);
  if (info.isDirectory()) {
    await mkdir(destination);
    for (const entry of await readdir(source)) {
      await copyEntry(join(source, entry), join(destination, entry));
    }
  } else if (info.isFile()) {
    await Bun.write(destination, Bun.file(source));
  } else {
    throw new Error(`Unsupported source entry: ${source}`);
  }
}

function expandHome(value: string): string {
  return value === "~"
    ? homedir()
    : value.startsWith("~/")
      ? join(homedir(), value.slice(2))
      : value;
}

async function validateDirectoryPath(path: string): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of relative(root, absolute).split(sep)) {
    current = join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`Invalid global skill path: ${current}`);
    }
  }
}

async function targetPath(): Promise<string> {
  const home = await realpath(homedir());
  const parent =
    platform === "claude-code"
      ? join(
          resolve(
            expandHome(process.env.CLAUDE_CONFIG_DIR ?? join(home, ".claude")),
          ),
          "skills",
        )
      : join(home, ".agents", "skills");
  await mkdir(parent, { recursive: true });
  const canonicalParent = await realpath(parent);
  await validateDirectoryPath(canonicalParent);
  return join(canonicalParent, skill);
}

const staging = await realpath(
  await mkdtemp(join(tmpdir(), "autoskills-self-")),
);
let target: string | undefined;
let reserved = false;
let replaced = false;

try {
  target = await targetPath();
  if (await exists(target)) {
    if (!(await trashPath(target))) {
      throw new Error(`Could not move existing skill to Trash: ${target}`);
    }
    replaced = true;
  }
  await mkdir(target);
  reserved = true;
  for (const entry of ["SKILL.md", "src", "config", "LICENSE"]) {
    await copyEntry(join(root, entry), join(target, entry));
  }
  const stagingTrashed = await trashPath(staging);
  process.stdout.write(
    `${JSON.stringify(
      { path: target, platform, replaced, stagingTrashed },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  const cleanupPaths = [staging, ...(target && reserved ? [target] : [])];
  const cleanupFailures: string[] = [];
  for (const path of cleanupPaths) {
    if (await exists(path)) {
      if (!(await trashPath(path))) cleanupFailures.push(path);
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (cleanupFailures.length > 0) {
    throw new Error(
      `${message}; cleanup failed for ${cleanupFailures.join(", ")}`,
    );
  }
  throw new Error(message);
}
