# OJ-10: Fixes for the issues found in the product and test review

Status: done (approved by Htet Oo Naing, 2026-11-08: "Yes, fix them")
Owner: Htet Oo Naing
Risky area: yes (integrity flags table, API error contract)

## Outcome

Five issues found by the review and UAT of 2026-11-08 (docs/technical-overview.md §9) are fixed, so students read
scores consistently, shared computers do not leak another student's last problem, import errors say what is wrong,
teachers see one plagiarism entry per copied pair, and every API error carries a stable code.

## Scope

In:
1. **K-1**: the result card under the editor shows the score in the problem's points ("36/60"), like the problem list.
   Where the problem's points are not known (submission page, submission tables) the score is shown with "%".
2. **K-2**: the "Làm tiếp" shortcut is stored per account, removed on sign-out, and only offered while that session is
   still open; otherwise the home page falls back to the next open session.
3. **K-3**: an upload whose content is not really a Word document or a PDF (checked by its signature, not only its
   name) is refused with "Tệp này không phải tài liệu Word (.docx) hoặc PDF hợp lệ…" (`import.invalid_file`), not
   with the scanned-PDF message.
4. **K-11**: a copied pair produces exactly one plagiarism entry, also when both submissions are checked at the same
   time (unique pair key in the database, insert-or-ignore).
5. **K-13**: every error body has a `code`: validation and other HTTP errors get stable codes (`request.invalid`,
   `request.not_found`, `request.too_large`, …), unexpected errors `server.error`. `ApiErrorBody.code` becomes required.

Out: the 18 "any signed-in user" routes (K-12, owner's decision), the organization race (K-4).

## Done when

- [x] Each fix has a test that fails before and passes after (frontend unit, backend unit, integration for K-11).
- [x] UAT S-03 shows "Cao nhất 40/40 điểm" and a card "40/40"; T-06 shows the new message for `khong-phai-word.docx`;
      T-10 shows one entry. (Checked 2026-11-08 on the development stack: card "40/40" in the browser, T-06 400
      `import.invalid_file`, T-10 with both copies submitted at the same time: 1 entry.)
- [x] `pnpm build:shared && pnpm typecheck && pnpm test`, integration and end-to-end suites pass (unit 414: frontend
      20, backend 228, engine 166; integration 36; HTTP e2e 17; browser e2e 8). Removing the `pairKey` unique index
      made the parallel integration test fail.
- [x] `docs/API.md`, the manual, the test plan and the known-issues table updated.

## Contexts and contracts

Frontend only for K-1/K-2. Importing (domain check before reading) for K-3. Integrity (repository + ORM column
`pairKey`, nullable, unique) for K-11. Shared presentation filter + `@oj/contracts` `ApiErrorBody.code` for K-13.
Database: one new nullable column with a unique index on `integrity_flags` (DB_SYNC in development; migration with OJ-5).

## Security

No new routes. K-2 reduces data shown across accounts on shared computers. K-3 refuses files earlier. K-13 adds codes
only; messages unchanged.

## Tests

- `src/frontend/test/lib.test.ts`: score label in points and percent; last-problem storage per account and sign-out.
- `src/backend/test/exam-parser.test.ts` or a new `document-signature` test: signature check.
- `src/backend/test/integrity-pair.test.ts`: two checks of a copied pair → one flag (in-memory);
  `test/integrity.integration.test.ts`: parallel inserts of the same pair → one row (PostgreSQL).
- `src/backend/test/api-errors.test.ts`: filter codes; `e2e/api/access-control`: validation error has `request.invalid`.

## Rollout and risks

Existing duplicate flags stay (their pair key is empty); new pairs are unique. Clients that ignored `code` are unaffected.
