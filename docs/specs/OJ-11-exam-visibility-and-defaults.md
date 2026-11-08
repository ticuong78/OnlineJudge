# OJ-11: Open exams on the student home page, exam settings when assigning an exam set

Status: done (approved by Htet Oo Naing, 2026-11-08: "Yes, fix both")
Owner: Htet Oo Naing
Risky area: no (frontend only, no contract or API change)

## Outcome

Found in the product review of 2026-11-08: a student whose timed exam is open but not started did not see it on the
home page (the shortcut even pointed to a practice session), and assigning an exam set started from open practice
settings (no timer, every test result shown, unlimited submissions, no plagiarism check). After this change students
are pointed at a waiting exam first, and exam and test sets are assigned with exam settings filled in.

## Scope

In:
1. Student home: open sessions that need "Bắt đầu làm bài" are listed in "Bài đang mở", first, marked
   "Chưa bắt đầu, N phút" instead of "0/N". The main card becomes "Vào thi" for such a session, ahead of "Làm tiếp".
2. "Giao bài" from a set: the settings start from the set's type. Đề thi: 90 minutes, 3 submissions per problem, results
   hidden until the session closes, plagiarism check on. Đề kiểm tra: the existing "Bài kiểm tra" preset (45 minutes,
   3 submissions, score only) plus plagiarism check on. Homework, practice and single problems keep the open defaults.
   The settings panel opens and says the values were filled in from the set type; the teacher can change everything.

Out: server-side defaults (the API keeps taking explicit settings), notifications for exams, the AI-usage check default.

## Done when

- [x] Frontend unit tests: the student's open list includes a not-started timed exam first and drops finished or
      expired ones; default settings per set type. Both fail before the change.
- [x] In the browser: hs09 sees "Kiểm tra giữa kỳ" on the home page with "Vào thi"; "Giao bài" for "Thi học kỳ I" shows
      90 minutes, hidden results, plagiarism check on.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` (frontend 22, backend 228, engine 166) and the browser
      end-to-end suite (8) pass. Checked in the browser on 2026-11-08.
- [x] User manual and test plan updated.

## Contexts and contracts

Frontend only: `lib/sessions.ts`, `lib/exam.ts`, `app/(main)/page.tsx`, `components/sessions.tsx`,
`components/exam.tsx`, `app/(main)/bank/sets/[id]/page.tsx`. No contract, API or database change.

## Security

None: what a student may open or submit is still decided by the API (`needsStart`, `canSubmit`).

## Tests

`src/frontend/test/exam-home.test.ts`: `studentOpenSessions`, `defaultSettingsFor`.

## Rollout and risks

Existing sessions are unchanged. Teachers who relied on open defaults for an exam set now get exam settings and can
switch them back in the panel.
