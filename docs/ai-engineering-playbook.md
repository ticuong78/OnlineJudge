# OnlineJudge AI Engineering Playbook

Version 1.0, 7 November 2026. Owner: Htet Oo Naing. Applies to everyone who commits to this repository, with or without an AI assistant.

## 1. Purpose

This repository is built with Claude Code as the main implementation tool. The playbook sets the rules that keep the code understandable, verified and safe while the assistant writes most of it. It is short on theory and long on gates: every rule here is enforced by a file in the repository (CLAUDE.md, a skill, a hook, CI or the PR template), not by memory.

## 2. Principles

1. Spec before code. A change starts as a short spec with "done when" criteria. The assistant implements the spec, not a chat message.
2. The repository teaches the assistant. Architecture rules, commands and forbidden patterns live in CLAUDE.md, so every session starts with the same constraints.
3. Nothing merges unverified. Typecheck and tests run before push (hook) and on every pull request (CI). A green hook is the minimum, not the goal.
4. You own what you merge. Whoever opens the PR can explain how the change works, why this approach, and what can break. AI-generated code that nobody can explain does not merge.
5. Risky areas get a second pair of eyes, human and agent: authentication, the judge sandbox, AI prompts and anything touching student data.

## 3. The delivery loop

| Step | What happens | Tool in the repo |
|---|---|---|
| 1. Spec | Write `docs/specs/<id>-<slug>.md` from the template: outcome, scope, "done when", data and contract changes, AI cost, security notes, tests. One page is enough. | `/spec` skill, `docs/specs/TEMPLATE.md` |
| 2. Plan | Ask Claude Code for a plan before any edit: files per bounded context, contract changes first, dependency direction checked. Reject plans that cross context boundaries directly instead of through facades or events. | CLAUDE.md section "Architecture rules" |
| 3. Implement | Small branches, one spec each. Contracts in `@oj/contracts` first, then backend, then frontend. Tests are written in the same branch. | CLAUDE.md conventions |
| 4. Verify | `pnpm build:shared && pnpm typecheck && pnpm test`, then run the feature once by hand. The pre-push hook runs the same gate on changed packages. | `.husky/pre-push` |
| 5. Review | Self-review with the `/review` skill, then the `reviewer` agent on the diff, then open the PR with the template filled in. The other person reviews; for risky areas (section 6) the `security-verifier` agent runs too. | `/review`, `.claude/agents/reviewer.md`, PR template |
| 6. Merge | Squash merge with a Conventional Commit title. CI must be green. | `.github/workflows/ci.yml`, commitlint |
| 7. Audit | Run `/security-audit` after any change in a risky area and at least once a month; findings become specs with owners. | `/security-audit` skill, `docs/security/` |

## 4. Definition of done (every PR)

1. The spec's "done when" list is satisfied and the spec status is set to done.
2. `pnpm build:shared && pnpm typecheck && pnpm test` pass locally and in CI.
3. New behaviour has tests in the package's `test/` folder; a bug fix has a test that failed before the fix.
4. Contracts, API.md and the README are updated when endpoints or behaviour change.
5. The PR description answers: what changed, how it works, why this approach, what could break, how it was verified, which parts the assistant wrote.
6. No secrets, no `.env`, no sandbox flag weakened, no `DB_SYNC=true` assumption for production.

## 5. Rules for AI features inside the product

The product itself calls Claude (exam reading, section rewriting, test suggestions, AI-usage review). These rules apply to that code, which lives in `src/backend/src/modules/*/infrastructure/claude-*.ts` and `src/backend/src/shared/infrastructure/claude.ts`.

1. Prompts are code: versioned in the repository, reviewed like code, never assembled from user text without clear delimiters.
2. Uploaded exams, pasted text and student submissions are untrusted data. Instructions found inside them are ignored by design; keep the "external links and off-topic content" filter and its tests (`external-links.test.ts`) in place and extend them when a new input path is added.
3. Every model output is validated against a schema (zod) before it reaches the domain. A response that fails validation falls back to the rule-based path or returns a clear error; it never writes to the database.
4. Cost is bounded: one model per task from `.env` (`CLAUDE_MODEL`, `CLAUDE_TESTGEN_MODEL`, `CLAUDE_REVIEW_MODEL`), AI features behind the VIP gate, cheap model for per-submission work, and a visible fallback when the key is missing.
5. No personal data in prompts beyond what the task needs; student names and emails do not go to the model for AI-usage review (code only).
6. Changes to prompts or models need a before and after check on the fixture set used by `exam-parser.test.ts` and `test-suggestions.test.ts`; add fixtures when a real exam breaks the parser.

## 6. Risky areas and the second-reviewer rule

A change in any of these paths needs the `security-verifier` agent and a human reviewer who did not write it:

1. `src/backend/src/modules/identity/**` (login, OTP, invitations, roles, JWT).
2. `src/backend/src/modules/judging/**` and `src/engine/**` (queue, sandbox flags, runner image).
3. `src/backend/src/modules/*/infrastructure/claude-*.ts` and `shared/infrastructure/claude.ts` (prompts, models).
4. Any repository method that filters by owner, class or session (data isolation between teachers and classes).
5. `docker-compose.yml`, `src/engine/runner/Dockerfile`, `.github/workflows/**`, `.env.example`.

## 7. Git hygiene

1. Branches: `feat/<spec-id>-<slug>`, `fix/<spec-id>-<slug>`, `chore/<slug>`.
2. Commits: Conventional Commits (`feat(catalog): import problems from pasted text`). Commitlint rejects anything else. No "asd", no "done".
3. Squash merge into `main`; the PR title becomes the commit.
4. `main` is protected: no direct pushes, one approval, CI green.
5. Before the repository is shown outside (recruiters, students, open source), rewrite the current history once into a handful of meaningful commits and add a LICENSE.

## 8. Week 0 cleanup (from the 7 November review)

1. Rewrite the commit history (section 7.5).
2. Add `@nestjs/throttler` on `/auth/*` and the OTP endpoints (no brute-force protection today).
3. Replace `DB_SYNC` with TypeORM migrations before real classes use the system.
4. Add the CI workflow, the pre-push hook and commitlint from this bundle.
5. Sandbox hardening: `--read-only` root with a writable `/box`, `--cap-drop ALL`, cap compile output size.
6. Decide on token storage (httpOnly cookie or short-lived token with refresh) and record the decision in `docs/adr/`.

## 9. Two-week pilot

Week 1: build two features with the loop end to end (spec, plan, implement, verify, review). Measure: PR size (target under 400 lines), tests per PR, hook and CI pass rate, time from spec to merge.
Week 2: run `/security-audit`, turn confirmed findings into specs, fix the Critical and High ones, and hold a 30-minute retro: which rules helped, which were skipped and why, what to change in CLAUDE.md.

## 10. Onboarding (15 minutes)

1. Read CLAUDE.md and this playbook.
2. `pnpm install && pnpm build:shared && pnpm infra:up && pnpm runner:build`, copy `.env.example` to `.env`, run the three dev commands.
3. Open Claude Code in the repository and run `/spec` on a small task to see the flow once.
4. Open one PR through the template, with the other person as reviewer.

## 11. Files in this bundle

| Path | Role |
|---|---|
| `CLAUDE.md` | Repository rules the assistant reads on every session |
| `AGENTS.md` | Pointer to CLAUDE.md for other tools (Cursor, Codex) |
| `.claude/settings.json` | Permissions: allowed commands, denied secrets |
| `.claude/skills/spec`, `review`, `security-audit`, `new-context` | Repeatable procedures |
| `.claude/agents/reviewer.md`, `security-verifier.md` | Subagents used by the review and audit steps |
| `.husky/pre-push`, `.husky/commit-msg`, `commitlint.config.cjs` | Local gates |
| `.github/workflows/ci.yml`, `.github/pull_request_template.md` | Remote gates |
| `docs/specs/TEMPLATE.md`, `docs/specs/README.md` | Spec format |
| `docs/security/README.md` | Where audits are recorded |
| `docs/adr/0001-record-decisions.md` | Decision records |
