# Contributing

Use Bun 1.4.0 or newer and run `bun run check` before opening a pull request.

Keep the router small. The user-facing configuration must remain limited to the three controls in `config/policy.json`.

Add tests for:

- metadata-only candidate output and description enrichment;
- preservation of skills.sh semantic order;
- install-count eligibility without popularity re-ranking;
- exact staging paths for markdown-only and multi-file skills;
- rejection of forged markers, symlinks, and unexpected review layouts;
- handoff path and digest identity;
- temporary-review containment, traversal rejection, and explicit maintenance behavior;
- installation from the reviewed local snapshot;
- local temporary retention and reuse across task continuations.

Run `bun run benchmark` after changing discovery behavior or workflow cases. Do not add trust, audit, star, age, or publisher-verification filters without an explicit product decision.

Never commit `.agents/`, `.claude/`, `.codex/`, `skills-lock.json`, credentials, temporary review directories, or local review staging output.
