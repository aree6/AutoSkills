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

const noOmissions = { unreachable: 0, incompleteMetadata: 0 };

test("benchmark measures semantic metadata coverage", () => {
  const metric = evaluateCase(testCase, [
    { rawCount: 2, candidates, omitted: noOmissions, diagnosis: null },
  ]);
  expect(metric.resultCount).toBe(2);
  expect(metric.referenceFound).toBe(true);
  expect(metric.topReference).toBe(true);
  expect(summarize([metric])).toEqual({
    queryCoverage: 1,
    referenceRecall: 1,
    topReferenceRate: 1,
    resultCount: 2,
    omitted: noOmissions,
    diagnosed: 0,
  });
});

test("benchmark excludes cases without references from reference recall", () => {
  const metric = evaluateCase(
    { ...testCase, id: "architecture", referenceAny: [] },
    [
      {
        rawCount: 1,
        candidates: [candidates[0]!],
        omitted: noOmissions,
        diagnosis: null,
      },
    ],
  );
  expect(summarize([metric]).referenceRecall).toBe(0);
});

test("benchmark keeps unreachable and incomplete omissions apart", () => {
  const metric = evaluateCase(testCase, [
    {
      rawCount: 5,
      candidates: [candidates[0]!],
      omitted: { unreachable: 2, incompleteMetadata: 1 },
      diagnosis: "upstream metadata gap",
    },
  ]);
  expect(metric.omitted).toEqual({ unreachable: 2, incompleteMetadata: 1 });
  expect(summarize([metric]).diagnosed).toBe(1);
});
