# AutoSkills

AutoSkills conditionally discovers, reviews, and selectively uses reusable [Agent Skills](https://agentskills.io/specification) from [skills.sh](https://skills.sh).

It is designed for tasks that need specialized procedural knowledge not already covered by repository guidance, standard tools, or installed skills. AutoSkills does not route trivial work, treat popularity as a security guarantee, or persist third-party skills without explicit approval.

## Requirements

- Bun 1.4.0 or newer
- Git and network access
- macOS with the `trash` command for self-installation and cleanup scripts

The router logic is portable, but the self-install and uninstall commands currently use macOS Trash rather than permanent deletion.

## Install

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

## How It Works

1. The agent checks whether local guidance or an installed skill already covers the task.
2. When the task needs a specialized workflow, AutoSkills derives up to four compact search queries.
3. The CLI searches skills.sh and returns up to four candidates that pass the configured install-count floor.
4. The agent reviews candidate instructions before selecting one.
5. Supporting files are staged in a temporary `skills-use-*` directory and are not executed during review.
6. The selected skill is used for the current task without installation by default.
7. Persistence is considered only after explicit user approval and only when `persistMode` permits it.

## Policy

The default policy is intentionally conservative:

```json
{
  "maxResults": 4,
  "minimumInstalls": 10000,
  "persistMode": "never"
}
```

- `maxResults`: maximum candidates returned per search.
- `minimumInstalls`: minimum skills.sh install count used as a popularity and ordering signal.
- `persistMode`: `never` keeps third-party skills temporary; `workflow-only` allows explicitly approved persistence only when supporting files exist.

The four-query workflow limit is an agent instruction, not a CLI-enforced counter.

## Commands

```bash
bun src/cli.ts doctor
bun src/cli.ts search "react performance"
bun src/cli.ts review <source> <skill>
bun src/cli.ts install <source> <skill> <opencode|claude-code|codex>
```

`search` returns install-ranked catalog metadata. `review` materializes a candidate for inspection and returns its staged support path when supporting files exist. `install` uses global scope, refuses an existing destination, disables skills.sh CLI telemetry, validates the returned path and agent, and never persists markdown-only skills under `workflow-only` mode.

## Privacy and Trust

AutoSkills sends compact task-derived search queries to skills.sh. Do not include secrets, private code, customer data, internal URLs, or other sensitive information in queries.

Review downloads remote skill content. Skills are untrusted instructions and may include executable files; install counts and catalog presence are popularity signals, not security guarantees. Review and persistence are separate source fetches, so a mutable upstream can change between them; the installer’s ref and hash provide provenance but do not prove that the installed files match the reviewed snapshot. AutoSkills disables telemetry for its `skills` CLI subprocesses with `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`, but source and skill content are still fetched from their original hosts.

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

The benchmark measures catalog coverage, reference recall, top-reference rate, and result counts. It does not measure task success or prove that a skill is safe.

## License

MIT
