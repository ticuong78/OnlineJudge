# Online Judge: technical overview

One page for engineers, reviewers and the product owner: how the system is built, how a submission flows, what keeps
it safe, how it is configured and run, and what is known to be missing. Rules for changing the code are in
[CLAUDE.md](../CLAUDE.md); every endpoint is in [API.md](API.md); decisions in [adr/](adr/); changes in [specs/](specs/).

## 1. System

```
 Browser ── Next.js (app router, Vercel) ──HTTP /api──▶ NestJS backend ──▶ PostgreSQL
                                                         │   ▲
                                          judge-jobs     ▼   │  judge-results        (BullMQ on Redis)
                                                   Engine worker × N ──▶ docker run oj-runner (sandbox per submission)
                                                         │
                                         Claude API ◀────┘ (backend only: exam reading, rewrites, test suggestions, AI-usage review)
```

| Package | Path | Role |
|---|---|---|
| `@oj/contracts` | `src/shared` | DTOs, enums, judge queue messages; the single source of request/response shapes |
| `@oj/backend` | `src/backend` | REST API under `/api`; DDD bounded contexts; TypeORM; BullMQ producer and result consumer |
| `@oj/engine` | `src/engine` | Judge worker: compiles and runs code in Docker via the `oj-run` supervisor; never reads the database |
| `@oj/frontend` | `src/frontend` | Next.js UI; `lib/api.ts` is the only HTTP client; business rules stay in the backend; interface in Vietnamese and English (`src/i18n`, `use-intl`, cookie `oj_locale`, OJ-12) |

## 2. Backend bounded contexts

| Context | Owns | Talks to |
|---|---|---|
| identity | users, roles, VIP, one-time codes, invitations, **organizations** (members, seats, plan, invitations), AI access rule | — |
| classroom | classes (personal or organization), enrollments, join/leave requests; who manages a class (`isManagedBy`) | identity |
| catalog | problem bank: problems, tests, solutions, sharing (public levels, organizations), copies | identity (AI access, events) |
| importing | reading .docx/.pdf/pasted text into problem drafts (pattern parser or Claude) | catalog, identity (AI access) |
| assessment | problem sets, sessions (frozen snapshots, settings, timers), results, learning record | catalog, classroom |
| judging | submissions, admission limits, judge queue, watchdog | assessment |
| integrity | plagiarism fingerprints, AI-usage review, flags | judging, assessment (session facade) |
| community | class board: announcements, questions, replies | assessment, classroom |

Direction: `integrity → judging → assessment → catalog, classroom → identity`; `community → assessment, classroom`.
Reactions the other way go through domain events (`*.events.ts`), e.g. `identity.member-left-organization` →
classroom hands the organization's classes to the successor; catalog copies shared problems.

## 3. Main flows

**Submission.** Student → `POST /submissions` → assessment checks the session (open, member, timer, language) →
judging admits it atomically (≤ 3 pending per user, per-problem attempt limit; one transaction with an advisory lock) →
job with code, limits and tests on `judge-jobs` → engine runs it in a fresh `oj-runner` container → result on
`judge-results` → backend stores verdict and score, emits `submission-judged` → learning record and integrity react.
A watchdog ends submissions whose job vanished (`JUDGE_STALE_AFTER_SECONDS`, default 300) with "Lỗi hệ thống", which
does not count as an attempt (except a program's own failures beyond two per problem). It also ends jobs an engine took
and abandoned: after that job's deadline plus 2 minutes, or after `JUDGE_GIVE_UP_AFTER_SECONDS` (default 1800, capped
at 4 hours).

**Import.** Upload/paste → text extracted (mammoth for .docx, unpdf for .pdf) → Claude reader if the user may use AI and
a key exists, else the pattern parser (`ExamParser`) → links and adverts stripped (`external-links.ts`) → drafts
reviewed by the teacher → file-I/O drafts blocked → confirmed into the importer's bank.

**Organization.** Admin creates it with seats/end date/AI and an org admin → invitations reserve seats (locked
transaction) → acceptance turns the reservation into membership → the authenticator loads memberships on every request
(`Actor.organizations`) → class management, sharing and AI read them.

## 4. Security model

| Layer | Mechanism |
|---|---|
| Authentication | JWT bound to the current password ("credential"); every request reloads the account, role and memberships; reset/delete end old tokens |
| Codes and links | scrypt-hashed one-time codes, 5 atomic attempts, expiry; reset by link only (token in the URL fragment); invitations with the code in the fragment |
| Abuse limits | Redis rate limits (keys `oj:rl:*`) on login, sign-up, resend, forgot, invitation preview, code typing (`register/verify`, `password/reset`, `invitations/accept`: 300 per IP per 10 min), organization invitations (60 per IP per hour); 20 wrong sign-up codes per email per day; per-account lockout with owner exemption |
| Authorization | global `AuthGuard`; routes declare `@Public()` or `@Roles(...)` (checked by `public-routes.test.ts`), except 18 "any signed-in user" routes pinned in that test (K-12); ownership checked in the application layer with the `Actor` |
| Isolation | teachers see their own bank/classes; organization data scoped by the actor's memberships; students never see blueprints or hidden tests |
| Validation | DTO classes with class-validator, `whitelist: true`; size limits on uploads and text; AI output parsed with zod |
| Sandbox | ADR 0004: no network, CPU/memory/pids caps, read-only root, size- and inode-capped tmpfs, IPC off, capabilities dropped, build output sealed, every run through `oj-run` (unprivileged user, wall-clock kill, output cap, clean-up) |
| Secrets and logs | `.env` never committed; no tokens, codes, passwords or full emails in logs (development mail output excepted) |

Reviews: `docs/security/` (audit), security-verifier reviews for OJ-1 to OJ-3 and OJ-8. OJ-2 and OJ-3 (sandbox,
judging) still need a second human reviewer, as their specs say.

## 5. Configuration (backend `.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` switches on the production checks: strong `JWT_SECRET` and `ADMIN_PASSWORD` required, SMTP required, `TRUST_PROXY=true` refused |
| `PORT` | API port (default 4000) |
| `DATABASE_URL`, `DB_SYNC`, `DATABASE_SSL_CA` | Postgres; the schema comes from migrations run at startup (OJ-5). `DB_SYNC=true` only for a throwaway development database, refused in production |
| `REDIS_URL` | rate limits, sign-in memory, judge queues |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | tokens (empty in development = random per start) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | the single administrator, created at start |
| `FRONTEND_URL`, `CORS_ORIGINS`, `TRUST_PROXY` | links in emails, browser origins, real client IPs behind a proxy |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | email; empty host = print to the log (refused in production) |
| `MAX_PENDING_SUBMISSIONS`, `JUDGE_STALE_AFTER_SECONDS`, `JUDGE_GIVE_UP_AFTER_SECONDS` | judging limits and watchdog |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_TESTGEN_MODEL`, `CLAUDE_REVIEW_MODEL` | AI features (off without a key) |

Engine (process environment only; it loads no `.env` file): `REDIS_URL`, `JUDGE_CONCURRENCY` (default 2),
`COMPILE_MEMORY_MB` (default 768, minimum 256), `RUNNER_IMAGE` (default `oj-runner:latest`), `SANDBOX` (`docker`;
`local` is development only), `PYTHON_BIN` (local sandbox only).
Frontend: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`; see `src/frontend/.env.example`); `NEXT_DIST_DIR`
(end-to-end builds only).

## 6. AI features

| Task | Model variable (default) | Gate | Fallback |
|---|---|---|---|
| Exam reading | `CLAUDE_MODEL` (Sonnet 5.5) | administrator, VIP teacher, or a teacher in an **active** organization with AI | pattern parser |
| Section rewrite ("Dùng gợi ý") | `CLAUDE_MODEL` | same | feature off; file-I/O conversion by rule |
| Test suggestions | `CLAUDE_TESTGEN_MODEL` (= `CLAUDE_MODEL`) | same | feature off |
| AI-usage review | `CLAUDE_REVIEW_MODEL` (Haiku 5.5) | session setting by an allowed teacher | check skipped |

Prompts are versioned constants next to the adapters (`*/infrastructure/claude-*.ts`); user content goes in delimited
sections; every response is validated with zod before use. Planning notes suggest Haiku by default and usage metering
later (not implemented).

## 7. Running and deploying

- Local: [docs/testing/local-setup.md](testing/local-setup.md).
- Planned hosting (planning session, 2026-11-08): free tiers until about 30 paying teachers (Oracle Always Free Arm VMs
  for the app and the judge, Cloudflare Pages/R2, Brevo email, UptimeRobot), then one VPS. Production needs:
  `NODE_ENV=production` (it enables the checks below), SMTP, a strong `JWT_SECRET` (≥ 32 characters) and
  `ADMIN_PASSWORD`, `DB_SYNC=false` with migrations, `TRUST_PROXY` behind a proxy, `DATABASE_SSL_CA` for hosted
  Postgres, the runner image built on the judge host.

## 8. Product status

| Area | Status |
|---|---|
| Teacher plans | Free (everything except AI) and VIP (AI), switched by the administrator; no payment |
| Organization plan (OJ-8) | Done for the pilot: seats, end date, AI, org admins, several organizations per teacher, organization classes, sharing inside the organization, leaving rules; org admins archive but do not delete classes |
| Hardening | Done locally, not yet pushed: OJ-1 (identity), OJ-2 (sandbox supervisor), OJ-3 (judging admission and watchdog), OJ-7 (UX fixes). OJ-4 (integrity fingerprint): code done, spec still draft. OJ-5 (migrations): done, see OJ-26 and OJ-28 for the lock and startup. OJ-6 (history rewrite, license): not started |
| Tests (OJ-9) | Unit, integration, HTTP and browser end-to-end; CI job added (not run yet) |

Out of scope / later (from the specs and planning): sharing problem **sets** with organizations, payment and usage
limits (14-day trial, monthly AI allowance, 250k VND per teacher), organization reports, moving a class out of an
organization, contest mode (bulk student accounts, anonymous scoreboard), HSG fidelity (Pascal, real file I/O,
decimal checker), AI gateway with metering, parent consent for minors.

## 9. Known issues

| ID | Issue | Impact | Where |
|---|---|---|---|
| ~~K-1~~ | Fixed in OJ-10: the result card shows points ("36/60"); places without the problem's points show "%" | | solve page result panel |
| ~~K-2~~ | Fixed in OJ-10: "Làm tiếp" is stored per account, removed on sign-out, and offered only while its session is open | | `lib/last-problem.ts`, home page |
| ~~K-3~~ | Fixed in OJ-10: a file whose content is not a Word document or PDF is refused with `import.invalid_file` and its own message | | `importing/domain/document-file.ts` |
| K-4 | Organization "keep one org admin" and duplicate-invitation checks are not serialized (review L3) | Rare races under simultaneous requests | `organization.service.ts` |
| K-5 | One unexplained submission carried the previous code (seen once, not reproduced) | Watch in UAT | solve page |
| K-6 | Student pages (my-class, practice, progress) have no role guard in the UI; the API enforces access | Cosmetic: staff opening them see empty or odd pages | frontend routes |
| K-7 | "Tái cấu trúc bằng AI" (paste) is shown to non-VIP users, who silently get the pattern parser | Expectation mismatch | import page |
| K-8 | Only one administrator account exists | No delegation beyond org admins | identity |
| K-9 | The CI workflow is not committed yet (`.github/` untracked), so it has never run. (Its push trigger and the pre-push hook named `main`; both use `master` since 2026-11-08.) | No automatic checks yet | `.github/workflows/ci.yml` |
| K-14 | Low advisory left after the 2026-11-08 audit: KaTeX prototype pollution (via `rehype-katex`). `dompurify` is forced to `>=3.4.17` by a pnpm override in `pnpm-workspace.yaml` until `monaco-editor` ships it; remove the override then. `typeorm` wants `ioredis` 5 while the backend uses 6 (peer warning) | Low | frontend, backend dependencies |
| K-10 | ~~Migrations not in place~~ Closed by OJ-5: migrations run at startup, `DB_SYNC` refused in production | — | backend |
| ~~K-11~~ | Fixed in OJ-10: one entry per copied pair (unique pair key, insert-or-ignore), also when both are judged at once. Duplicates created before the fix stay | | integrity |
| K-12 | 18 routes for "any signed-in user" (sessions, classes, threads, submissions, progress, `auth/me`) have no `@Roles`; they rely on the sign-in guard plus ownership checks, which differs from CLAUDE.md security rule 1 as written | Rule and code disagree: decide whether to add `@Roles` or reword the rule | `public-routes.test.ts` pins the list |
| ~~K-13~~ | Fixed in OJ-10: every error has a `code` (`request.invalid`, `request.not_found`, `server.error`, …); `ApiErrorBody.code` is required | | `domain-error.filter.ts` |

## 10. Where to find things

| Topic | Document |
|---|---|
| Product behaviour (Vietnamese) | [README.md](../README.md) |
| User workflows per role | [guide/user-manual.md](guide/user-manual.md) |
| Test strategy, UAT scripts, release checklist | [testing/test-plan.md](testing/test-plan.md) |
| Local setup, accounts, sample files | [testing/local-setup.md](testing/local-setup.md) |
| Every endpoint | [API.md](API.md) |
| Decisions | [adr/](adr/) |
| Changes and their "done when" | [specs/](specs/) |
| Security audit | [security/](security/) |
| Rules for code changes | [CLAUDE.md](../CLAUDE.md) |
