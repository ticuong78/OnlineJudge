---
name: review
description: Review the current branch's diff against OnlineJudge's architecture, security, testing and documentation rules before opening a pull request.
---

# Review

Run on the diff against `master` (`git diff origin/master...HEAD`). Produce a list of findings, each with file and line, severity (blocking, should fix, nit) and a concrete fix. Say "nothing blocking" explicitly when that is the result.

Check, in this order:

1. Spec: a spec exists in `docs/specs/`, its "done when" items are covered by the diff, and the diff does not do more than the spec.
2. Boundaries: new imports respect the layer order (domain, application, infrastructure, presentation) and the context dependency direction in `CLAUDE.md`; cross-context calls go through facades or events.
3. Contracts: new DTOs and enums live in `@oj/contracts`; no duplicated shapes; `docs/API.md` updated for any endpoint change.
4. Security: `@Roles` on every mutating or non-public route; actor scoping on every list and load by id; DTO validation for every new field; no secrets, tokens or personal data in logs; sandbox flags untouched or justified.
5. AI calls (playbook sections 4 to 7): model from `.env`; a new or changed prompt carries a version and delimited user content; zod validation, and length limits on any stored output; fallback when the key is missing; the allowance it counts against; no student names, emails, ids or other identifying data sent to the model; the before-and-after check recorded in the spec for any prompt or model change.
6. Tests: new behaviour has tests in `test/`; a bug fix has a regression test; `pnpm build:shared && pnpm typecheck && pnpm test` were run (ask for the output if not shown).
7. Frontend: calls go through `lib/api.ts`; no business rule enforced only in the UI; user-facing text in the `vi` and `en` dictionaries, never inline (CLAUDE.md architecture rule 9).
8. Hygiene: branch name and commit messages follow Conventional Commits; PR template answers are present and true.

Then launch the `reviewer` agent on the same diff and merge its findings with yours, removing duplicates. Do not fix anything during the review; report first.
