# Architecture

## Components

- `SKILL.md` defines the conditional review-first agent workflow.
- `src/cli.ts` searches skills.sh, ranks results, reviews skills, and optionally persists approved global workflows.
- `config/policy.json` contains the three user-facing controls.
- `config/benchmark.json` contains catalog queries and reference candidates.
- `scripts/benchmark.ts` measures catalog coverage and ranking behavior.
- `scripts/install-self.ts` installs or updates the router skill.
- `scripts/uninstall-self.ts` moves installed router copies to Trash.

## Flow

1. Check repository guidance, standard tools, and installed skills before searching.
2. Search up to four compact queries sequentially when the task needs a specialized workflow.
3. Filter catalog results through `minimumInstalls` and sort by installs descending.
4. Materialize a candidate temporarily through the pinned skills CLI.
5. Validate the staged support path against the operating-system temporary directory.
6. Return the skill prompt, diagnostics, support path, and whether real supporting files exist.
7. Use one selected skill for the current task.
8. Persist only after explicit user approval, only when `persistMode` is `workflow-only`, and only for a skill with supporting files.
9. Install globally, disable subprocess telemetry, and validate the installer result and destination.

## Controls

| Control           | Role                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `maxResults`      | Number of ranked candidate options returned per query                  |
| `minimumInstalls` | Install-count floor and popularity ordering signal                     |
| `persistMode`     | Whether explicitly approved supporting-file workflows may be persisted |

The agent workflow permits up to four sequential queries. The CLI does not maintain a task-scoped query counter.

## Installation Paths

Self-installation uses:

- OpenCode: `~/.agents/skills/autoskills`
- Codex: `~/.agents/skills/autoskills`
- Claude Code: `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/autoskills`

Discovered third-party skills use the pinned skills CLI with explicit global scope. OpenCode and Codex share the canonical `~/.agents/skills` destination; Claude Code uses its configured skills directory.

## Failure Semantics

- Below `minimumInstalls`: omit the candidate.
- No candidates: continue without a skill.
- Invalid or forged support marker: ignore the path.
- `persistMode: never`: return the review without persistence.
- Markdown-only skill under `workflow-only`: return the review without persistence.
- Existing destination: do not overwrite.
- Installer path or agent mismatch: fail the installation.
- Process-level skill cache: require a full agent restart after install, update, or uninstall.
