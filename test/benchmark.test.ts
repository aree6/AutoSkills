import { expect, test } from "bun:test";
import { evaluateCase, summarize } from "../scripts/benchmark";
import type { RankedSkill } from "../src/cli";

const testCase = {
  id: "testing",
  workflow: "testing",
  queries: ["testing"],
  referenceAny: ["owner/repository/testing"],
};

const candidates: RankedSkill[] = [
  {
    id: "owner/repository/testing",
    source: "owner/repository",
    skillId: "testing",
    name: "testing",
    installs: 20_000,
    rank: 1,
  },
  {
    id: "owner/repository/other",
    source: "owner/repository",
    skillId: "other",
    name: "other",
    installs: 15_000,
    rank: 2,
  },
];

test("benchmark measures install-ranked catalog coverage", () => {
  const metric = evaluateCase(testCase, [{ rawCount: 2, candidates }]);
  expect(metric.resultCount).toBe(2);
  expect(metric.referenceFound).toBe(true);
  expect(metric.topReference).toBe(true);
  expect(summarize([metric])).toEqual({
    queryCoverage: 1,
    referenceRecall: 1,
    topReferenceRate: 1,
    resultCount: 2,
  });
});

test("benchmark excludes cases without references from reference recall", () => {
  const metric = evaluateCase(
    { ...testCase, id: "architecture", referenceAny: [] },
    [{ rawCount: 1, candidates: [candidates[0]!] }],
  );
  expect(summarize([metric]).referenceRecall).toBe(0);
});
