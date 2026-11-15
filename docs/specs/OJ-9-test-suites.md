# OJ-9: Integration and end-to-end test suites

Status: done (requested by the owner 2026-11-08; new packages approved: tsx in the frontend, Playwright)
Owner: Htet Oo Naing
Risky area: yes (CI: new `e2e` job)

## Outcome

Every layer is tested where it can break: unit tests for logic (now including the frontend), integration tests on
real PostgreSQL and Redis (the atomic statements and the OJ-8 seat lock), and end-to-end tests that drive the real
compiled backend over HTTP and the real frontend in a browser. None of them can touch development data.

## Scope

In:
- `docker-compose.test.yml`: throwaway Postgres (55432) and Redis (56379), data in memory; `pnpm infra:test:up|down`.
- Integration: the existing PostgreSQL/Redis suites (never run before) plus `test/organization.integration.test.ts`
  (parallel seat reservations, conditional accept, no membership overwrite, uuid[] sharing queries, classes by org).
- Frontend unit tests (`src/frontend/test`, node:test + tsx): points rounding identical to the backend, plan dates,
  class codes, session sorting and countdowns, exam settings, the browser-translation guard. `earnedPoints` and
  `formatPlanDate` moved into `lib/utils.ts` so they are testable.
- E2E harness (`e2e/support`): starts `src/backend/dist/main.js` as its own process on a fresh database per run
  (dropped afterwards) and a flushed Redis database; reads emails (codes, links) from the backend log, as in
  development. Refuses anything but the throwaway stack outside CI.
- HTTP E2E (`e2e/api`, 17 tests): accounts (invitation, sign-up code, password reset), classroom journey (join
  request, session, hidden tests never sent, submission limits, archive), organization plan, role boundaries.
- Browser E2E (`e2e/browser`, Playwright, 8 tests): sign-in per role and menus, a student submitting from the code
  editor, organization invite/accept and new-teacher activation from the emailed link. The frontend is a production
  build in `.next-e2e` on port 3100 (`NEXT_DIST_DIR`), so a running `next dev` is never disturbed.
- CI: new `e2e` job (after `verify`) with services on the test ports; Playwright report uploaded on failure.

Out: judging in end-to-end runs (the engine is not started; submissions are admitted and queued only), visual
regression, load tests.

## Done when

- [x] `pnpm test` (unit, all three packages) passes: frontend 15, backend 221, engine 166.
- [x] `pnpm test:integration` passes on the throwaway stack: 34. The suites refuse the development ports outside CI.
- [x] `pnpm test:e2e:api` passes: 17 (exact status and error codes). `pnpm test:e2e:browser` passes: 8 (no retries).
- [x] Removing the seat lock makes the parallel seat tests fail; adding a route without `@Roles`/`@Public` makes
      `public-routes.test.ts` fail (both checked 2026-11-08).
- [x] UAT scripts executed at API level on a fresh seed (2026-11-08): 45 pass, 1 blocked (AI needs a key).
- [x] README "Kiểm thử" section; no instruction points tests at the development database any more.

## Review (2026-11-08)

Independent product, engineering and test-manager reviews of the manual, the technical overview, the local setup
guide and this plan; their findings were applied. Test-code fixes from the review: an archive assertion that passed
for the wrong reason, loose `>= 400` checks, a fixed sleep, an imprecise browser selector, browser retries, a shared
Redis database between suites, a leaked database when the backend fails to start, the integration guard, and the new
route-authorization guard test.
