# Security Policy

## Trust Boundary

AutoSkills searches skills.sh and reads public skill-page metadata before any full skill is selected. Search results are untrusted metadata, and selected skills are untrusted instructions that may include executable files. Catalog rank, install count, title, description, and review do not guarantee correctness or safety.

Repository guidance, system instructions, user instructions, and permission rules take precedence over every fetched skill. Do not execute supporting scripts until the selected workflow requires them and the user has approved the action.

## Network and Privacy

AutoSkills sends compact task-derived queries to skills.sh and reads public skill pages to obtain title and description metadata. Users must not include secrets, private source code, customer data, internal URLs, or credentials in queries.

Full skill content is fetched only after metadata selection. AutoSkills sets `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1` for its pinned `skills` CLI subprocesses; this does not prevent the source or catalog requests required to operate.

## Delegation

The main agent provides the exact reviewed skill paths, digests, repository context, and approved-skill set. Subagents must treat staged files as read-only, use no unapproved skills, never repeat discovery, and never clean the review.

A missing path or changed digest is a stop condition. The subagent must report the failure rather than searching for a replacement.

## Temporary Reviews

Every full review is staged beneath a generated `autoskills-review-*` directory under the OS temporary root. Only the main agent may clean it, and only after all consumers are terminal. Cleanup validates the generated id and exact directory, then moves it to macOS Trash without a permanent-deletion fallback.

## Persistence

The default `persistMode` is `never`. AutoSkills persists a reviewed third-party skill only after explicit user approval, only when `persistMode` is `workflow-only`, and only when the skill has supporting files. It installs from the reviewed local snapshot and refuses to overwrite an existing destination.

## Installation Scope

Third-party skill installation uses global scope. AutoSkills validates the installer result, requested agent, and returned destination. Self-installation moves an existing router copy to Trash before replacing it.

After installing, updating, or uninstalling AutoSkills, fully terminate the agent process and launch a new one. OpenCode caches skill and command catalogs at startup, so a new chat or session is not sufficient.

## Reporting

Use GitHub's private vulnerability reporting for security issues. Include the affected version, reproducible steps, impact, and suggested mitigation. Do not include secrets or private repository data.

## Supported Version

Only the latest published release receives security fixes.
