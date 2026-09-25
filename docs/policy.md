# Selection Policy

AutoSkills keeps metadata discovery, full review, delegation, persistence, and cleanup as separate gates.

## Activation Gate

Search only when a concrete task needs specialized procedural knowledge that repository guidance, standard tools, and already-installed skills do not adequately cover. When the gate is uncertain, proceed without searching.

Queries must not contain secrets, private source code, customer data, internal URLs, or credentials.

## Metadata Gate

Preserve skills.sh semantic result order. Apply `minimumInstalls` only as an eligibility filter; never re-sort by popularity. Enrich the short candidate list from public skill-page JSON-LD and return only an opaque id, title, and description.

Candidates without both title and description are omitted. If no candidate is credible, refine the query before loading any full skill.

## Review Gate

Fully review only the candidate selected from metadata. AutoSkills stages the exact selected skill in a controlled temporary directory and returns an authoritative `SKILL.md` path and digest. Prompt text and third-party output markers are never path or cleanup authorities.

A rejected reviewed skill must be cleaned before another full review is selected.

## Delegation Gate

Every delegated task must receive repository context and the exact approved skill names, paths, and digests. Subagents may use only that approved set.

Subagents must not invoke AutoSkills, repeat discovery, search, review, install, substitute another skill, modify staged files, or clean temporary reviews. The approved set may contain one or more skills; no quantity is imposed.

## Persistence Gate

The default is `never`.

- `never`: use reviewed content for the current task without persisting it.
- `workflow-only`: persist only after explicit user approval, only when the selected skill has supporting files, and only from the reviewed local snapshot.

Markdown-only skills are never persisted under `workflow-only` mode. Existing installations are not overwritten.

## Cleanup Gate

Only the main agent may clean a review. Cleanup occurs after the main agent and every delegated consumer are terminal. Cleanup accepts only a generated review id directly beneath the canonical OS temporary directory and moves the exact directory to Trash.

## Controls

- `maxResults`
- `minimumInstalls`
- `persistMode`

## Limitations

The catalog and staged skill content are untrusted. Metadata helps narrow candidates but does not prove correctness or safety. Public page metadata can change, and only the selected skill receives a full review. AutoSkills disables telemetry for its pinned skills CLI subprocesses while source repositories and skills.sh still receive required network requests.
