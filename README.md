# How It Works

For non-trivial work that needs a specialized skill, AutoSkills automatically finds and loads a relevant skill into context, so you never have to install or manage skills yourself. Skills with supporting files are loaded locally inside the OS temporary directory and remain available for the current task.

## Discovery

The first pass is intentionally metadata-only. AutoSkills preserves skills.sh semantic result order and returns only an opaque id, title, and description for each credible candidate.

The main agent chooses from those descriptions or makes a more focused query. It does not load every candidate's full `SKILL.md` merely to decide which one fits.

## Review

Only the chosen candidate is fully reviewed and loaded locally. AutoSkills returns:

- the exact skill name and catalog id;
- an absolute `SKILL.md` path;
- a SHA-256 digest of the reviewed instructions;
- the supporting-file path when the skill has additional files;
- a short delegation handoff containing the approved skill and safety rules.

The skill path is authoritative. Prompt text and third-party output markers are never used as the path.

## Subagent Handoff

When the main agent delegates work, it includes:

- repository root, working directory, branch, and revision when available;
- the delegated objective, relevant files, constraints, and expected result;
- the exact approved skill names and local `SKILL.md` paths;
- the reviewed instruction digests.

A subagent must read the exact approved path, use only skills from that approved set, and begin work immediately. It must not invoke AutoSkills, repeat discovery, review or install another skill, substitute a different skill, or continue rediscovering when a path is unavailable.

The approved set may contain one or more skills. AutoSkills does not impose a quantity; the main agent decides what belongs in the handoff.

## Local Temporary Storage

AutoSkills loads the selected skill locally inside the OS temporary directory and returns its exact path and digest. Keep that path available for the logical task and reuse it after plan mode, a summary, a permission wait, or `continue`. The temporary location is not a global installation.

## Installation

### Requirements

- Bun 1.4.0 or newer
- Git and network access
- macOS with the `trash` command for self-installation

Install for OpenCode:

```bash
git clone https://github.com/aree6/AutoSkills.git
cd AutoSkills
bun install
bun run install:opencode
```

Use `bun run install:claude` or `bun run install:codex` for those agents. Running an install command again updates the existing copy by moving the previous version to Trash.

Fully terminate every agent process after installing, then launch a new process. OpenCode caches its skill catalog at startup, so opening a new chat or session is not sufficient.

Verify OpenCode discovery with:

```bash
opencode debug skill
```

## Commands

```bash
bun src/cli.ts doctor
bun src/cli.ts search "react performance"
bun src/cli.ts review <skill-id>
bun src/cli.ts install <review-id> <opencode|claude-code|codex>
```

`search` returns metadata-only candidates. `review` loads exactly one chosen skill locally inside the OS temporary directory without dumping its full body into the command result; read its returned `skillPath` directly and reuse it on continuation. `install` uses the reviewed local snapshot, global scope, and no-overwrite checks.

## Policy

The default policy is intentionally conservative:

```json
{
  "maxResults": 4,
  "persistMode": "never"
}
```

- `maxResults`: maximum metadata candidates returned per search.
- `persistMode`: `never` loads third-party skills locally in temporary storage without global installation; `workflow-only` allows explicitly approved persistence only when supporting files exist.

Skills.sh semantic order is preserved and truncated to `maxResults`. Install count is not a filter: an absolute popularity floor silently emptied the candidate list for narrow topics, where a highly relevant skill can have fewer than 100 installs.

The four-query workflow limit is an agent instruction, not a CLI-enforced counter. Queries are issued two at a time and judged as a union.

## Privacy and Trust

AutoSkills sends compact task-derived search queries to skills.sh. Do not include secrets, private source code, customer data, internal URLs, or credentials in queries.

The public skills.sh search endpoint does not return descriptions, so AutoSkills reads the public skill page's structured metadata for the short candidate list. The model receives only title and description, not the rendered skill body. Full instructions are fetched only after selection.

Skills are untrusted instructions and may include executable files. Install counts and catalog presence are popularity signals, not security guarantees. AutoSkills disables telemetry for its `skills` CLI subprocesses with `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`, while source hosts and skills.sh still receive the requests required to search and review.

## Uninstall

From the source checkout:

```bash
bun scripts/uninstall-self.ts opencode
bun scripts/uninstall-self.ts claude-code
bun scripts/uninstall-self.ts codex
```

Add `--include-disabled` to remove `~/.agents/disabled-skills/autoskills` as well. If the source checkout is unavailable, move existing installed directories to Trash manually:

```bash
for path in \
  "$HOME/.agents/skills/autoskills" \
  "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/autoskills"
do
  [ ! -e "$path" ] || trash "$path"
done
```

Fully terminate all OpenCode processes, launch a new process, and verify that `autoskills` is absent from `opencode debug skill`. These commands do not remove the source checkout or separately discovered third-party skills.

## Development

```bash
bun install --frozen-lockfile
bun run check
bun run benchmark
```

The benchmark measures metadata coverage, reference recall, top-reference rate, description enrichment, and result counts. It does not prove task success or skill safety.

## License

MIT
