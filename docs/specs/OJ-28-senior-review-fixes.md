# OJ-28: Fixes from the senior review of OJ-5 and OJ-25 to OJ-27

Status: done (approved by the user 2026-11-14: "fix", after the senior review listed 7 should-fix findings and 7 nits)
Owner: Htet Oo Naing
Risky area: yes (startup and migrations, owner-scoped lists, AI allowances)

## Outcome

All 14 findings are closed (R1 to R14, numbered as in the review). A broken migration or a stuck lock stops the backend
quickly and cleanly. Lists cannot skip or repeat items, and every AI-eligible first solution is reviewed once the
allowance allows it.

## Scope

**Startup and migrations:**
- **R1:**
  - `openDatabase` connects, runs `prepareDatabase`, destroys the connection pool on failure, and throws
    `DatabasePreparationError`. Nest's connection retry skips that error (`toRetry`).
  - An unlock failure is logged; it does not replace the migration's own error.
- **R2:** `FirstReviews1794624915638` uses `IF NOT EXISTS`, which is allowed because it is unreleased. README and
  CLAUDE.md rule 10 say to generate migrations only against a database built by migrations, with `DB_SYNC=false`.
- **R5:** `migration:run` and `migration:revert` go through `src/migrate.ts` under the same advisory lock as startup.
  `show`, `generate` and `check` stay on the TypeORM command line.
- **R9:** the lock is taken with `pg_try_advisory_lock`, retried until a deadline (`MIGRATION_LOCK_WAIT_MS`, default
  10 minutes). Past it, startup fails and says why.
- **R10:** the baseline's `down()` refuses with an error instead of dropping every table.

**Lists:**
- **R3 and R12, learning paths:**
  - `GET /paths` returns `LearningPathPageDto { items, next }`, ordered by `createdAt` then `id`, which never change.
  - `next` is an opaque cursor for `?before=`, or `null` on the last page.
  - The server reads one row more than `limit`, so "Xem thêm" (show more) appears only when more paths exist.
  - `offset` is removed. This is acceptable because the endpoint is unreleased and the frontend is its only caller.
- **R4 and R14, `GET /threads/awaiting`:**
  - The classroom facade gets `activeManagedClassIds(actor)`, behind the community port.
  - One SQL query, limited to `AWAITING_QUESTIONS_LIMIT`, replaces the page loop, so nothing can be repeated or
    skipped.
  - The stale duplicate doc comment is removed.

**AI, contracts and docs:**
- **R11:** the first-solution claim is released when the allowance refuses or the AI call fails, so the student's first
  accepted solution is reviewed once uses are available again.
- **R7:** `PathListQuery implements ListPathsQuery`, and the frontend uses the contract type.
- **R8:** ADR 0005 records AI access and allowances as the one shared kernel.
- **R6:** README, ADR 0003, the OJ-5 spec and the technical overview now describe the lock and `prepareDatabase`.

**R13 (tests):** `openDatabase` is tested end to end:
- with sync enabled, the migrations run first and then sync, with no drift;
- a failing migration leaves the lock free and the pool closed.

## Done when

- [x] A failing migration makes `openDatabase` throw `DatabasePreparationError` at once (not retried). The lock is
      free afterwards, and the data source is destroyed.
- [x] Startup waits for another holder of the lock and fails with a clear error after the deadline (tested with a short
      deadline).
- [x] `migration:run` and `migration:revert` take the lock, and the baseline's `down()` refuses.
- [x] Paths:
  - pages chained by `next` list every public path exactly once, even when a path is edited or removed between pages;
  - `next` is `null` on the last page, including when the total is an exact multiple of the page size;
  - a malformed `before` gives a 400.
- [x] The awaiting list:
  - is one query over the active classes the actor manages, at most 50 items, newest first;
  - archived classes are excluded in SQL.
- [x] A refused or failed AI check releases the claim, and the next accepted solution of that student and problem is
      reviewed.
- [x] Docs match the code. The gate, the integration suites and the e2e API suite pass, and the paths page works live.

## Results and notes (2026-11-14)

- **Failing-then-passing:**
  - **R1:** without closing the pool on failure, the startup test sees 2 leaked connections.
  - **R11:** without releasing the claim, a refused or failed review is never retried.
  - Both tests fail without their fix and pass with it.
- **Startup (integration):**
  - A broken migration ends startup at once with `DatabasePreparationError`. It is not retried, no connection stays
    open, the lock is free, and the migration left nothing behind. TypeORM's own bookkeeping table records nothing.
  - A held lock makes startup wait, then fail with a clear message after the deadline.
  - With `DB_SYNC`, migrations run first and sync after, with no drift.
  - The baseline refuses to revert.
- **CLI:** on a fresh database, `migration:run` twice, then `migration:revert`, then `migration:run` and
  `migration:check` all worked under the lock and found no drift.
- **Live, on the throwaway stack:**
  - 48 public paths: two pages of 24, and `next` is null after the second (an exact multiple).
  - A path edited and a path removed between the two pages: all paths that remained were listed once, the edited one
    included.
  - A bad cursor gives `assessment.invalid_cursor`.
  - In the browser, "Xem thêm" (show more) loaded the rest (47 unique) and then disappeared. No console errors.
  - 55 questions: `GET /threads/awaiting` returned 50, newest first, from one query.
- **Developer database:** the built backend started on it through `openDatabase`; paths and awaiting answer.
- **Checks run:**
  - the gate: backend 350, engine 169, frontend 78;
  - the integration suites: 59;
  - the e2e API suite: 17.
