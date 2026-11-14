# OJ-26: Remaining findings of the manager review

Status: done (approved by the user 2026-11-14: "cover all", after OJ-5 listed what it did not cover)
Owner: Htet Oo Naing
Risky area: yes (schema migration, owner-scoped query, AI access)

## Outcome

Every open finding of the engineering-manager review of OJ-13 to OJ-24, and the gap OJ-5 left, is closed:
- **M1 (OJ-5 gap):** migrations take no lock, so two backend instances starting together could run them twice.
- **M2 (review 6):** `GET /threads/awaiting` loaded every student question ever asked, with replies, and filtered in
  JavaScript. For an admin, that is the whole table on every teacher home page.
- **M3 (review 7):** `AiQuota` sits in the shared application layer and is used by Catalog, Importing and Integrity, but
  CLAUDE.md does not allow that.
- **M4 (review 8):** the once-a-month log of skipped AI checks used the UTC month, while allowances use the Vietnam
  month.
- **M5 (review 9):** `MeDto.canUseAi` and `aiPlan` were computed separately and could disagree.
- **M6 (review 10):** "review only a student's first accepted solution" was stored in `integrity_checks`, under a fake
  submission id hashed from session, problem and student.

## Scope

In:
- **M1:** the API runs pending migrations while holding a PostgreSQL advisory lock. A second instance waits, then finds
  nothing pending. `DB_SYNC` (development) runs after the migrations, as before.
- **M2:** `ThreadRepository.listAwaitingQuestions(classIds, { limit, offset })`:
  - the database filters for student questions with no reply from staff and sorts them, newest first;
  - the service reads pages of 100 until it has 50 questions from active classes;
  - the home page shows at most the 50 newest.
- **M3:** CLAUDE.md names AI access and allowances (`shared/application/ai-access.ts`, `ai-quota.ts`,
  `ai-availability.ts`) as a shared kernel. This matches how `AiAccess` has worked since OJ-8. It is a smaller change
  than a new identity port that only forwards calls.
- **M4:** the log key uses `aiPeriod(now).period`.
- **M5:** one rule in the domain: `hasFullAi(plan)` is true for PLUS and UNLIMITED. `MeDto.canUseAi` is derived from the
  plan, and `User.canUseAi` is removed.
- **M6:** a table `integrity_first_reviews` (`sessionId`, `problemKey`, `userId`, `reviewedAt`), keyed by those three
  columns, with the same atomic insert.
  - Migration `FirstReviews1794624915638` creates the table and removes the old hashed `AI_FIRST` rows; their key
    cannot be turned back into a session, problem and student.
  - Effect: on a database that already ran OJ-21 checks (development only; production is still at `master`), a student
    whose first accepted solution was reviewed may be reviewed once more.

Out:
- Paging for the public list of learning paths (N4 of the OJ-24 security check). It stays as decided there:
  classroom scale.
- Splitting the work into commits and PRs, and a colleague's review. The user does all git work.

## Done when

- [x] Two instances migrating one empty database at the same time both start. Each migration is applied once.
- [x] The awaiting list:
  - returns only unanswered student questions from active classes, newest first, at most 50;
  - it is correct when the newest questions are all in archived classes;
  - the SQL filter is tested on PostgreSQL.
- [x] A FREE teacher's `MeDto` has `canUseAi: false` and `aiPlan: FREE`. A VIP or organization teacher has `true` and
      `PLUS`. Both come from one function.
- [x] First-solution reviews are stored in `integrity_first_reviews`, and only the first of two parallel claims wins
      (PostgreSQL).
- [x] The migrations integration test covers the new migration. Drift stays empty.
- [x] The gate, the integration suites and the e2e API suite pass. The developer database migrates at startup.

## Tests

- `migrations.integration.test.ts`:
  - parallel instances;
  - the new table;
  - removal of the old `AI_FIRST` rows.
- `community-awaiting.test.ts`: the limit, and paging past archived classes.
- `postgres.integration.test.ts`: the awaiting SQL filter.
- `integrity.integration.test.ts`: the first-review claim in the new table.
- `ai-quota.test.ts`: `hasFullAi`, and `MeDto` from the plan.

## Results and notes (2026-11-14)

- **M1:** with the lock, two instances on one empty schema both start and record each migration once. With the lock
  removed, the same test failed 3 times out of 3.
- **M2:** the home page now says "50 or more" ("Từ 50 câu hỏi trở lên") when the list is full, instead of a count that
  stops at 50. The limit lives in `@oj/contracts` (`AWAITING_QUESTIONS_LIMIT`) and is shared by the backend and the
  page.
- **M6:**
  - The migration was generated with the new `migration:generate` command; its first real use worked.
  - The integrity test had used `"hs1"` as a student id, which the old hashed key had hidden. The new key checks that
    the column holds a real id (uuid), so the test now uses real ids.
- **Developer database:** the built backend migrated it at startup (`FirstReviews1794624915638`). It had no `AI_FIRST`
  rows, and its 16 plagiarism records are unchanged. `GET /threads/awaiting` and `GET /auth/me` answer as expected.
- **Checks run:**
  - the gate: backend 345, engine 169, frontend 78;
  - the integration suites: 54;
  - the e2e API suite: 17.
