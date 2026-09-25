import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const platform = process.argv[2];
const includeDisabled = process.argv.slice(3).includes("--include-disabled");
const platforms = new Set(["opencode", "claude-code", "codex"]);

if (!platforms.has(platform)) {
  throw new Error(
    "Usage: bun scripts/uninstall-self.ts <opencode|claude-code|codex> [--include-disabled]",
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
  const child = Bun.spawn(["trash", path], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await child.exited) === 0;
}

function expandHome(value: string): string {
  return value === "~"
    ? homedir()
    : value.startsWith("~/")
      ? join(homedir(), value.slice(2))
      : value;
}

const home = homedir();
const activePath =
  platform === "claude-code"
    ? join(
        expandHome(process.env.CLAUDE_CONFIG_DIR ?? join(home, ".claude")),
        "skills",
        "autoskills",
      )
    : join(home, ".agents", "skills", "autoskills");
const paths = [
  activePath,
  ...(includeDisabled
    ? [join(home, ".agents", "disabled-skills", "autoskills")]
    : []),
];
const removed: string[] = [];
const missing: string[] = [];

for (const path of paths) {
  if (!(await exists(path))) {
    missing.push(path);
    continue;
  }
  if (!(await trashPath(path))) {
    throw new Error(`Could not move skill to Trash: ${path}`);
  }
  removed.push(resolve(path));
}

process.stdout.write(
  `${JSON.stringify(
    {
      platform,
      removed,
      missing,
      restartRequired: true,
      verify: "opencode debug skill",
    },
    null,
    2,
  )}\n`,
);
