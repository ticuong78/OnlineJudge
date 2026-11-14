# OJ-14: Blocking fixes from the whole-codebase review

Status: done (approved by the user 2026-11-12: "Fix blocking")
Owner: Htet Oo Naing
Risky area: yes (identity sign-in redirect, logging of personal data, judging result storage)

## Outcome

The three blocking findings of `docs/testing/code-review-2026-11-12.md` are closed:
- **B1:** sign-in cannot send a user to another site.
- **B2:** unexpected errors no longer write students' emails or hashes into the logs.
- **B3:** a judge result can no longer be overwritten by a late "started" message or an older run.

## Scope

In:
- **B1:** `safeNext` moves to `src/frontend/src/lib/safe-next.ts`. It resolves the value against the current origin
  and accepts only a same-origin path. It drops backslash, tab and newline tricks and protocol-relative URLs.
- **B2:** `ApiExceptionFilter` logs only the error's name, its message with emails masked, and its stack with emails
  masked. It never logs the error object, so query parameters, driver detail and payloads stay out of the logs.
- **B3:** judge results are written with conditional UPDATEs, the same pattern as `failIfUnfinished`:
  - `markJudging(id, run)` applies only to a PENDING row of that run;
  - `storeResult(submission)` applies only to an unfinished row of the same run.

  Events are published only when the write applied, so a duplicate or late result does nothing.

Out:
- The other review findings, which have their own specs.
- An outbox for lost events (review C1).

## Done when

- [x] Frontend test: `/\evil.com`, `/\t/evil.com`, `//evil.com`, `https://evil.com` and `javascript:` all fall back to
      `/`; `/bank?tab=sets#x` is kept.
- [x] Backend test: a fake `QueryFailedError` with an email in its parameters and detail produces a log line with no
      email, no parameters and no hash.
- [x] Backend test: "finished" and "started" for the same submission, handled at the same time in either order, end
      DONE with the verdict. A result for an older run after a rejudge leaves the new run alone.
- [x] Live: `/login?next=/%5Cevil.com` stays on the site after sign-in.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass, and the security-verifier finds nothing open.

## Contexts and contracts

- **Frontend:** the `(auth)` login page and a new `lib/safe-next.ts`.
- **shared/presentation:** the error filter.
- **judging:** domain repository abstraction (two new methods), TypeORM implementation and `JudgingService`.
- **Contracts and database:** no contract change and no schema change.

## Security

- B1 and B2 are security fixes.
- B3 changes how grades are stored: the security-verifier reviews it before merge.

## Tests

- `src/frontend/test/uat-fixes.test.ts`, or a new `safe-next` test.
- `src/backend/test/api-errors.test.ts`.
- `src/backend/test/judging.test.ts`.

## Security-verifier findings and follow-ups (2026-11-12)

The verifier reviewed the first version and found three gaps. All are fixed, with tests:
- **B1 was not closed.** Dot segments collapse after the check: `/.//evil.com` became the path `//evil.com`.
  `safeNext` now checks the normalised path again. The cases are in `safe-next.test.ts`.
- **B2 had two more error objects passed to the logger** in `judging.service.ts`.
  - `errorForLog` moved to `shared/domain/mask-email.ts` and is used there.
  - Email masking no longer mangles package paths such as `typeorm@0.3.27_pg@8.16.3` in stack frames.
- **B3 had two remaining full-row saves:**
  - Rejudge now uses `requeue(submission, fromRun)`, so two concurrent rejudges queue once.
  - A failed enqueue now uses `failIfUnfinished`, so a result stored meanwhile stands.
  - `Submission.failToEnqueue` was removed as unused.

Real SQL: `postgres.integration.test.ts` exercises `storeResult`, `markJudging`, `requeue` and `failIfUnfinished`
together (17/17 on the test database).

Live checks on the throwaway stack:
- `/login?next=/%5Cevil.example` and `/login?next=/.//evil.example` stay on the site.
- `?next=/progress` still works.
- A real submission was judged AC and stored.

## Rollout and risks

There is no migration. After deploy, watch for submissions stuck in JUDGING: the watchdog still covers them.
