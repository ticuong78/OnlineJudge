# OJ-18: Trial run on the sample tests ("Chạy thử")

Status: done (approved by the user 2026-11-13: "proceed to the rest", covering P1-4 of the UI/UX review)
Owner: Htet Oo Naing
Risky area: yes (judging: a new kind of judge job; the engine returns program output for it)

## Outcome

On the solve page a student can run their code against the problem's **sample tests** and see, for each one:
- the input;
- the expected output;
- their own output;
- the verdict and the time.

None of this records a submission: no attempt, no score, no scoreboard entry, no integrity check. Today every check
costs a real submission, and in limited exams an attempt.

## Scope

In:
- **Contracts:**
  - `JudgeJob.trial?: true`;
  - `TestCaseResult.output?: string` (trial jobs only, at most 4,000 characters);
  - `trial?: true` echoed on both result messages;
  - `CreateTrialRunRequest` and `TrialRunDto`.
- **Backend (judging):** `TrialRunService`.
  - `POST /sessions/:id/problems/:key/trial-runs`:
    - takes the language and source code;
    - checks the language is allowed and the source is at most 70 KB;
    - allows it only when the student may view the statement (same rule as `GET` problem);
    - runs the sample tests only, and fails with `judging.no_samples` when there are none.
  - `GET /trial-runs/:id`: the owner only.
  - Trials live in Redis for 15 minutes and never touch the database.
  - Limits:
    - one trial in flight per user (`judging.trial_pending`);
    - 20 per 10 minutes per user (`judging.too_many_trials`);
    - trial jobs are queued at a lower priority than submissions.
  - The results consumer routes `trial` messages to the trial store, so `applyJudgeResult` never sees them.
- **Assessment:** `SessionFacade.trialTarget(actor, sessionId, key)`. It uses the viewing rule of `getProblem` (view
  access, and a timed session must have been started) and returns the sample tests and limits.
- **Engine:** `judge-submission.ts` adds `output` (stdout, cut to 4,000 characters, cleaned) to each result when
  `job.trial`. `main.ts` echoes `trial` on its messages. **The sandbox files are not touched.**
- **Frontend:**
  - A "Chạy thử" (Try) button beside Submit.
  - A panel listing each sample with input, expected and actual output side by side (stacked on phones) and the
    verdict, plus the compile output on CE.
  - It polls every second for a minute, then every 5 s with a "judge is busy" note, until the result is in.

Out:
- Custom input typed by the student.
- Trials outside a session (practice-only mode is the same: practice sessions are sessions).

## Done when

- [x] Backend tests:
  - a trial needs the same viewing right as the statement;
  - only sample tests are sent;
  - no submission or event is created;
  - one in flight, plus the rate limit;
  - only the owner can read it;
  - results are routed to the store.
- [x] Engine test: output is returned for a trial job and never for a normal job.
- [x] Live: a wrong answer shows its output next to the expected one; a correct one shows AC; a compile error shows
      the compiler output; the attempt counter does not change.
- [x] `docs/API.md` lists both routes.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass, and the security-verifier finds nothing open.

## Security

- **Roles:** both routes carry `@Roles('ADMIN', 'TEACHER', 'STUDENT')`, as security rule 1 asks (first added to the
  `public-routes` allowlist, then fixed in the OJ-20 review: that list may only shrink). The checks are in the use case:
  viewing rights for `POST`, owner for `GET`.
- **Nothing hidden is exposed:** only sample tests run (they are already public in the statement), and program output
  is returned only for them.
- **Capacity:** one in flight per user, 20 per 10 minutes, and a lower priority than submissions. The sandbox and its
  limits are unchanged.
- **Data:** trial records expire after 15 minutes and hold no personal data beyond the user id.

## Results and notes (2026-11-13, test system)

- **Live, through the real queue and Docker sandbox:**
  - A wrong answer shows its output next to the expected one, and a correct one shows "Đúng cả 2 test mẫu" (both
    samples passed) with the reminder to submit.
  - A compile error shows the compiler output, and a runtime error shows its stderr.
  - Another student gets 404, and a second trial in parallel gets 409 `judging.trial_pending`.
  - The attempt counter (3 → 3) and the submission count (12 → 12) did not change.
- **Phones (375 px):** "Chạy thử" and "Nộp bài" fit on one line, and each sample stacks. On a laptop, the expected and
  actual output sit side by side under the input. The layout follows the panel's width (container queries), not the
  screen's.
- **Security-verifier: nothing blocking.** Its findings were fixed:
  - **S1:** a sample is cut to 4,000 characters for display, both in the record and in the response. The judge still
    gets the whole sample.
  - **S2:**
    - Starting a trial removes the user's previous trial job if it is still waiting.
    - An engine skips a trial job that waited longer than the trial's 15-minute life (`TRIAL_MAX_AGE_MS`).
  - **N1:** samples are passed to the engine unchanged, so its own sample check stays meaningful.
  - **N2:** the path key is held to the same format as in request bodies.
  - **N3:** the polling text above was corrected.
  - **N4:** trial result messages are removed from the results queue once taken.
  - **N5:** the user's slot is checked before any session lookup.
- **Redis store:** the store contract and expiry tests pass on a real Redis (the throwaway container), 5 runs in a row.
  The expiry test had compared two TTLs in the wrong order; it now reads them in order, with a small margin.
