# Whole-codebase review, 12 November 2026

## Scope and method

- **What was reviewed:** the working tree of `feat/oj-12-i18n-en-vi`, including the uncommitted OJ-13 changes:
  - contracts;
  - all eight backend contexts plus `shared`;
  - the engine and `oj-run`;
  - the frontend;
  - CI and hooks.
- **How:** five independent read-only reviews, one per area, each checked against CLAUDE.md, the ADRs and
  `docs/security/audit-2026-11-07.md`. Items that audit records as fixed were re-checked and still hold.
  - Every **blocking** finding was then confirmed by hand. The evidence is noted on each.
  - Other findings come from reading the code paths end to end. The two marked "needs a live run" are not proven.
- **Not run:** Docker tests and load tests.

| Severity | Count |
|---|---|
| Blocking | 3 |
| Should fix | 21 |
| Nits | 12 |

The security floor holds:
- the sandbox flags match ADR 0004;
- every route declares its roles (enforced by `public-routes.test.ts`);
- ownership checks in classroom, catalog, assessment and integrity are scoped to the actor;
- no context breaks the layering rules.

## Blocking

B1, B2 and B3 are fixed: see `docs/specs/OJ-14-review-blocking-fixes.md`. The security-verifier re-checked them,
and they have regression tests.

### B1. Open redirect after sign-in

**Where:** `src/frontend/src/app/(auth)/login/page.tsx:12-14`.

**Problem:** `safeNext` accepts any value that starts with `/` but not `//`. That lets through:
- `/\evil.com`, which `new URL` resolves to `https://evil.com/`;
- `/<TAB>/evil.com`, which resolves the same way.

**Evidence (confirmed):** Next's `router.replace` makes a full navigation for another origin
(`navigate-reducer.js:34`, `completeHardNavigation`).

**Scenario:** a phishing link `…/login?next=/%5Cevil.com`.
- A signed-in user is sent to `evil.com` at once.
- Anyone else is sent there right after typing their real password, to a copy of the sign-in page that asks again.

**Fix:**
- Resolve with `new URL(next, location.origin)`.
- Accept it only if the origin matches, and use `pathname + search + hash`.
- Add tests for `/\`, tab, newline and `//`.

### B2. Database errors are logged whole, with emails and hashes

**Where:** `src/backend/src/shared/presentation/domain-error.filter.ts:60`, which calls `logger.error(exception)` on any
unmapped error.

**Evidence (confirmed):** Nest's logger prints the error's own fields. A test error carrying `parameters` and
`detail` printed the email twice. A TypeORM `QueryFailedError` carries the query parameters, for example email,
`passwordHash` or `codeHash`.

**Scenario:** any unmapped database failure on sign-up or password reset writes personal data to the logs. This
breaks security rule 6.

**Fix:**
- Log the error name, the message passed through `maskEmailsIn`, and the stack. Never log the object.
- Add a test with a fake `QueryFailedError`.

### B3. Judge results can overwrite each other

**Where:**
- `judging/application/judging.service.ts:105-130`;
- `judging/infrastructure/typeorm-submission.repository.ts:27-29`;
- `bullmq-judge-queue.ts:97` (8 results processed concurrently).

**Problem:** each result loads the row, changes it in memory and saves the whole row back, with no check that the
row is unchanged.

**Evidence (confirmed):** the code is exactly this load, change and full save.

**Scenarios:**
- **Started overwrites finished:** the engine's `started` and `finished` messages for a fast program are processed
  at the same time, and `started` saves last. The row goes back to JUDGING with no verdict. The watchdog later
  turns it into a system error, while the learning record already holds the real score.
- **Rejudge undone:** a result from an old run can undo a rejudge.

**Fix:**
- Apply results with a conditional UPDATE: `WHERE id = :id AND judgeRun = :run AND status <> 'DONE'`. For `started`,
  use `AND status = 'PENDING'`. This is the same pattern as `failIfUnfinished`.
- Add a test that interleaves the two messages.

## Should fix

### Security and privacy

| # | Where | Problem and scenario | Fix |
|---|---|---|---|
| S1 | `backend/src/main.ts:20`; `identity.controllers.ts:24` | A 20 MB JSON limit on every route, parsed before any rate limit. Anonymous clients can repeatedly POST 20 MB to `/auth/login`. The password has no maximum length, so up to 20 MB goes into scrypt. | Keep the default limit (about 100 kB) and raise it only on the test-data and import routes. Add `@MaxLength(128)` to the password. |
| S2 | `importing/infrastructure/document-reader.ts:15,30-36` | Only the compressed 10 MB is capped. A zip-bomb `.docx` from a staff account exhausts the API process's memory for everyone. Hostile PDFs have no time limit. | Before parsing, check the total unpacked size and the number of entries. Give `unpdf` a timeout or run it in a worker. Add a test. |
| S3 | `identity/application/organization.service.ts:138-145,237` | Any organization admin (a teacher) can type an email and learn: whether it is a student or admin account (from `not_a_teacher`), or that it is a teacher and their real name (from `displayName`). This works across all schools. | Return the name the inviter typed. Answer students and admins the same way as a new address. |
| S4 | `organization.controllers.ts:90` with `shared/presentation/rate-limit.ts:27` | The invite limit is per IP and runs before the sign-in check. A student behind the school's network address can spend the school admin's hourly budget with unauthenticated 401s. | Limit inside `OrganizationService.invite`, keyed by `actor.id`. |
| S5 | `frontend/src/lib/api.ts:174`; `lib/auth.tsx:64-68` | Other tabs don't notice a sign-out. On a lab computer, a stale tab keeps showing student A's data and code draft. After student B signs in, it sends B's token, so B can submit A's draft under B's name. | Listen for `storage` events on the token and reset or reload. Send the sign-out event on any 401 after a session existed. |
| S6 | `frontend/src/components/markdown.tsx:19-22`; `community` never strips links | `![](https://attacker/p.gif)` in a student's thread or reply makes every classmate's and the teacher's browser fetch it, leaking their IP and reading time. | Drop images from other origins and add `rel="noopener noreferrer nofollow"` to links. Or apply `stripExternalLinks` to thread and reply bodies in the backend. |
| S7 | `frontend/src/components/code-editor.tsx:17`; `next.config.ts` | Monaco is loaded from `cdn.jsdelivr.net`: third-party script on the origin whose `localStorage` holds the token, and a broken editor in labs without internet. There is no CSP, although ADR 0002 asks for one. | Bundle Monaco (`loader.config({ monaco })`) and add a CSP in `headers()`. |
| S8 | `importing/infrastructure/claude-exam-reader.ts:65`; `catalog/infrastructure/claude-section-writer.ts:41-48`; `claude-test-case-suggester.ts:108-133`; `integrity/infrastructure/claude-ai-usage-reviewer.ts:47` | User text is joined onto instructions without delimiters, and the prompts are not versioned (AI rule 2). A code comment can steer the AI-usage review toward LOW. | Wrap user content in tags such as `<exam_document>`, `<statement>` and `<submission>`. Say in the system prompt that tagged text is data. Add `PROMPT_VERSION` constants. |

### Correctness and data

| # | Where | Problem and scenario | Fix |
|---|---|---|---|
| C1 | `judging.service.ts:128-130`; `submission.ts:155` | Events are published after the save. If a `SUBMISSION_JUDGED` listener fails, the retry finds the row DONE and publishes nothing, so that progress and scoreboard entry is lost for good. | On a redelivered DONE result for the same run, publish again. Make `recordAttempt` idempotent per submission. Or use an outbox. |
| C2 | `assessment/domain/session.ts:308-314`; `session.service.ts:320-329,438` | `Attempt.endsAt` is fixed at start. A teacher extending `closesAt` after an outage still cuts off students who already started. | Compute `min(startedAt + duration, closesAt)` from the current settings. Document it and test it. |
| C3 | `typeorm-submission.repository.ts:38`; `judging.service.ts:80-97` | Rejudged rows count toward students' pending limit. A rejudge during a live exam blocks every student with 3 or more submissions on that problem. Rejudge also resets progress before its unbounded, one-by-one loop. | Count only first runs, or put rejudges on a separate lower-priority queue. Batch the loop. Reset progress after it. |
| C4 | `importing/application/import.service.ts:70-97`; `imports.controller.ts:30-41` | Drafts are created one by one. If draft 6 fails validation, drafts 1-5 are already saved, and a retry duplicates them. | Validate every draft first (or mirror the bounds in the DTO), or create them in one transaction. |
| C5 | `classroom/infrastructure/classroom.persistence.ts:161-162` | "One pending request per student, class and kind" is check-then-insert. A double-click creates two JOIN requests, and one is never settled. | A partial unique index through a migration, mapped to `request_exists`. |
| C6 | `organization.service.ts:183-213` | "At least one organization admin" is read-then-write. Two admins demoting each other at once leave the organization with none. | One transaction with a row lock, as `reserveSeat` does. |
| C7 | `engine/src/application/judge-submission.ts:62`; `docker-sandbox.ts:188-189,233` | `programRan` is set before sealing and lowering memory, which run no student code. Docker slowness (as seen in today's gate) becomes a system error charged to the program, which counts as an attempt after the 2 free ones. The 5 s supervisor allowance does not grow with input size (up to 8 MB). | Add a `prepare()` step before `programRan`. Treat a supervisor timeout without a reply header as infrastructure. Scale the allowance with I/O size. **Needs the security-verifier and a human reviewer** (CLAUDE.md rule 5). |
| C8 | `engine/src/domain/language.ts:53,66`; `verdict.ts:32` | Java and Node get a heap equal to the full limit, and the whole RSS (runtime baseline included) is compared with that limit, so a small program can get MLE. **Needs a live run.** | Compare with limit + baseline, or give a heap of limit − baseline. Or record this as a product rule. |
| C9 | `engine/runner/oj-run.c:366` | `waitpid` on the clean-up helper has no time bound and no `WUNTRACED`. A program that keeps stopping the helper can hang `oj-run`, which then counts as a free IE. **Needs a live run.** | `WNOHANG\|WUNTRACED` against a deadline, then SIGKILL the helper. **Needs the security-verifier and a human reviewer.** |
| C10 | `integrity/application/integrity.service.ts:66-76` | Copy checks compare every submission against every other (O(n²)) on the event loop. They include the teachers' own submissions, so a reference solution produces "copied from the teacher" flags. | Compare each student's latest non-CE submission only, store fingerprints, and skip managers. |

### Performance

| # | Where | Problem | Fix |
|---|---|---|---|
| P1 | `community/infrastructure/persistence.ts:53-61`; `community.service.ts:48-57` (OJ-13) | `GET /threads/awaiting` loads every student question ever asked, answered ones included, with every reply body, and filters in memory with no limit. For an admin that is the whole table on every home-page load. | Filter to active class ids first, check for a staff reply in SQL (`NOT EXISTS … jsonb_array_elements`), add a limit and a partial index. |
| P2 | `session.service.ts:484-496,619-629`; `assessment/infrastructure/repositories.ts:90-104`; `integrity.service.ts:110-115` | Session lists run up to 3 classroom queries per session with no limit. `visibility` and `canReview` load whole sessions, test data included, one at a time. The integrity list does this for every flagged session in the system. | Batch-load class info, use a light session lookup, scope flags to managed sessions, and paginate. |

### CI

| # | Where | Problem | Fix |
|---|---|---|---|
| CI1 | `.github/workflows/ci.yml` | No `permissions:` block, so the default token permissions apply. Actions are pinned by tag, not by commit SHA. | Add `permissions: contents: read` and pin actions by SHA. Per workflow rule 5, say so in the PR. |

## Nits

- **Login, accept invitation:**
  - `team.service.ts:184-198`: accepting spends the invitation code before checking the organization invitation.
  - `claude.ts:36-38`: model names are hard-coded as fallbacks (AI rule 1).
  - `main.ts`: no `helmet`, and `x-powered-by` is not disabled.
- **Judging:** `judging.service.ts:213-218` shows `judgedAt` in hidden-results mode, which hints at a TLE.
- **Catalog:**
  - `typeorm-problem.repository.ts:113-114` selects full solution text just to compute `hasSolution`;
  - line 126 does not escape `%` and `_` in ILIKE;
  - `community/application/ports.ts:5`: the repository abstraction sits in `application/` instead of `domain/`.
- **Engine:**
  - `main.ts:53`: job data is not checked against a schema, and an unknown language leaves no result;
  - `oj-run.c:661`: a deep-folder clean-up failure shows the fork-bomb message;
  - `output-checker.ts:11`: lone `\r` and the BOM handling are not documented;
  - `config.ts:13`: `SANDBOX=local` is not refused in production.
- **Frontend:**
  - `submission-result.tsx:24-32`: polling has no backoff and no stop;
  - pagination has no `aria-current`, and `Tabs` have no tab roles;
  - `lib/sessions.ts:71`: `DAY_MS` is unused.

## Checked and sound

- **Authentication:**
  - The JWT `cv` claim revokes old tokens on a password change.
  - Role and organizations are reloaded on every request.
  - Codes are claimed atomically.
  - Wrong passwords meet a decoy hash and limits counted before the check.
  - Proxy handling is safe, and the Redis limiter fails closed.
  - The seed refuses production.
- **Ownership:** every classroom, catalog and assessment route checks management or membership. Hidden tests and
  solutions are filtered per viewer. Students see only their own submissions. Integrity flags are never shown to
  students.
- **Judge pipeline:**
  - Admission is serialised per user with an advisory lock.
  - The watchdog uses compare-and-set.
  - Jobs are self-contained; the engine never reads the database.
  - Scoring rounds the same way everywhere.
- **Sandbox:**
  - ADR 0004 flags are all in place.
  - Every untrusted run goes through `oj-run`, with every privilege drop checked.
  - Verdict forgery is closed.
  - Leftover processes are killed atomically.
  - Earlier audit fixes C3, C4, N3, N4, NF-1 to NF-5 and F-1 to F-4 still hold.
- **Frontend:**
  - Highlighted code is escaped.
  - KaTeX runs untrusted, and `javascript:` links are blocked.
  - `lib/api.ts` is the only HTTP client and logs nothing.
  - The invitation code is removed from the URL.
  - The OJ-13 changes behave as intended.

## Suggested order

1. **B1, B2 and B3:** each is small and well contained. Add a regression test for each.
2. **S1, S2 and C7:** denial of service, and a student charged for infrastructure faults.
3. **S5 and C1-C4:** integrity of grades on shared lab computers and during exams.
4. **The rest of "Should fix"**, then the nits.

**Process for engine items:** C7 and C9 touch `docker-sandbox.ts`/`oj-run.c`. CLAUDE.md rule 5 requires the
security-verifier and a human reviewer for these, so plan them as their own spec.

---

# Final round, 12 November 2026 (after OJ-13 and OJ-14)

## Method

- **Seven fresh, independent read-only reviews**, sliced differently from round one:
  - the uncommitted OJ-13/OJ-14 diff, line by line;
  - identity and shared;
  - classroom, catalog, importing and community;
  - assessment, judging and integrity;
  - the engine and `oj-run`;
  - the frontend;
  - config, database, dependencies, CI, tests and docs.
- **What each review did:** re-checked every round-one finding in its area (confirmed, wrong or fixed) and then
  looked for what round one missed.
- **How blocking items were checked:** every blocking item below was then confirmed by hand. The evidence is given
  on each.
- **Commands run during review:**
  - typecheck of all packages;
  - unit tests: frontend 49, backend 244, engine 139 (without the Docker suite);
  - URL-parser and regex probes in node.
- **Not run:** Docker, servers and load.

## Round-one status

| Item | Status now |
|---|---|
| B1 open redirect | **Fixed.** Fuzzed with dot segments, encodings, Unicode slashes and userinfo; nothing escapes. The same bug class remains in the leave guard: F-S14. |
| B2 personal data in logs | Fixed in the filter and judging, but **the OJ-14 masking regex regressed**: see F2. |
| B3 results overwriting each other | **Fixed**, including the rejudge and enqueue follow-ups. Checked against real Postgres. |
| S1-S8, C2, C5-C10, P1, P2, CI1 | **Still open; each confirmed at current lines.** |
| C1 lost events | **Confirmed, but the mechanism was wrong.** `@nestjs/event-emitter` suppresses listener errors (`suppressErrors` defaults to true), so nothing retries: a failing `recordAttempt` silently loses the progress update. |
| C2 attempt end time | **Confirmed, plus a second case.** Moving `opensAt` later after students started leaves them unable to start again. |
| C3 rejudge vs pending limit | **Confirmed, and worse after B3.** A queue error during a rejudge now ends the run as IE after progress was already reset, so an earlier AC vanishes from the board. |
| C4 non-atomic import | Partly fixed: only file-I/O is pre-checked. |
| S3 organization invite enumeration | Confirmed and **wider**: an org admin also learns that another organization or the admin invited the address, and is blocked from inviting it for 7 days. |
| Engine nit "oj-run.c:661" | Real, but the right lines are 404-409 → flag 16. |
| Frontend polling nit | Partly fixed: it stops on DONE and after 10 failures, but still has no backoff. |

## New blocking findings (all confirmed)

F1-F4 are fixed: see `docs/specs/OJ-15-final-review-blocking.md`. The security-verifier re-checked them over three
passes, and they have regression tests. F5 (migrations, OJ-5) is still open.

### F1. Hidden test inputs leak to students

**Where:** `backend/src/modules/judging/application/judging.service.ts:157` with `engine/src/domain/verdict.ts:45-50`.

**Problem:** for a runtime error the engine keeps up to 2,000 characters of the program's error output as the test's
message. In full-feedback mode, `GET /submissions/:id` returns every test's message, hidden tests included, and
the engine runs every test.

**Evidence (confirmed):** `get()` returns `s.testResults` whole when the mode is FULL, and `runMessage` returns the
error output.

**Scenario:** one submission that writes its input to the error output and exits with an error shows every hidden
input. The student then hard-codes the answers.

**Fix:**
- Show the message only for sample tests to non-managers. That needs `isSample` in the judge job or a mapping
  back to the problem.
- Add a test.

### F2. Email masking misses addresses before a full stop (regression from OJ-14)

**Where:** `backend/src/shared/domain/mask-email.ts:14`.

**Problem:** the lookahead `(?![\w.-])` added in OJ-14 rejects any address followed by a dot.

**Evidence (confirmed in node):** `"Refused hs01@truong.edu.vn."` is left unmasked, where the old pattern masked it.
This breaks security rule 6 for SMTP errors and logged errors.

**Fix:**
- Use `(?![\w-]|\.[\w-])`. It masks both cases and keeps `typeorm@0.3.27_pg@8.16.3` readable.
- Add the trailing-dot case to `api-errors.test.ts`.

### F3. A fast computer clock locks students out of timed work

**Where:** `frontend/src/components/exam.tsx:243-251, 316-326`, used on the solve and session pages.

**Problem:** `useServerOffset` starts at 0 and is set in the page's effect, which runs after the timer's own effect.
So the timer's first check uses the computer's own clock. If that clock is past the end, "time's up" is latched and
never cleared, which makes the editor read-only and locks Submit.

**Evidence (confirmed):** `timerTarget` always mounts the timer once an attempt has started, and the latch has no
reset.

**Scenario:**
- A lab PC is 1 hour fast and the exam lasts 45 minutes: the student can't submit at all.
- A few minutes fast: the student loses those minutes at the end.

Homework closing within a day is affected the same way. The server would still accept the submission; only the page
blocks it.

**Fix:**
- Compute the offset synchronously when the session is fetched, and don't render the timer until it is known.
- Work out "over" from the current time on each tick instead of latching it.
- Add a test with a skewed clock.

### F4. Pasted or imported text can freeze the API

**Where:** `backend/src/modules/importing/domain/exam-parser.ts:37` (`PROBLEM_HEADER`), used at `:111` before the
length check.

**Problem:** the pattern backtracks cubically.

**Evidence (measured):** `"bai 1" + N spaces + "x y"` takes 66 ms at N=500 and 514 ms at N=1000. It grows
about eight-fold per doubling, and the 100,000-character paste limit allows hours. The event loop blocks, so every
request and every judge result stalls. `matchSectionHeader` (`:271`) is quadratic. Pasted text and documents are
untrusted (security rule 7), and any teacher can trigger this.

**Fix:**
- Check the length before the regex.
- Turn ` `, ` ` and `\r` into newlines, and collapse runs of whitespace.
- Rewrite the header pattern with a single `\s+`.
- Add a timing test.

### F5. Production cannot start on a safe schema (known gap, now proven)

**Where:** `backend/src/app.module.ts:27`, `backend/.env.example:7` (`DB_SYNC=true`), `README.md:206,211`.

**Problem:** there are no migrations at all, so production must run TypeORM `synchronize`. A database not built that
way lacks constraints the code relies on:
- the single-admin partial unique index;
- the unique `assignmentKey` on sessions;
- the unique `pairKey` on integrity flags.

`docs/technical-overview.md:117` says the opposite.

**Fix:** carry out OJ-5: a baseline migration and `migrationsRun`; make `DB_SYNC=true` an error in production.

## New should-fix findings

### Identity

| # | Where | Problem | Fix |
|---|---|---|---|
| F-S1 | `identity/application/account.service.ts:146-165`; `rate-limits.ts:12` | The per-network limit (300 wrong passwords per 10 minutes) is counted before the password check, and correct sign-ins are not exempt. One student in a lab can lock the whole school's shared address out of signing in, repeatedly, during an exam. | Skip the network-wide key for addresses that signed in recently, and use a per-account-per-network budget for the rest. Add a test. |
| F-S2 | `account.service.ts:66-71, 199-213`; `rate-limits.ts:44` | The 20-wrong-codes budget is per address only, and a new sign-up replaces the open ticket. A stranger can spend a student's budget and block their sign-up for 24 hours. | Charge the budget per address and network, with a higher ceiling for the address alone. Don't let another network replace a valid ticket. |
| F-S3 | `config/environment.ts:55-58`; `shared/infrastructure/mail-transports.ts:38` | Every production safeguard depends on `NODE_ENV=production`. A deploy that forgets it and SMTP logs every email address, code and reset link, and accepts a weak admin password. | Use the console mail transport only in development or test, and refuse to start otherwise. |

### Content

| # | Where | Problem | Fix |
|---|---|---|---|
| F-S4 | `importing/presentation/imports.controller.ts:31-36` | Import drafts have no length caps, unlike problem editing (100k/20k). Multi-MB statements are stored and searched. | Enforce the caps in `validContent`. |
| F-S5 | `catalog/infrastructure/typeorm-problem.repository.ts:45-52` | The problem number is `MAX(seq)+1` under a unique index. Two imports at the same moment give a 500 and a half-done import. | Use a Postgres sequence. |
| F-S6 | `community/infrastructure/persistence.ts:63-80` | Replies use a full-row upsert. Two replies at once lose one, and a reply during deletion brings the thread back. | Append with a conditional UPDATE, or add a version column. |
| F-S7 | `classroom/application/classroom.service.ts:337-344` | One try/catch wraps the scheduled-purge loop, so one failing class stops every later deletion, every hour. | Catch and log per class. |
| F-S8 | `catalog/domain/problem.ts:259-268`; `problem.service.ts:104-122` | A copy of an organization-shared problem keeps its hidden tests and solution, can then be made public with them, and is kept after leaving the organization. **This is a product decision.** | Keep the source's restriction on copies of non-public problems. |
| F-S9 | `classroom.service.ts:184-186, 530-538` | Any teacher can look up any student by email and gets their name and phone; the student is enrolled without being asked. | Drop the phone, or make it a request the student accepts. |

### Assessment and judging

| # | Where | Problem | Fix |
|---|---|---|---|
| F-S10 | `assessment/application/session.service.ts:166-168` vs `:675-681` and `:224` | Points are rounded differently in different places: the teacher's board shows 9.99 where the student sees 10. Scores are stored as float4, so the client receives values such as 99.98999786. | One `earnedPoints` function everywhere, and a double-precision column. |
| F-S11 | `judging.service.ts:127-136` | The "database refused the result" fallback catches every error. A dropped connection turns an AC into a counted system error blamed on the program. | Fall back only for data errors (SQLSTATE class 22) and rethrow the rest. |
| F-S12 | `integrity/application/integrity.service.ts:57-61, 83-99` | The AI review is marked done before it runs, so one failure skips it for good. Cost is unbounded: one Claude call per judged submission, with no cap per student or session, and the in-memory queue has no bound. | Mark after success, review once per student and problem, and cap per session. |
| F-S13 | `session.service.ts:116-139` | Untimed sessions serve their problem statements before they open. **This may be intended.** | Refuse non-managers while UPCOMING, or document it. |

### Frontend

| # | Where | Problem | Fix |
|---|---|---|---|
| F-S14 | `frontend/src/components/leave-guard.tsx:54,75`; `lib/unsaved.ts:39-41` | The leave guard pushes any same-origin URL, so a link `/.//evil.com` in a shared problem's Markdown leads to evil.com after "Rời trang" (Leave). | Pass the target through `safeNext`. |
| F-S15 | `frontend/src/app/(main)/sessions/[id]/results/page.tsx:29,41` | The CSV export is open to formula injection through student names in Excel. | Prefix cells starting with `= + - @` or a tab with `'`. |
| F-S16 | `frontend/src/components/threads.tsx:128-131` | Pressing Enter twice in the question title creates two threads. | Guard on `saving`. |
| F-S17 | `test-case-manager.tsx:114`; `problem-text-field.tsx:162` | The reason AI is off is given only as a tooltip on a disabled button, which keyboard, screen-reader and touch users never get. | Show visible text with `aria-describedby`, as L3 does. |

### Engine

These touch the sandbox code: CLAUDE.md rule 5 requires the security-verifier and a human reviewer.

| # | Where | Problem | Fix |
|---|---|---|---|
| F-S18 | `engine/runner/oj-run.c:445-452, 653` | When the cgroup cannot be read (cgroup v1 or another layout), CPU accounting for unwaited children silently switches off. That is a TLE bypass up to the wall limit. **Needs a v1 host to confirm.** | Flag it, and have the self-check refuse to run without it. |
| F-S19 | `engine/runner/oj-run.c:357-366` (C9 detail) | The program's leftover processes can stop the clean-up helper, because they share its real uid. | Run the helper as `setresuid(spare, uid, spare)` and bound the wait. Fix this before reclassifying C7. |
| F-S20 | `engine/runner/Dockerfile:7` | The base image is not pinned by digest, and its setuid binaries are kept. They are harmless today only because of no-new-privileges. | Pin the digest and strip the setuid bits. |
| F-S21 | `engine/test/docker-sandbox.test.ts:24-48, 345-363` | The live sandbox tests skip silently in CI when Docker is slow, and the C4 test passes on either branch. | Fail instead of skipping when `CI` is set, and make the C4 test assert the flag. |
| F-S22 | `catalog/domain/problem.ts:7-8`; `bullmq-judge-queue.ts:44` | 200 tests × 8 MB each go inline in one job, up to 1.6 GB, past Redis's 512 MB value limit. **Needs a run.** | Cap the total test data per problem. |

### Tests and CI

| # | Where | Problem | Fix |
|---|---|---|---|
| F-S23 | `session.service.ts`; `judging.service.ts:197-232` | No test of the exam-timing rules (`not_started`, `time_up`) or of the visibility masking: the test fake always returns FULL. | Use-case tests with in-memory repositories. |
| F-S24 | `engine/test/deadline.test.ts`, `shutdown.test.ts`; Docker suite tolerances | Several engine tests depend on fixed sleeps or tight timings; this is the likely cause of today's failure under load. | Poll until a deadline, and run the Docker suite with concurrency 1. |
| F-S25 | `.github/workflows/ci.yml:46-48` | No end-to-end test judges a submission: the e2e job never starts the engine. | Build the runner, start the engine, and assert one AC and one WA. |

## New nits

- **Identity:**
  - `team.service.ts:78-90`: deleting a user has the same last-admin race as C6.
  - `organization.service.ts:99-101`: changing seats races with reservations.
  - `account.service.ts:321-334`: if `ADMIN_EMAIL` is an existing account, the server fails to start with no clear
    message.
  - `user.ts:11`: emails are not Unicode-normalised.
  - `identity.module.ts:49`: tokens last 7 days and are not revoked on sign-out.
  - `decoy-tickets.ts` is unused.
  - `email-identity-mailer.ts:27`: the sign-up email contains a display name chosen by a stranger.
- **Content:**
  - `classroom.service.ts:306-308` throws if no admin exists.
  - `ensureCodeFree` (`classroom.service.ts:425-429`) races.
  - `community.service.ts:104-118`: threads can be deleted on archived classes.
  - The thread list loads every reply body just to count them.
- **Judging:**
  - Rejudge leaves the old job queued.
  - Teachers' own submissions appear on the results board.
  - A double "Bắt đầu làm bài" (Start) can give a 500 (`session.service.ts:348`).
  - Session times without a time zone are read in the server's zone (`assessment.controllers.ts:124-133`).
  - `submit` returns PENDING when the queue is down, although the row is already DONE/IE.
- **Frontend:**
  - Download revoked too early (`results/page.tsx:54`).
  - `rehype-highlight` bundles about 37 grammars.
  - KaTeX has no `maxSize` or `maxExpand`.
  - `text-slate-400` text fails contrast.
  - The users list is not paginated.
  - A pending draft write is lost on unmount (`problem-form.tsx:88`).
- **Engine:**
  - `die()` after fork leaves the program running.
  - No `RLIMIT_STACK`: 8 MB for C and C++, 64 MB for Java.
  - `--fsize-bytes` reveals the size of large expected outputs.
  - The seal step is not in the job deadline.
  - A non-numeric `JUDGE_CONCURRENCY` gives NaN.
- **Config and docs:**
  - `.gitignore` misses `.env.*`, `*.pem` and `*.key`.
  - `.env.local` cannot override `.env` (`app.module.ts:20`).
  - Root `@types/node ^22` with Node 24.
  - CLAUDE.md says `pnpm test` covers backend and engine; it covers the frontend too.
  - `docs/API.md:80`: the roles column for `GET /organizations/:id/classes`.
  - User manual: the sign-out prompt wording.
  - OJ-13 M2: the timer is moved, not repeated.
  - `docs/technical-overview.md:126`: the status table is stale.
- **Dead code:**
  - `Submission.startJudging`;
  - `SubmissionRepository.save` (no application caller left);
  - the re-export in `domain-error.filter.ts:7`.

## Checked and sound in the final round

- **Access control:** every `GET`, `POST` and `DELETE` scoped to the actor in all eight contexts. Hidden tests and
  solutions are filtered per viewer. Integrity flags never reach students.
- **Sign-in:** JWT secret rules, HMAC only, `cv` revocation on password change, atomic code claims, decoy hash,
  single admin.
- **Sandbox:** the privilege-drop order in `oj-run` (rlimits, then no-new-privs, then setgroups, setresgid and
  setresuid, then the uid-0 check), fd hygiene, the reply protocol and the ADR 0004 container flags.
- **OJ-13 changes:** Modal focus, the leave guard and sign-out prompt, drafts per account, page titles, and the
  i18n dictionaries (1,429 keys in both languages with matching placeholders).
- **API docs:** all 98 routes in `docs/API.md` match the controllers except one roles column.

## Final counts and order

| | Blocking | Should fix | Nits |
|---|---|---|---|
| Round one, still open | 0 | 21 (C4 partly) | most |
| Final round, new | 5 (F1-F5) | 25 (F-S1 to F-S25) | about 40 |

**Order:**
1. **Before any exam:** F1 (hidden inputs), F3 (clock lockout), F4 (parser freeze) and F2 (mask regression). Each
   is small and contained.
2. **Before production:** F5 (migrations, OJ-5).
3. **Exam-day and sign-up resilience:** F-S1, F-S2, F-S3, F-S11, S1 and S2.
4. **Everything else, by area.** The engine items (C7, C9/F-S19, F-S18, F-S20) belong in one sandbox spec with
   the security-verifier and a human reviewer.
