---
name: spec
description: Write or update a one-page spec in docs/specs before implementing a change in OnlineJudge. Use when a feature, fix or refactor is requested and no approved spec exists.
---

# Spec

1. Pick the next id: look at `docs/specs/`, use `OJ-<n>` with n one higher than the largest existing id.
2. Copy `docs/specs/TEMPLATE.md` to `docs/specs/OJ-<n>-<slug>.md` and fill every section. Keep it to one page.
3. "Done when" items must be observable: an endpoint responding, a test passing, a screen behaving. No "improve" or "refactor" without a measurable result.
4. List the bounded contexts touched and check the dependency direction in `CLAUDE.md`. If the change needs a new cross-context call, name the facade or event that will carry it.
5. List contract changes (`@oj/contracts`), database changes (entities, future migration), and documentation to update (`docs/API.md`, `README.md`).
6. If the change calls Claude: model variable, prompt location, zod schema, cost per call estimate, fallback behaviour.
7. If the change touches a risky area (identity, judging, engine, Claude adapters, owner-scoped queries, CI, Docker): say so and add the security-verifier step to the plan.
8. Name the tests to add or change, by file.
9. Present the spec and stop. Implementation starts only after the owner marks the status `approved`.
