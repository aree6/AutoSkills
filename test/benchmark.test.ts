import { expect, test } from "bun:test";
import { evaluateCase, summarize } from "../scripts/benchmark";
import type { DiscoveryCandidate } from "../src/cli";

const testCase = {
  id: "testing",
  workflow: "testing",
  queries: ["testing"],
  referenceAny: ["owner/repository/testing"],
};

const candidates: DiscoveryCandidate[] = [
  {
    id: "owner/repository/testing",
    title: "Testing",
    description: "Test software reliably.",
  },
  {
    id: "owner/repository/other",
    title: "Other",
    description: "Another workflow.",
  },
];

test("benchmark measures semantic metadata coverage", () => {
  const metric = evaluateCase(testCase, [
    { rawCount: 2, omittedWithoutDescription: 0, candidates },
  ]);
  expect(metric.resultCount).toBe(2);
  expect(metric.referenceFound).toBe(true);
  expect(metric.topReference).toBe(true);
  expect(summarize([metric])).toEqual({
    queryCoverage: 1,
    referenceRecall: 1,
    topReferenceRate: 1,
    resultCount: 2,
    omittedWithoutDescription: 0,
  });
});

test("benchmark excludes cases without references from reference recall", () => {
  const metric = evaluateCase(
    { ...testCase, id: "architecture", referenceAny: [] },
    [
      {
        rawCount: 1,
        omittedWithoutDescription: 0,
        candidates: [candidates[0]!],
      },
    ],
  );
  expect(summarize([metric]).referenceRecall).toBe(0);
});
