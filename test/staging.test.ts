import { afterAll, afterEach, expect, test } from "bun:test";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupReview, discoverMaterializedSkill } from "../src/cli";

const temporaryPaths: string[] = [];
const testBin = await mkdtemp(join(tmpdir(), "autoskills-test-bin-"));
const testTrash = await mkdtemp(join(tmpdir(), "autoskills-test-trash-"));
const originalPath = process.env.PATH;
const originalTestTrash = process.env.AUTOSKILLS_TEST_TRASH;
const trashShim = join(testBin, "trash");
await writeFile(
  trashShim,
  '#!/bin/sh\nset -eu\nmv "$1" "$AUTOSKILLS_TEST_TRASH/"\n',
);
await chmod(trashShim, 0o755);
process.env.PATH = `${testBin}:${originalPath ?? ""}`;
process.env.AUTOSKILLS_TEST_TRASH = testTrash;

afterAll(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  if (originalTestTrash === undefined) delete process.env.AUTOSKILLS_TEST_TRASH;
  else process.env.AUTOSKILLS_TEST_TRASH = originalTestTrash;
});

async function createReview(
  skillName: string,
  files: Record<string, string> = {},
): Promise<string> {
  const reviewRoot = await mkdtemp(join(tmpdir(), "autoskills-review-"));
  temporaryPaths.push(reviewRoot);
  const skillDir = join(reviewRoot, "skills-use-test", skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: Test workflow.\n---\n\n# ${skillName}\n`,
  );
  for (const [path, content] of Object.entries(files)) {
    const target = join(skillDir, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  return reviewRoot;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  for (const path of temporaryPaths.splice(0)) {
    if (!(await exists(path))) continue;
    const child = Bun.spawn(["trash", path], {
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await child.exited).toBe(0);
  }
});

test("discovers an authoritative path for a markdown-only skill", async () => {
  const reviewRoot = await createReview("simple");
  const materialized = await discoverMaterializedSkill(reviewRoot);
  expect(materialized.reviewId).toMatch(/^autoskills-review-/);
  expect(materialized.skillName).toBe("simple");
  expect(materialized.files).toEqual(["SKILL.md"]);
  expect(materialized.hasWorkflowFiles).toBe(false);
  expect(materialized.skillPath.endsWith("/SKILL.md")).toBe(true);
  expect(materialized.skillPathSha256).toMatch(/^[a-f0-9]{64}$/);
});

test("discovers supporting files without relying on prompt markers", async () => {
  const reviewRoot = await createReview("workflow", {
    "references/REFERENCE.md": "reference",
    "scripts/run.sh": "echo run",
  });
  const materialized = await discoverMaterializedSkill(reviewRoot);
  expect(materialized.files).toEqual([
    "SKILL.md",
    join("references", "REFERENCE.md"),
    join("scripts", "run.sh"),
  ]);
  expect(materialized.hasWorkflowFiles).toBe(true);
});

test("fails closed on unexpected review layouts", async () => {
  const reviewRoot = await createReview("simple");
  await mkdir(join(reviewRoot, "skills-use-extra"));
  expect(discoverMaterializedSkill(reviewRoot)).rejects.toThrow(
    "Unexpected review layout",
  );
});

test("rejects symlinks inside staged skills", async () => {
  const reviewRoot = await createReview("simple");
  await symlink(
    join(reviewRoot, "skills-use-test", "simple", "SKILL.md"),
    join(reviewRoot, "skills-use-test", "simple", "linked.md"),
  );
  expect(discoverMaterializedSkill(reviewRoot)).rejects.toThrow(
    "Refusing symlink",
  );
});

test("cleans only a generated review id and remains idempotent", async () => {
  const reviewRoot = await createReview("simple");
  const reviewId = materializedId(reviewRoot);
  await expect(cleanupReview(reviewId)).resolves.toEqual({
    reviewId,
    cleaned: true,
  });
  await expect(cleanupReview(reviewId)).resolves.toEqual({
    reviewId,
    cleaned: false,
    reason: "already missing",
  });
  expect(reviewRoot).not.toBe("");
});

test("rejects cleanup traversal and arbitrary paths", async () => {
  expect(cleanupReview("../autoskills-review-x")).rejects.toThrow(
    "Invalid review id",
  );
  expect(cleanupReview("some-other-directory")).rejects.toThrow(
    "Invalid review id",
  );
});

function materializedId(path: string): string {
  return path.split("/").at(-1)!;
}
