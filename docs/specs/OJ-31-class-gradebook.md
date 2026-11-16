# OJ-31: Class gradebook

Status: done
Owner: Htet Oo Naing
Risky area: yes (new owner-scoped query: a class's scores for every student)

## Outcome

A teacher sees every student's score in every session of a class on one page and downloads it as one CSV, instead of
opening each session's results and merging CSV files by hand at the end of a term (UX review, finding 02).

## Scope

In:
- `GET /classes/:id/gradebook`: rows = students, columns = the class's sessions that have opened, cells = earned
  points, plus each student's earned and possible points over those sessions.
- Students: the current roster, plus former students who have any score in the class's sessions (marked as left).
- New page `/classes/[id]/gradebook`, reached from a "Bảng điểm" button on the class page: the table, a filter by
  session type (Đề thi, Đề kiểm tra, Bài tập về nhà, Luyện tập) that recomputes the totals for the chosen columns,
  sort by name or total, a CSV download of what is shown, and each cell linking to that student's work in that
  session (`/submissions?sessionId=…&userId=…`, OJ-30).

Out: weights per session or per type, letter grades or a 10-point scale, editing scores, publishing grades to
students, the class page tabs (OJ-32 moves this page into a tab).

## Done when

- [x] For Tin học 10A1 in the seed data, the gradebook lists 8 students and the 4 opened sessions; each cell equals
      that student's total on the session's own results page.
- [x] A session that has not opened yet is not a column; a session's column shows its type, close date and maximum.
- [x] A former student with a score appears with "Đã rời lớp"; a former student without any score does not.
- [x] Choosing "Đề thi" keeps only exam columns and the earned/possible totals change to match them.
- [x] The CSV has one row per shown student and one column per shown session, then earned, possible and percent;
      it opens in Excel with Vietnamese names intact (BOM, as the results CSV).
- [x] A cell opens `/submissions?sessionId=…&userId=…` for that student.
- [x] `GET /classes/:id/gradebook` returns 403 for a teacher who does not manage the class, 403 for a student, and
      404 `classroom.not_found` for an unknown class; an admin and the class's managers get it.
- [x] New strings in `vi` and `en`; `docs/API.md` lists the route; the gate passes.

## Contexts and contracts

- **assessment** owns it (sessions and scores live there). It reads the roster and the class through the existing
  `ClassAccess` port (`canManage`, `currentStudents`, `getClasses`), which classroom already implements: direction
  `assessment -> classroom` is allowed. No new cross-context call.
- New in assessment: `LearningRecordStore.progressOfSessions(sessionIds)` (one query instead of one per session), a
  pure function `buildGradebook` in `application/gradebook.ts` that does the maths, and `GradebookService`. Former
  students are found with the existing `ClassAccess.membership` for the few people with a score who are not on the
  roster (no new classroom method); anyone else with a score (staff trying a problem) is left out.
- Points use the same rule as the session results (`earned = points * bestScore / 100`, rounded to 0.01), extracted
  to `application/scoring.ts` and used by both, so the two pages can never disagree.
- **Contracts:** `ClassGradebookDto { classId, sessions: { id, title, type, opensAt, closesAt, maxPoints }[], rows:
  { userId, displayName, left, scores: Record<sessionId, number | null> }[] }` in `src/shared/src/api.ts`. `null` =
  never submitted in that session (shown as "—", counted as 0 like the results page). Earned, possible and percent
  are computed in the browser (`lib/gradebook.ts`) because they depend on the type filter.
- **Database:** `learning_progress` has the primary key `(userId, sessionId, problemKey)`, and a query by
  `sessionId` was a sequential scan (checked with `EXPLAIN` on the seed data). Added `@Index()` on `sessionId` with
  the generated migration `1794849351311-class-gradebook-index` (listed in `migrations/index.ts`); it also speeds up
  the existing session results.

## Security

- Route: `@Roles('ADMIN', 'TEACHER')`; the use case calls `ClassAccess.canManage(actor, classId)` (class teacher,
  org admin of the class's organization, admin) and refuses everyone else with 403 `assessment.not_class_teacher`
  (the code assigning already uses for "not your class"); an unknown class is 404 `classroom.not_found`, checked
  through `ClassAccess.getClasses`.
- Only that class's sessions are read (`SessionRepository.findByClass`); public sessions never appear.
- The response carries display names and scores only: no emails, phones or code. Nothing new is logged.
- The CSV is built in the browser from the response; it is not stored on the server.
- CSV cells that start like a formula (`=`, `+`, `-`, `@`, tab, CR) get a leading apostrophe (`lib/csv.ts`), so a
  student's display name cannot run as a formula in the teacher's spreadsheet. Found by the security-verifier; the
  session results CSV had the same gap and now uses the same helper.
- Plan includes the **security-verifier** step on the diff before review.

## Tests

- `src/backend/test/gradebook.test.ts` (new, pure function): cells match the results rule; unopened sessions are
  left out; never-submitted is `null` and counts 0; a removed (retired) problem key does not count; former students
  only with a score; totals per student; sort order.
- `src/backend/test/session-sync.test.ts` or a new results test: the session results and the gradebook give the same
  number for the same student and session (guards the shared calculation).
- `e2e/api/access-control.e2e.test.ts`: another teacher and a student get 403; the class teacher gets 200.
- `src/frontend/test/gradebook.test.ts` (new): the type filter recomputes earned/possible; the CSV rows and columns
  match the shown table.

## Rollout and risks

- One PR on `feat/oj-31-class-gradebook`: contract, backend, then frontend. The route is new, so nothing existing
  changes.
- Risk: classes with many sessions make a wide table. The table scrolls inside its card and the name column stays
  fixed, as on the results page.
- Risk: teachers expect a weighted or 10-point grade. Out of scope; the CSV gives them the raw numbers. Ask two
  teachers after release which scale they need (UX review, decision 02).
- Roll back: revert the PR; no data to undo (unless the index migration ships, which is safe to keep).
