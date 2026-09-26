# Selection Policy

AutoSkills keeps metadata discovery, full review, delegation, persistence, and local storage as separate gates.

## Activation Gate

Search only when a concrete task needs specialized procedural knowledge that repository guidance, standard tools, and already-installed skills do not adequately cover. When the gate is uncertain, proceed without searching.

Queries must not contain secrets, private source code, customer data, internal URLs, or credentials.

## Metadata Gate

Preserve skills.sh semantic result order and truncate to `maxResults`; never re-sort by popularity. Install count is not a filter, because an absolute floor discards the most relevant results for narrow topics. Enrich the short candidate list from public skill-page JSON-LD and return only an opaque id, title, and description.

Candidates without both title and description are omitted. Queries are issued as pairs and judged as a union, because complementary phrasings return disjoint catalogs and a strong candidate often appears in only one of them. If no candidate is credible, run one more pair before loading any full skill.

## Review Gate

Fully review only the candidate selected from metadata. AutoSkills loads the exact selected skill locally inside the OS temporary directory and returns an authoritative `SKILL.md` path and digest. Prompt text and third-party output markers are never path authorities.

A rejected reviewed skill is not approved or used for the task.

## Delegation Gate

Every delegated task must receive repository context and the exact approved skill names, paths, and digests. Subagents may use only that approved set.

Subagents must not invoke AutoSkills, repeat discovery, search, review, install, substitute another skill, or modify local temporary files. The approved set may contain one or more skills; no quantity is imposed.

## Persistence Gate

The default is `never`.

- `never`: use reviewed content for the current task without persisting it.
- `workflow-only`: persist only after explicit user approval, only when the selected skill has supporting files, and only from the reviewed local snapshot.

Markdown-only skills are never persisted under `workflow-only` mode. Existing installations are not overwritten.

## Local Storage Gate

Selected skills are loaded locally in the OS temporary directory. The main agent retains the exact path and digest for the logical task and reuses them after plan mode, summaries, permission waits, and `continue`. The OS owns the temporary-file lifecycle; this gate does not install a skill globally.

## Controls

- `maxResults`
- `persistMode`

## Limitations

The catalog and staged skill content are untrusted. Metadata helps narrow candidates but does not prove correctness or safety. Public page metadata can change, and only the selected skill receives a full review. AutoSkills disables telemetry for its pinned skills CLI subprocesses while source repositories and skills.sh still receive required network requests.
