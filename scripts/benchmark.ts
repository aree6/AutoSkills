import { loadControls, search, type RankedSkill } from "../src/cli";

type BenchmarkCase = {
  id: string;
  workflow: string;
  queries: string[];
  referenceAny: string[];
};

type CaseMetric = {
  id: string;
  workflow: string;
  rawCount: number;
  resultCount: number;
  minimumResultInstalls: number | null;
  topCandidate: string | null;
  topReference: boolean;
  referenceExpected: boolean;
  referenceFound: boolean;
  references: string[];
};

const configPath = new URL("../config/benchmark.json", import.meta.url);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Invalid ${label}`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value.map((item) => stringValue(item, label));
}

async function loadCases(): Promise<BenchmarkCase[]> {
  const value = record(await Bun.file(configPath).json(), "benchmark config");
  if (value.schemaVersion !== 1 || !Array.isArray(value.cases))
    throw new Error("Invalid benchmark schema");
  return value.cases.map((item) => {
    const entry = record(item, "benchmark case");
    return {
      id: stringValue(entry.id, "benchmark case id"),
      workflow: stringValue(entry.workflow, "benchmark workflow"),
      queries: stringArray(entry.queries, "benchmark queries"),
      referenceAny: stringArray(entry.referenceAny, "benchmark references"),
    };
  });
}

function mergeResults(results: RankedSkill[][]): RankedSkill[] {
  const byId = new Map<string, RankedSkill>();
  for (const result of results) {
    for (const skill of result) byId.set(skill.id, skill);
  }
  return [...byId.values()].sort(
    (a, b) => a.rank - b.rank || b.installs - a.installs,
  );
}

export function evaluateCase(
  testCase: BenchmarkCase,
  results: Array<{ rawCount: number; candidates: RankedSkill[] }>,
): CaseMetric {
  const candidates = mergeResults(results.map((result) => result.candidates));
  const referenceSet = new Set(testCase.referenceAny);
  const topCandidate = candidates[0]?.id ?? null;
  return {
    id: testCase.id,
    workflow: testCase.workflow,
    rawCount: results.reduce((total, result) => total + result.rawCount, 0),
    resultCount: candidates.length,
    minimumResultInstalls:
      candidates.length > 0
        ? Math.min(...candidates.map((skill) => skill.installs))
        : null,
    topCandidate,
    topReference: topCandidate !== null && referenceSet.has(topCandidate),
    referenceExpected: testCase.referenceAny.length > 0,
    referenceFound: candidates.some((skill) => referenceSet.has(skill.id)),
    references: candidates
      .filter((skill) => referenceSet.has(skill.id))
      .map((skill) => skill.id),
  };
}

export function summarize(cases: CaseMetric[]) {
  const referenceCases = cases.filter((item) => item.referenceExpected);
  const covered = cases.filter((item) => item.resultCount > 0).length;
  const referenceFound = cases.filter((item) => item.referenceFound).length;
  const topReference = cases.filter((item) => item.topReference).length;
  return {
    queryCoverage: cases.length === 0 ? 0 : covered / cases.length,
    referenceRecall:
      referenceCases.length === 0 ? 0 : referenceFound / referenceCases.length,
    topReferenceRate:
      referenceCases.length === 0 ? 0 : topReference / referenceCases.length,
    resultCount: cases.reduce((total, item) => total + item.resultCount, 0),
  };
}

async function main(): Promise<void> {
  const cases = await loadCases();
  const controls = await loadControls();
  const errors: string[] = [];
  const metrics: CaseMetric[] = [];
  for (const testCase of cases) {
    const results = [];
    for (const query of testCase.queries) {
      try {
        results.push(await search(query, controls));
      } catch (error) {
        errors.push(
          `${testCase.id} (${query}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    metrics.push(evaluateCase(testCase, results));
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        controls,
        caseCount: cases.length,
        queryCount: new Set(cases.flatMap((item) => item.queries)).size,
        errors,
        summary: summarize(metrics),
        cases: metrics,
      },
      null,
      2,
    )}\n`,
  );
  if (errors.length > 0) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
