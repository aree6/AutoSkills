# Selection Policy

AutoSkills uses a small, explicit policy so catalog popularity does not silently become an instruction or installation decision.

## Activation Gate

Search only when a concrete task needs specialized procedural knowledge that repository guidance, standard tools, and already-installed skills do not adequately cover. When that gate is uncertain, proceed without searching.

Queries must not contain secrets, private code, customer data, or internal URLs.

## Candidate Gate

A result is eligible when its skills.sh install count is at least `minimumInstalls`. Results are sorted by installs descending and limited to `maxResults`. Install count is a popularity and ordering signal, not a relevance, correctness, or security guarantee.

## Review Gate

The agent reviews the actual skill instructions before selecting one. A support path is accepted only when it resolves inside the operating-system temporary directory beneath a `skills-use-*` parent. Supporting files are staged but are not executed during review.

## Persistence Gate

The default is `never`.

- `never`: use reviewed content for the current task without persisting it.
- `workflow-only`: persist only after explicit user approval and only when the selected skill has supporting files.

Markdown-only skills are never persisted under `workflow-only` mode. Existing installations are not overwritten.

## Controls

- `maxResults`
- `minimumInstalls`
- `persistMode`

## Limitations

The catalog and staged skill content are untrusted. Review reduces accidental selection risk but does not prove that a workflow is safe, current, or beneficial. AutoSkills disables telemetry for its pinned skills CLI subprocesses, while source repositories and skills.sh still receive the network requests required to search and review.
