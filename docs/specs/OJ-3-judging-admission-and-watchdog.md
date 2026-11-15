# OJ-3: Atomic submission admission and judge watchdog

Status: approved 2026-11-07 by Htet Oo Naing (retroactive; still needs a second human reviewer before the PR)
Owner: Htet Oo Naing
Risky area: yes (judging)

## Outcome

Two problems are fixed:
- **Racing submissions:** a burst of parallel submissions could get past the "max pending" and "max per problem" limits, because the code counted first and saved afterwards.
- **Lost jobs:** a submission whose judge job is lost stayed PENDING forever and blocked the student from submitting again.

Now admission is one atomic database step, and a watchdog ends lost submissions as IE so the student can resubmit.

## Scope

In:
- `SubmissionRepository.admit` and `typeorm-submission.repository.ts`, which uses an advisory lock per user and the conditional updates `failIfUnfinished` and `findStale`.
- `judging.service.ts`, `judge-watchdog.ts`, `bullmq-judge-queue.ts` (job lookup), `submission.ts`, `submission.orm-entity.ts`, and `judging.module.ts`.
- The `JUDGE_STALE_AFTER_SECONDS` and `JUDGE_GIVE_UP_AFTER_SECONDS` settings.

Out: requeueing lost jobs automatically.

## Done when

- [x] N parallel submissions never exceed `maxPending` or `maxSubmissions` (`judging.test.ts`), and the same holds against PostgreSQL. (`judging.test.ts` passes; the PostgreSQL case is in the suite that now runs in CI.)
- [x] Review finding S1 fixed: give-up applies only to active jobs, is never shorter than the largest engine job deadline, and removes the queued job when it fails a submission. Done 2026-11-07, slightly differently from the wording above: no formula is copied into the backend.
  - The engine records each job's own deadline as BullMQ job progress (`JudgeJobProgress` in `@oj/contracts`).
  - The watchdog never gives up on waiting jobs, and gives up on active ones only after that deadline plus 2 minutes (older engines: `JUDGE_GIVE_UP_AFTER_SECONDS` from when the job started).
  - It then removes the job.
  - Tests in `judging.test.ts`.
- [x] Review finding S2 fixed: the watchdog pages past the oldest 200 unfinished submissions. Done: `findStale` takes a cursor (queue time, id) and the sweep pages up to 5,000 per pass. Tests in `judging.test.ts`, plus a PostgreSQL paging case.
- [x] Review finding S3 fixed: `postgres.integration.test.ts` runs with `TEST_DATABASE_URL`. Either it runs locally and the output goes in the PR, or CI gains a Postgres service, which must be called out in the PR. Done through CI: `.github/workflows/ci.yml` now runs throwaway Postgres and Redis services with `TEST_DATABASE_URL` and `TEST_REDIS_URL`. **This is a CI change and must be called out in the PR.** The suites could not be run locally in this session.
- [x] security-verifier run on this diff (2026-11-07): S2 fixed; S1 and CI partly. Its Lows were fixed the same day, each with a test in `judging.test.ts`:
  - S1-a: no run may last longer than 4 hours, whatever deadline an engine reports.
  - S1-b: a deadline counts only for the attempt it was announced for (`JudgeJobProgress.startedAt` must equal the job's `processedOn`).
  - S1-c: queue calls time out after 5 s (then "unknown"), and a sweep never starts while the previous one is still running.
  - S1-d: a job the engine has finished gets 5 minutes for its result to be applied before the submission counts as lost.
  - Long waits: jobs waiting longer than the give-up time are reported in the log ("Is an engine running?") and never ended, since they are judged once an engine runs again.
  - CI: builds the runner image so the live sandbox tests run there; timeout raised to 30 minutes. The trigger stays on `main` until the branch is renamed, as Htet decided.

  Gate: backend 185/185, engine 154/154. Not re-verified by the security-verifier after these last fixes. The BullMQ adapter (`inspect`, `discard`) still has no test against real Redis.
- [x] Re-verified on 2026-11-07: S1-a to S1-d fixed (`processedOn` checked in the bullmq source). Open Lows: NF-6 (no timeout on the watchdog's database calls) and NF-4 (CI trigger is `main`; resolved by the branch rename).
- [x] IE backstop (approved by Htet 2026-11-07): `FREE_ENGINE_ERRORS` in `domain/submission.ts`. Admission counts real attempts plus engine-reported IEs beyond 2 per student and problem in 24 hours; the backend's own IEs (`BACKEND_FAULT_MESSAGES`: queue down, lost result) never count. Tests in `judging.test.ts` (three) and a PostgreSQL case (runs in CI). README and `docs/API.md` updated.
- [ ] NF-6 (Low): no timeout on the watchdog's database calls. Open.
- [x] F-2 and F-3 fixed 2026-11-07 (approved by Htet):
  - F-3: `submissions.faultSource` (`infrastructure` or `program`) is stored with every IE: from the engine's tag, `infrastructure` for queue failures and lost results, `program` when the engine sent none. Admission counts real attempts plus `program` IEs beyond `FREE_PROGRAM_ERRORS` (2), with no time window and no message matching. Tests in `judging.test.ts` (no daily reset; infrastructure never counts) and a PostgreSQL case.
  - F-2: `Submission.complete` strips NUL and lone surrogates. If saving a result still fails, `applyJudgeResult` stores a counted IE (`RESULT_NOT_STORED_MESSAGE`, `program`) instead of leaving it for the watchdog (`judging.test.ts`).
  - New column `submissions."faultSource" varchar(16)`: `DB_SYNC` adds it; otherwise run the `ALTER` in the README. Add it to the OJ-5 baseline. `@oj/contracts` gains `SystemFault` on the finished message.
- [ ] Second human reviewer.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass. (2026-11-07, latest: backend 185/185, engine 154/154 with live Docker.)

## Contexts and contracts

Judging only. The `Submission` entity gains a nullable `queuedAt timestamptz` column. Once OJ-5 lands this needs a migration; until then `DB_SYNC` adds it. `@oj/contracts` gains `JudgeJobProgress` (the deadline the engine announces on a job); the engine also changes (`main.ts` reports it).

## Security

The new query is scoped by `userId` through the advisory lock. The watchdog is a system job with no actor.

## Tests

`judging.test.ts`, `postgres.integration.test.ts`.

## Rollout and risks

Check that the new column exists before the watchdog starts. Watch the IE count, because a high count means the stale threshold is too short for the exam backlog.
