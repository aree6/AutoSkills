import { expect, test } from "bun:test";

const skill = await Bun.file(new URL("../SKILL.md", import.meta.url)).text();
const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

test("skill requires metadata-first discovery", () => {
  expect(skill).toContain("Treat `search` as a metadata-only discovery pass");
  expect(skill).toContain("Do not review every candidate");
  expect(skill).toContain("Read the returned `skill.skillPath` directly");
});

test("skill requires an exact approved-skill handoff", () => {
  expect(skill).toContain("## Skill Handoff");
  expect(skill).toContain("Use only skills listed in Approved skills");
  expect(skill).toContain(
    "Do not invoke AutoSkills or repeat discovery, search, review, or installation",
  );
  expect(skill).toContain(
    "The Approved skills list may contain one or more entries",
  );
});

test("skill assigns temporary cleanup to the main agent", () => {
  expect(skill).toContain("The main agent exclusively owns cleanup");
  expect(skill).toContain("Subagents must never run `cleanup`");
  expect(skill).toContain(
    'bun "$AUTOSKILL_ROOT/src/cli.ts" cleanup "<review-id>"',
  );
});

test("README starts with how it works and orders core sections", () => {
  expect(readme.startsWith("# How It Works\n")).toBe(true);
  const discovery = readme.indexOf("## Discovery");
  const installation = readme.indexOf("## Installation");
  const commands = readme.indexOf("## Commands");
  const policy = readme.indexOf("## Policy");
  const privacy = readme.indexOf("## Privacy and Trust");
  expect(discovery).toBeGreaterThan(0);
  expect(discovery).toBeLessThan(installation);
  expect(installation).toBeLessThan(commands);
  expect(commands).toBeLessThan(policy);
  expect(policy).toBeLessThan(privacy);
});
