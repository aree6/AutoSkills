import { describe, expect, test } from "bun:test";
import {
  extractSupportPath,
  installArgs,
  parseCatalogSkill,
  parseControls,
  parseInstallResult,
  persistenceBlock,
  rankSkills,
  type CatalogSkill,
} from "../src/cli";

const controls = parseControls({
  maxResults: 4,
  minimumInstalls: 10_000,
  persistMode: "never",
});

function skill(id: string, installs: number): CatalogSkill {
  return {
    id,
    source: id.split("/").slice(0, 2).join("/"),
    skillId: id.split("/").at(-1)!,
    name: id.split("/").at(-1)!,
    installs,
  };
}

describe("router controls", () => {
  test("keeps the three-control contract", () => {
    expect(controls).toEqual({
      maxResults: 4,
      minimumInstalls: 10_000,
      persistMode: "never",
    });
  });

  test("rejects unsupported persistence modes", () => {
    expect(() =>
      parseControls({ ...controls, persistMode: "always-install" }),
    ).toThrow();
  });

  test("rejects unknown controls", () => {
    expect(() => parseControls({ ...controls, maxQueries: 4 })).toThrow();
  });
});

describe("catalog ranking", () => {
  test("filters by installs, sorts descending, and caps results", () => {
    const ranked = rankSkills(
      [
        skill("community/one", 9_999),
        skill("owner/two", 10_000),
        skill("owner/three", 50_000),
        skill("owner/four", 20_000),
        skill("owner/five", 15_000),
        skill("owner/six", 12_000),
      ],
      controls,
    );
    expect(ranked.map((item) => item.id)).toEqual([
      "owner/three",
      "owner/four",
      "owner/five",
      "owner/six",
    ]);
    expect(ranked[0]?.rank).toBe(1);
  });

  test("keeps non-official catalog sources because no owner filter is applied", () => {
    const source = skill("community.example/skill", 20_000);
    const ranked = rankSkills([source], controls);
    expect(ranked[0]?.source).toBe("community.example/skill");
  });

  test("uses catalog order for equal install counts", () => {
    const ranked = rankSkills(
      [skill("owner/first", 10_000), skill("owner/second", 10_000)],
      controls,
    );
    expect(ranked.map((item) => item.skillId)).toEqual(["first", "second"]);
  });
});

test("parses optional catalog descriptions and defaults missing installs", () => {
  const parsed = parseCatalogSkill({
    id: "owner/repo/skill",
    source: "owner/repo",
    skillId: "skill",
    name: "Skill",
    installs: 12_345,
    description: "A useful workflow",
  });
  expect(parsed.description).toBe("A useful workflow");
  expect(parsed.installs).toBe(12_345);
});

test("uses the final support marker", () => {
  const output = [
    "Supporting files for this skill were downloaded to:",
    "/tmp/not-a-skill-use-directory",
    "Supporting files for this skill were downloaded to:",
    "/tmp/skills-use-123/example",
  ].join("\n");
  expect(extractSupportPath(output)).toBe("/tmp/skills-use-123/example");
});

test("installs selected skills globally", () => {
  expect(installArgs("owner/repo", "example", "opencode")).toEqual([
    "skills@1.7.0",
    "add",
    "owner/repo@example",
    "--global",
    "--agent",
    "opencode",
    "--copy",
    "--yes",
    "--json",
  ]);
});

test("parses and validates the global installer result", () => {
  const parsed = parseInstallResult(
    JSON.stringify([
      {
        name: "example",
        status: "installed",
        source: "owner/repo",
        ref: "abc123",
        hash: "hash",
        path: "/tmp/example",
        scope: "global",
        agents: ["opencode"],
        mode: "copy",
      },
    ]),
  );
  expect(parsed.scope).toBe("global");
  expect(parsed.agents).toEqual(["opencode"]);
  expect(() =>
    parseInstallResult(
      JSON.stringify([
        {
          name: "example",
          status: "installed",
          source: "owner/repo",
          ref: null,
          hash: null,
          path: "/tmp/example",
          scope: "project",
          agents: ["opencode"],
          mode: "copy",
        },
      ]),
    ),
  ).toThrow();
});

test("enforces the persistence policy matrix", () => {
  expect(persistenceBlock(true, "never")).toBe("persistence disabled");
  expect(persistenceBlock(false, "workflow-only")).toBe("markdown-only skill");
  expect(persistenceBlock(true, "workflow-only")).toBeNull();
  expect(() => parseControls({ ...controls, persistMode: "always" })).toThrow();
});
