# OJ-30: Open one student's work from the session results

Status: done
Owner: Htet Oo Naing
Risky area: yes (owner-scoped query in judging: who may list whose submissions)

## Outcome

A teacher looking at a session's results can see one student's attempts on a problem in one click, instead of scanning
every student's submissions. Today every score cell on `/sessions/:id/results` links to
`/submissions?sessionId=…&problemKey=…` with no student, and `GET /submissions` has no student filter (UX review,
finding 01, 16 Nov 2026).

## Scope

In:
- `GET /submissions` accepts an optional `userId`, scoped to the actor (rules under Security).
- Results page: a score cell opens a panel for that student and problem: attempts newest first with verdict,
  score, language, time and a link to `/submissions/:id`. The student's name opens the same panel for all problems.
  The panel is the app's `Modal` (focus trap, Esc, focus return already tested) rather than a new side drawer.
- The panel links to "all of this student's submissions in the session": `/submissions?sessionId=…&userId=…`. The
  submissions page reads `userId` from the URL and shows it as a removable filter chip with the student's name.
- `SubmissionQuery` moves from `src/frontend/src/lib/api.ts` to `@oj/contracts` (CLAUDE.md rule 6) and gains `userId`.

Out: class gradebook (OJ-31), messaging the student from the panel, class page tabs (OJ-32), any change to what a
student sees.

## Done when

- [x] `GET /submissions?sessionId=S&userId=U` returns only U's submissions in S for a manager of S and for an admin.
- [x] It returns 403 `judging.not_session_manager` for staff who don't manage S, and for staff who send `userId`
      without `sessionId`.
- [x] It returns 403 `judging.not_owner` for a student who sends another user's id; a student's own id works as today.
- [x] Requests without `userId` behave exactly as before (existing tests unchanged and passing).
- [x] On the results page, clicking Vũ Ngọc Chi's "Bài 1" score opens a panel listing only her attempts on Bài 1;
      clicking her name lists her attempts on every problem; Esc closes it and focus returns to the cell.
- [x] At phone width the panel fills the screen width and the results table does not scroll the page sideways.
- [x] `/submissions?sessionId=…&userId=…` shows the chip "Học sinh: <name>"; removing it shows the whole session.
- [x] New strings exist in `vi` and `en`; `i18n-coverage.test.ts` passes.
- [x] `docs/API.md` documents `userId` and its rules; `pnpm build:shared && pnpm typecheck && pnpm test` pass.

## Contexts and contracts

- **judging** only: `ListSubmissionsQuery` gains `userId`; `JudgingService.list` applies the rules below through the
  existing `SessionGateway.canReview` port. `SubmissionQueries.list` already filters by `userId`, so the repository
  does not change. The results page already has each row's `userId` from `SessionResultsDto`, so assessment does not
  change. No new cross-context call.
- **Contracts:** `SubmissionQuery { sessionId?, problemKey?, userId?, mine?, page?, pageSize? }` in
  `src/shared/src/api.ts`; the frontend imports it instead of declaring its own.
- **Database:** no entity change, no migration. Check the query plan for `(session_id, user_id)` on the seed data;
  if it scans the table, add an index with a generated migration in this PR.

## Security

- Route: `GET /submissions` stays in `ANY_SIGNED_IN_USER` (`public-routes.test.ts`); the use case does the checks.
- Rules for `userId` in `JudgingService.list`:
  - admin: any user, with or without `sessionId`;
  - teacher or org staff: only together with a `sessionId` that `canReview` allows; otherwise 403, never a silent
    fallback to "mine" (an empty list would look like "the student never submitted");
  - student: only their own id; another id is 403.
- Validation: `@IsOptional() @IsUUID() userId` on `ListQuery`; unknown fields are stripped as today.
- Results visibility is unchanged: managers already see full results of other users' submissions (`toDtos`).
- Nothing new leaves the system; nothing new is logged (no ids or emails in logs).
- Plan includes the **security-verifier** step on the diff before review.

## Tests

- `src/backend/test/judging.test.ts` (in-memory): manager + `sessionId` + `userId` lists only that student;
  `problemKey` + `userId` combined; admin with `userId` and no session; teacher of another session → 403;
  staff with `userId` and no `sessionId` → 403; student with another id → 403; student with own id → own list.
- `e2e/api/access-control.e2e.test.ts`: over HTTP, student B cannot list student A with `userId`; a teacher of
  another class cannot list A in this session.
- `src/frontend/test/results-links.test.ts` (new): the panel and "all submissions" URLs carry `sessionId`,
  `userId` and an encoded `problemKey`.
- `src/frontend/test/i18n-coverage.test.ts`: runs as is over the new component.

## Rollout and risks

- One PR on `feat/oj-30-student-work-from-results`: backend and contract first in the diff, then the frontend. The
  API change is additive, so an older frontend keeps working.
- Watch after deploy: 403 rate on `GET /submissions` (a spike means a client sends `userId` where it shouldn't).
- Risk: a teacher who co-manages through an organization must pass `canReview`; covered by the existing port, add one
  case if the in-memory gateway models organizations.
- Roll back: revert the PR; no data to undo.
