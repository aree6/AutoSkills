# Contributing

Use Bun 1.4.0 or newer and run `bun run check` before opening a pull request.

Keep the router small. The user-facing configuration must remain limited to the three controls in `config/policy.json`. Add tests for install-count filtering, descending ordering, top-N behavior, support-path validation, global installer arguments, installer result validation, and persistence semantics.

Run `bun run benchmark` after changing search behavior or workflow cases. Do not add trust, audit, star, age, or publisher-verification filters without an explicit product decision.

Never commit `.agents/`, `.claude/`, `.codex/`, `skills-lock.json`, credentials, or local review staging output.
