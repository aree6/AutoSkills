---
name: autoskills
description: >-
  Use ONLY when a task needs specialized procedural knowledge not covered by repository guidance, standard tools, or installed skills; discover skills from skills.sh using title and description metadata only, fully review only the chosen skills, hand delegated subagents the exact approved names and local instruction paths so they never repeat discovery, use no skills outside that approved set, and load selected skills locally in the OS temporary directory for reuse across task continuations.
license: MIT
metadata:
  author: autoskills
  version: "0.4.1"
---

# AutoSkills

Resolve the directory containing this file as `AUTOSKILL_ROOT`. Run `bun "$AUTOSKILL_ROOT/src/cli.ts" ...` for every command.

## Workflow

1. Search only when a concrete task needs specialized procedural knowledge that repository guidance, standard tools, and already-installed skills do not adequately cover.
2. Use an already-installed skill when one clearly applies.
3. Otherwise derive two short queries as a pair. Do not copy the user's request verbatim.
4. Run both in the same message so they run in parallel:

```bash
bun "$AUTOSKILL_ROOT/src/cli.ts" search "<artifact-query>"
bun "$AUTOSKILL_ROOT/src/cli.ts" search "<ecosystem-or-adjacent-concept-query>"
```

5. Treat `search` as a metadata-only discovery pass. Its candidates contain only an opaque skill id, title, and description. Do not review every candidate and do not load their full instructions merely to choose.
6. If a search returns no candidate, read its `diagnosis` before writing another query. A diagnosis that reports a load failure or a metadata gap is an upstream problem: do not rewrite the query in response to it. Only rewrite the query when the diagnosis says the catalog matched nothing.
7. Judge both result sets together. Deduplicate ids across the two, then select the candidate whose title and description best match the task. The two queries usually return disjoint skills, so a strong candidate is often present in only one of them.
8. If no candidate is credible, run one more pair of two queries and judge the union again. Stop when a credible candidate is available or four queries have been used.
9. Review only the chosen candidate:

```bash
bun "$AUTOSKILL_ROOT/src/cli.ts" review "<skill-id>"
```

10. Read the returned `skill.skillPath` directly. The selected skill is loaded locally inside the OS temporary directory. Keep the returned `reviewId`, path, and digest available for the rest of the logical task, including plan mode, summaries, permission waits, and `continue`. If the chosen skill is not suitable, do not approve it and choose another candidate.
11. Use only the reviewed and approved skills. When delegating, provide the mandatory skill handoff below.
12. Do not persist a selected skill automatically. Only after explicit user approval, and only when `persistMode` is `workflow-only`, install a selected reviewed workflow:

```bash
bun "$AUTOSKILL_ROOT/src/cli.ts" install "<review-id>" "<opencode|claude-code|codex>"
```

## Skill Handoff

Whenever a task is delegated after discovery, include the selected review's `handoff.approvedSkills` entries and add this repository briefing:

```markdown
## Skill Handoff

Repository:

- Root: <absolute repository root>
- Working directory: <absolute working directory>
- Branch and revision: <branch and HEAD when available>

Task:

- <delegated objective>
- <relevant files and repository context>
- <scope, constraints, and expected result>

Approved skills:

- <exact skill name> — <absolute SKILL.md path> — SHA-256 <digest>

Rules:

- Read each exact approved instruction path before starting work.
- Keep the reviewed local temporary files available for the rest of the task.
- Use only skills listed in Approved skills.
- Do not invoke AutoSkills or repeat discovery, search, review, or installation.
- Do not substitute an unapproved skill.
- Treat staged files as read-only and do not modify them.
- If an instruction path is unavailable or its digest changed, stop and report instead of rediscovering.
```

The Approved skills list may contain one or more entries. Select only from that list. The main agent must not ask a subagent to choose an unapproved skill.

## Local Temporary Storage

- `review` loads the selected skill locally inside the OS temporary directory.
- Keep the exact returned `reviewId`, `skillPath`, and digest for the logical task.
- Reuse them after plan mode, a summary, a permission wait, or `continue`; do not search again.
- Keep the local review unchanged during normal task execution.

## Query Construction

The catalog groups results into semantic clusters and ranks each cluster by install count. A query therefore picks a cluster first, then inherits that cluster's popular members. Query the concrete artifact the task is about. Do not restate the task, its goal, or its quality bar.

- Use two or three content words naming the artifact: `skeleton loading`, `loading states`, `code review`.
- Never append an umbrella word such as `performance`, `speed`, `optimization`, `UX`, `UI`, `best practices`, or `architecture`. Each is a high-volume magnet that recruits a large cluster, and one is enough to evict every relevant candidate.
- Never send punctuation-separated tags such as `skeleton, loading, shimmer`. The catalog matches the whole query string, so commas collapse the results to a single unrelated skill.
- Keep ecosystem terms out of the first query. Appending scope narrows hard: `skeleton loading react web` returns 3 results where `skeleton loading` returns 148. Use the ecosystem as its own later query instead.
- Never spend a query on word order. `skeleton loading` and `loading skeleton` return equivalent results.
- Judge candidates on description text alone. Descriptions name concrete techniques, platforms, and latency budgets, so a plainly named skill can be exact and a popular one can be irrelevant.
- Spend the next query on a different word for the same artifact, or on the ecosystem. Never lengthen the sentence.
- Pair one artifact query with one ecosystem or adjacent-concept query. Complementary phrasings return disjoint catalogs, so a pair costs the same budget as two sequential attempts but samples twice as many skills.

Never exceed four queries for one task, issued as at most two parallel pairs. Stop early when a candidate is satisfactory. Do not treat a zero-result query as proof that no relevant skill exists.

### Query Examples

| User request                                  | First query                | Next query if needed   |
| --------------------------------------------- | -------------------------- | ---------------------- |
| Make a dashboard feel faster while data loads | `skeleton loading`         | `loading states`       |
| Debug failing tests in a React application    | `jest playwright`          | `react testing`        |
| Write technical documentation for an API      | `API documentation`        | `technical writing`    |
| Review a pull request for bugs                | `pull request code review` | `code review`          |
| Deploy an application to production           | `production deployment`    | `container deployment` |
| Improve and refactor a codebase               | `codebase architecture`    | `system design`        |

## Rules

- Judge candidates only on title and description relevance; preserve skills.sh semantic result order.
- Never include secrets, private code, customer data, or internal URLs in search queries.
- Install only explicitly approved reviewed skills.
- Never overwrite an existing skill.
- Never persist a skill without explicit user approval.
- Do not install a markdown-only skill; use its reviewed instructions for the current task.
- Use the positional platform argument in OpenCode, Claude Code, or Codex.

## Uninstall

From the source checkout, move the installed copy to Trash:

```bash
bun scripts/uninstall-self.ts opencode
bun scripts/uninstall-self.ts claude-code
bun scripts/uninstall-self.ts codex
```

Add `--include-disabled` to also remove `~/.agents/disabled-skills/autoskills`. If the source checkout is unavailable, move each existing installed directory to Trash manually:

```bash
for path in \
  "$HOME/.agents/skills/autoskills" \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/autoskills"
do
  [ ! -e "$path" ] || trash "$path"
done
```

Fully terminate every OpenCode process before removal, then launch a new process. Starting a new chat or session is not sufficient because OpenCode caches its skill catalog at startup. Verify the result with:

```bash
opencode debug skill
```

These commands remove installed copies, not the source checkout or separately discovered third-party skills.
