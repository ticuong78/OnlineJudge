---
name: review
description: Review the current branch's diff against OnlineJudge's architecture, security, testing and documentation rules before opening a pull request.
---

# Review

Run on the diff against `main` (`git diff origin/main...HEAD`). Produce a list of findings, each with file and line, severity (blocking, should fix, nit) and a concrete fix. Say "nothing blocking" explicitly when that is the result.

Check, in this order:

1. Spec: a spec exists in `docs/specs/`, its "done when" items are covered by the diff, and the diff does not do more than the spec.
2. Boundaries: new imports respect the layer order (domain, application, infrastructure, presentation) and the context dependency direction in `CLAUDE.md`; cross-context calls go through facades or events.
3. Contracts: new DTOs and enums live in `@oj/contracts`; no duplicated shapes; `docs/API.md` updated for any endpoint change.
4. Security: `@Roles` on every mutating or non-public route; actor scoping on every list and load by id; DTO validation for every new field; no secrets, tokens or personal data in logs; sandbox flags untouched or justified.
5. AI calls: model from `.env`, prompt delimited, zod validation, fallback when the key is missing, fixtures updated.
6. Tests: new behaviour has tests in `test/`; a bug fix has a regression test; `pnpm build:shared && pnpm typecheck && pnpm test` were run (ask for the output if not shown).
7. Frontend: calls go through `lib/api.ts`; no business rule enforced only in the UI; Vietnamese user-facing text.
8. Hygiene: branch name and commit messages follow Conventional Commits; PR template answers are present and true.

Then launch the `reviewer` agent on the same diff and merge its findings with yours, removing duplicates. Do not fix anything during the review; report first.
