# OJ-15: Blocking fixes F1-F4 from the final review round

Status: done (approved by the user 2026-11-12: "Fix F1-F4")
Owner: Htet Oo Naing
Risky area: yes (judging results shown to students, logging of personal data, exam timing, parsing untrusted text)

## Outcome

The four exam-blocking findings in `docs/testing/code-review-2026-11-12.md` (final round) are closed:
- **F1:** students no longer see hidden test inputs through runtime-error messages.
- **F2:** logs mask every email address again.
- **F3:** a wrong computer clock no longer ends a student's exam early.
- **F4:** pasted or imported text can no longer freeze the API.

## Scope

In:
- **F1:**
  - `JudgeJobTestCase` gets `isSample`, filled from the session's frozen test data.
  - The engine copies it onto each `TestCaseResult` (`isSample?`, optional so stored results stay valid).
  - `GET /submissions/:id` drops `message` from non-sample tests when the viewer is not a manager of the session.
    Results stored before this change have no flag and count as hidden.
  - Teachers and administrators still see everything.
- **F2:** `maskEmailsIn` masks an address followed by punctuation (a full stop included) and keeps package paths such
  as `typeorm@0.3.27_pg@8.16.3` readable. Its parts are bounded (64/253), so it is linear on long text, and
  `errorForLog` masks at most 8 KB.
- **F3:**
  - The server clock offset is computed when the session data arrives, not in a later effect.
  - The exam timer is not rendered until the offset is known, so its first check uses server time.
- **F4:** every pattern that pasted, imported or saved problem text reaches runs in linear time, with the same
  results as before:
  - the exam parser: problem header, section colon, difficulty line, title clean-up and trailing-space trims;
  - link stripping: space runs, Markdown links and autolinks;
  - the file-I/O check and rewrite in `@oj/contracts` (`standard-io.ts`), which runs on every problem save.

Out: the other findings of the review. The sandbox files (`docker-sandbox.ts`, `runner/`) are not touched; the engine
change is in `judge-submission.ts` only.

## Done when

- [x] Backend test: a student viewing their own RE submission sees messages only for sample tests, a teacher sees all,
      and a result without the flag is treated as hidden.
- [x] Engine test: results carry `isSample` from the job.
- [x] Backend test: masking covers an address before a full stop, a comma and a closing parenthesis, and keeps
      package paths readable.
- [x] Frontend test: with the computer clock an hour fast, the computed time left is the server's.
- [x] Backend tests: the parser, link stripping, file-I/O check and masking handle the hostile inputs in well under
      100 ms. The existing fixtures still pass.
- [x] Old and new give identical output on 15,000 random documents (parser, links) and 40,000 random file-I/O texts.
- [x] Live: a program that prints its input to the error output shows no hidden input to the student.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass; the security-verifier finds nothing open.

## Contexts and contracts

- **Contracts:** `JudgeJobTestCase.isSample` (required) and `TestCaseResult.isSample` (optional) in
  `src/shared/src/judge-messages.ts`.
- **Code:** assessment (judge data), judging (detail view), engine (copy the flag), shared (masking), importing
  (parser), frontend (timer).
- **Database:** no schema change. The test results are stored as jsonb.

## Verifier findings on the first version (2026-11-12)

The security-verifier closed F1 and F3, and found the following. All are fixed and re-verified:
- **Still quadratic:** `standard-io.ts`, the worst at 34 s for 50k characters. It ran on every problem save.
- **Unbounded patterns:** Markdown-link and autolink bounds were missing.
- **Header regression:** my first header guard turned away "Bài 1⏎Tổng hai số", which the old pattern accepted. The
  rewrite now reproduces the old results exactly, and a test covers it.
- **Masking:** it was still quadratic on long text.

**Accepted side channel:** a program can still encode a hidden input in each hidden test's verdict, time and memory.
That is a few bits per test per submission, as on every judge that shows per-test results. Rounding time and memory
for students is a possible follow-up.

## Second and third verifier passes

**Second pass.** F1, F2 and F3 were closed, and F4 still had:
- the bare-file-name rule in `standard-io.ts`, which restarted after every "-" or "_" (16 s at the size limit,
  already in HEAD);
- import drafts with no length limits;
- `block()`'s `shift()` loop;
- the OMML equation scan.

All four were fixed.

**Third pass.** It closed F4. What changed:
- **Speed:** no reachable path is slow.
- **Equivalence:** 30k-80k random inputs per function give the same output as HEAD.
- **Limits:** the draft limits are enforced by the validation pipe.
- **Correction:** the third pass found that a 20,000-character limit I had added to imported test data was stricter
  than the hand-entry path. It was removed: test data is capped by the catalog domain (8 MB).

**Left as accepted information:**
- `htmlToBlocks` is slow on raw `<` runs, but only mammoth output reaches it, and mammoth escapes `<`.
- Deeply nested equations overflow the stack. This was already in HEAD, and the import catches it.
- Names over 100 characters are no longer read as file names.
- Equation tags with attributes over 1000 characters are no longer read as equations.

## Rollout and risks

- Release the backend and the engine together. An older engine ignores the new field, so its results have no flag and
  are hidden from students. That is the safe side.
- Jobs already queued when the release goes out carry no flag either, and are treated the same way.
