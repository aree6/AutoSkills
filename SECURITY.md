# Security Policy

## Trust Boundary

AutoSkills searches skills.sh and materializes remote skill content for review. Skills are untrusted instructions and may include executable files. Catalog presence, install count, and review do not guarantee correctness or safety.

Repository guidance, system instructions, user instructions, and permission rules take precedence over every fetched skill. Do not execute supporting scripts until the selected workflow requires them and the user has approved the action.

## Network and Privacy

AutoSkills sends compact task-derived queries to skills.sh. Users must not include secrets, private source code, customer data, internal URLs, or credentials in queries.

Review and installation fetch content from the selected source host and may use the user's existing Git or GitHub authentication. They are separate fetches, so a mutable upstream can change between review and persistence; the returned ref and hash are provenance metadata, not proof that both snapshots match. AutoSkills sets `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1` for its pinned `skills` CLI subprocesses; this does not prevent the source or catalog requests required to operate.

## Persistence

The default `persistMode` is `never`. AutoSkills persists a reviewed third-party skill only after explicit user approval, only when `persistMode` is `workflow-only`, and only when the skill has supporting files. It refuses to overwrite an existing destination.

## Installation Scope

Third-party skill installation uses global scope. AutoSkills validates the installer result, requested agent, and returned destination. Self-installation moves an existing router copy to Trash before replacing it.

After installing, updating, or uninstalling AutoSkills, fully terminate the agent process and launch a new one. OpenCode caches skill and command catalogs at startup, so a new chat or session is not sufficient.

## Reporting

Use GitHub's private vulnerability reporting for security issues. Include the affected version, reproducible steps, impact, and suggested mitigation. Do not include secrets or private repository data.

## Supported Version

Only the latest published release receives security fixes.
