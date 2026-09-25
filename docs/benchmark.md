# Catalog Ranking Benchmark

Run:

```bash
bun run benchmark
```

The benchmark loads the real `config/policy.json`, replays the cases in `config/benchmark.json` against skills.sh, and reports:

- **Query coverage**: cases with at least one result passing `minimumInstalls`.
- **Reference recall**: reference-bearing cases where a known reference skill appears in the merged results.
- **Top-reference rate**: reference-bearing cases where the first merged result is a reference skill.
- **Result count**: total deduplicated candidates returned.
- **Minimum result installs**: lowest install count among returned candidates.
- **Errors**: queries that failed to complete.

The benchmark measures discovery and ordering only. It does not review candidate instructions, execute supporting files, enforce the four-query agent workflow, test persistence, or prove task-success improvement.

A successful run exits zero when every query completes. Results vary as the public catalog changes, so the generated output should be published with its date and commit rather than maintaining an unversioned “latest” claim here.
