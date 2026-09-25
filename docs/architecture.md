# Architecture

## Components

- `SKILL.md` defines metadata-first discovery, selective review, delegation handoff, and cleanup rules.
- `src/cli.ts` searches skills.sh, enriches public page metadata, stages selected reviews, optionally persists approved snapshots, and cleans temporary reviews.
- `config/policy.json` contains the three user-facing controls.
- `config/benchmark.json` contains catalog queries and reference candidates.
- `scripts/benchmark.ts` measures metadata discovery and semantic ordering.
- `scripts/install-self.ts` installs or updates the router skill.
- `scripts/uninstall-self.ts` moves installed router copies to Trash.

## Discovery Flow

1. Check repository guidance, standard tools, and installed skills before searching.
2. Search up to four compact queries sequentially when the task needs a specialized workflow.
3. Preserve skills.sh semantic result order.
4. Apply `minimumInstalls` as an eligibility filter without re-sorting.
5. Read public JSON-LD metadata for the short candidate list.
6. Return only an opaque id, title, and description.
7. Select from metadata or make a more focused query.
8. Do not materialize or review the full skill until a candidate is chosen.

The authenticated v1 API is not used because it requires Vercel OIDC. AutoSkills uses the existing public search endpoint and public skill-page JSON-LD so local metadata enrichment remains credential-free.

## Review Flow

1. Parse one selected catalog id into source and skill id.
2. Create an `autoskills-review-*` directory under the canonical OS temporary directory.
3. Pass that directory to `skills@1.7.0 use` as `TMPDIR`.
4. Require exactly one generated `skills-use-*` directory and one materialized skill directory.
5. Validate the exact `SKILL.md`, reject symlinks and unexpected layouts, and calculate its SHA-256 digest.
6. Return the review id, exact instruction path, digest, support files, and handoff metadata.
7. Keep the full body out of the review command result; the main agent reads the exact path after selection.

## Delegation Flow

The main agent adds repository and task context to the review's approved-skill handoff. A subagent must read the exact approved path and use only the listed skills. Subagents cannot invoke AutoSkills, repeat discovery, substitute skills, modify staged files, or clean the review.

The approved set may contain one or more skills. AutoSkills does not impose a quantity.

## Temporary Lifecycle

- The main agent owns cleanup.
- Rejected reviews are cleaned immediately.
- Selected reviews remain until all consumers are terminal.
- Cleanup accepts only a generated `autoskills-review-*` id that resolves directly beneath the OS temporary root.
- Cleanup moves the exact directory to Trash and never uses permanent deletion.

## Persistence Flow

Persistence remains disabled by default. When explicitly enabled and approved, installation uses the already-reviewed staged directory rather than fetching the source again. The installer uses global scope, disables subprocess telemetry, and validates the returned path and requested agent.

## Controls

| Control           | Role                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `maxResults`      | Maximum metadata candidates returned per query                         |
| `minimumInstalls` | Install-count eligibility floor, not a relevance score                 |
| `persistMode`     | Whether explicitly approved supporting-file workflows may be persisted |

The agent workflow permits up to four sequential queries. The CLI does not maintain a task-scoped query counter.

## Failure Semantics

- Missing title or description metadata: omit the candidate.
- No credible metadata candidate: refine the query.
- Unexpected review layout or symlink: fail closed and clean the review.
- Invalid review id or escaped path: refuse cleanup.
- Missing review directory: cleanup succeeds idempotently.
- `persistMode: never`: return without persistence.
- Markdown-only skill under `workflow-only`: return without persistence.
- Existing installation destination: do not overwrite.
- Installer path or agent mismatch: fail the installation.
- Process-level skill cache: require a full agent restart after install, update, or uninstall.
