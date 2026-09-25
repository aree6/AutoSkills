import { describe, expect, test } from "bun:test";
import {
  extractJsonLdMetadata,
  installArgs,
  parseCatalogSkill,
  parseControls,
  parseInstallResult,
  parseSkillId,
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
    source: id.split("/").slice(0, -1).join("/"),
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

describe("catalog discovery", () => {
  test("filters by installs without overriding semantic order", () => {
    const ranked = rankSkills(
      [
        skill("owner/first", 15_000),
        skill("community/too-small", 9_999),
        skill("owner/second", 500_000),
        skill("owner/third", 20_000),
      ],
      controls,
    );
    expect(ranked.map((item) => item.id)).toEqual([
      "owner/first",
      "owner/second",
      "owner/third",
    ]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  test("extracts only title and description from JSON-LD", () => {
    const html = `
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        name: "ignore",
      })}</script>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Research",
        description: "Investigate against primary sources.",
      })}</script>
    `;
    expect(extractJsonLdMetadata(html, "fallback")).toEqual({
      title: "Research",
      description: "Investigate against primary sources.",
    });
  });

  test("rejects incomplete JSON-LD metadata", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "SoftwareApplication",
      name: "No description",
    })}</script>`;
    expect(extractJsonLdMetadata(html, "fallback")).toBeNull();
  });

  test("parses stable skill ids", () => {
    expect(parseSkillId("mattpocock/skills/research")).toEqual({
      source: "mattpocock/skills",
      skill: "research",
      normalized: "mattpocock/skills/research",
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
});

test("installs the reviewed local snapshot globally", () => {
  expect(
    installArgs(
      "/tmp/autoskills-review-a/skills-use-b/research",
      "research",
      "opencode",
    ),
  ).toEqual([
    "skills@1.7.0",
    "add",
    "/tmp/autoskills-review-a/skills-use-b/research",
    "--skill",
    "research",
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
        source: "/tmp/review/example",
        ref: null,
        hash: "hash",
        path: "/tmp/example",
        scope: "global",
        agents: ["OpenCode"],
        mode: "copy",
      },
    ]),
  );
  expect(parsed.scope).toBe("global");
  expect(parsed.agents).toEqual(["OpenCode"]);
  expect(() =>
    parseInstallResult(
      JSON.stringify([
        {
          name: "example",
          status: "installed",
          source: "/tmp/review/example",
          ref: null,
          hash: null,
          path: "/tmp/example",
          scope: "project",
          agents: ["OpenCode"],
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
