# OJ-7: UX fixes from the product review

Status: done (approved by the user 2026-11-08: "Yes, fix them")
Owner: Htet Oo Naing
Risky area: no (frontend display only)

## Outcome

Five small display problems found while walking every role's journeys on the seeded data are fixed, so students
read their scores the same way teachers do and closed or upcoming sessions say what is actually going on.

## Scope

In:
1. Session page (student): a problem's best result is shown in points of that problem ("Cao nhất 13.33/40 điểm"),
   matching the teacher's results board, instead of a percentage written as "33.33/100". The learning record's
   per-problem chips (which have no points in the contract) show a percentage with a `%` sign.
2. "Còn x/y lần nộp" is shown only while the session is open (session page and problem page).
3. A timed session that has not opened says when it opens ("Phiên mở lúc …"); a closed one says it is closed.
4. Staff get "Cần xem lại" (integrity review) in the main menu.
5. The administrator's problem and set banks open on "Tất cả" when no choice was saved (their own bank is empty).

Out: contract changes (no points per problem in the learning record), bulk student import, multiple administrators.

## Done when

- [x] The five behaviours above can be seen on the seeded data (hs01, gv.minh, admin).
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass.

## Contexts and contracts

Frontend only: `app/(main)/sessions/[id]`, `sessions/[id]/problems/[key]`, `progress`, `bank`, `bank/sets`,
`components/exam.tsx`, `components/app-shell.tsx`. No contract, backend or migration change.

## Security

No new route or query. The integrity menu item is shown to staff only; the page and API already enforce roles.

## Tests

The frontend has no test runner; checked in the browser on the seeded data, and by typecheck.

## Rollout and risks

None beyond a normal frontend deploy; revert the commit to roll back.

## Follow-ups from the review (2026-11-08)

Found by the code review, QA and UAT passes on this change; approved by the user ("Yes, fix all three").

- Menu: with "Cần xem lại" the admin menu made the page scroll sideways at 800px and labels wrapped up to 1024px.
  The inline menu now starts at `lg` (1024px) with labels kept on one line; the name block, the logo text and the
  sign-out label come back at `xl`. Below `lg` the drawer is used.
- Seed: the safety check now runs before Nest starts (`src/backend/src/seed-guard.ts`), reading `.env` and
  `.env.local` the way ConfigModule does, and also refuses a non-local `REDIS_URL`. Tested in
  `test/seed-guard.test.ts`.
- Invitation and password-reset links: in development (React Strict Mode) the code or token read from the link was
  cleared again by the effect's second run. Both now keep what the first run read.
