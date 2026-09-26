# Metadata Discovery Benchmark

Run:

```bash
bun run benchmark
```

The benchmark loads the real `config/policy.json`, replays the cases in `config/benchmark.json`, and reports:

- **Query coverage**: cases with at least one title-and-description candidate.
- **Reference recall**: reference-bearing cases where a known reference skill appears in semantic order.
- **Top-reference rate**: reference-bearing cases where the first semantic result is a reference skill.
- **Result count**: total deduplicated metadata candidates.
- **Description omissions**: candidates omitted because public metadata could not supply both title and description.
- **Errors**: queries that failed to complete.

The benchmark measures discovery and ordering only. It does not materialize candidates, review full instructions, test handoffs, or prove task-success improvement.

A successful run exits zero when every query completes. Results vary as the public catalog and pages change, so generated output should be published with its date and commit rather than maintaining an unversioned “latest” claim here.
