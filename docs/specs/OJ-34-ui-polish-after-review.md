# OJ-34: UI polish from the product review

Status: done
Owner: Htet Oo Naing
Risky area: no (frontend only; no route, query or contract change)

## Outcome

The seven smaller UI issues left from the 19 Nov 2026 product review (OJ-33 fixed the top three). Each one makes a
teacher or student read, scroll or guess more than they need to. None blocks a flow; together they make the app feel
unfinished on phones.

## Scope

In:
1. **Teacher status on the session page** (`app/(main)/sessions/[id]/page.tsx`).
   - Today a teacher sees "Chưa làm" on every problem, read from their own (empty) progress.
   - When `canManage`, each problem row shows the class's progress instead: "5/8 giải trọn". It uses the counts
     `solvedByProblem` already computes for the results page, from `getSessionResults`.
   - Students see what they see today.
2. **Rejudge in one menu** (`components/rejudge.tsx`, session page header).
   - Today the "Chấm lại" card has four controls, and the disabled "Chấm lại bài …" label is cut off.
   - Replace the card with one "Chấm lại ▾" menu button next to "Sửa". Its items:
     - "Chấm lại tất cả";
     - "Chấm lại một bài…", which asks for the problem in the confirm dialog;
     - "Cập nhật bài từ ngân hàng & chấm lại".
   - Each item keeps today's confirm dialog and effect.
   - Check first whether "Đồng bộ với đề gốc" (in the problems card) does the same as "Cập nhật … & chấm lại". If it
     does, keep only the menu item.
3. **The test table on phones** (`components/submission-result.tsx`). Below `sm` the table fits 375 px with no
   sideways scroll:
   - the verdict shows its short code with a colour (AC, WA…), with the full name in its accessible name;
   - time and memory share one cell, one value above the other;
   - points stay in their own column.
4. **The class code on phones** (`app/(main)/classes/[id]/page.tsx`, `ClassHeader`).
   - Below `sm` the code card takes about a third of the first screen.
   - Show the code as a compact chip with its copy button on the line under the class name. The big code card stays
     inside "Chi tiết lớp" and on `sm` and up.
5. **Bank filters on phones** (`app/(main)/bank/page.tsx` and the sets list).
   - Below `sm` the filters push the problem list below the first screen.
   - The search box stays on screen. The scope switch (Của tôi / Công khai / Tổ chức) also stays.
   - Difficulty and topics move into a "Lọc" button that shows how many filters are on ("Lọc (2)"). The button opens a
     bottom sheet (`Modal`) with "Áp dụng" and "Xóa lọc".
   - `sm` and up is unchanged.
6. **One width rule** (`components/app-shell.tsx` `Container` and its callers).
   - Pages are `max-w-6xl`. `wide` (1400 px) is only for a main table that needs it:
     - the class page, which stays constant across tabs as OJ-32 decided;
     - the set editor and the problem editor's wide view;
     - the results page when the session has more than 4 problems.
   - The results page with 1 to 4 problems uses the normal width, like the session page it comes from.
   - Write the rule as a comment on `Container`.
7. **The import page before upload** (`app/(main)/import/page.tsx`).
   - Under the drop zone, add a short "Đề được tách tốt nhất khi…" list. It covers:
     - each problem starts with "Bài/Câu + số";
     - section headings (Dữ liệu vào, Kết quả, Ví dụ);
     - examples as lines or an INP/OUT table;
     - a scanned file needs AI.
   - Add a "Tải đề mẫu (.docx)" link, served from `src/frontend/public/samples/de-mau.docx`.
   - The sample is a new clean file built by `samples/make-samples.mjs`: 2 problems in the recommended layout, our
     own text. The existing `de-kiem-tra-vong-lap.docx` is the wrong file to hand out, because it deliberately holds
     Zalo, Facebook and advert lines to test the filter.
   - Recent imports are out of scope: there is no endpoint for them.

Out: backend, contract or AI changes; recent imports; a submission's points on lists that span several sessions (needs
points on `SubmissionDto`); the gradebook layout; dark-theme review beyond keeping the new classes on existing tokens.

## Done when

- [x] A teacher's session page shows "n/m giải trọn" per problem, matching the results page's footer. A student's is
      unchanged.
- [x] The session page has one "Chấm lại" menu, and nothing on it is cut off at 1280 or 375 px. Rejudge all, rejudge
      one problem, and update from the bank still work and still ask to confirm.
- [x] At 375 px the submission page's test table has no sideways scroll. A screen reader hears each test's full verdict.
- [x] At 375 px the class page shows the code as a chip and the tabs within the first screen. The big card is still
      in "Chi tiết lớp".
- [x] At 375 px the bank shows the search box and at least three problems on the first screen. "Lọc (n)" opens the
      filters, and they apply as they do today.
- [x] The results page for a 2-problem session uses the normal width; a 6-problem one is wide. The `Container` comment
      states the rule.
- [x] The import page shows the format tips and a sample .docx. The sample downloads, and with AI off it imports into
      2 problems with no warnings. Its expected result is added to `docs/testing/local-setup.md`.
- [x] New strings are in `vi` and `en`, `i18n-coverage.test.ts` passes, and the gate and `pnpm test:e2e:browser` pass.
- [x] Before-and-after screenshots at 1280 and 375 px for each item.

## Contexts and contracts

Frontend only. Item 1 reads `getSessionResults`, which is already called for managers on the class page and the results
page. No change to `@oj/contracts`, entities or migrations.

## Security

No new routes. Item 1 calls the results endpoint only when `canManage`, and the backend already limits it to staff who
manage the session. The sample file is static and public, and holds only our own generated content.

## Tests

- `src/frontend/test/session-status.test.ts` (new): the per-problem label for a manager ("n/m giải trọn") and for a
  student (today's labels), as a pure function.
- `src/frontend/test/layout.test.ts` (new): `resultsWidth(problemCount)` is normal at 1 to 4 problems and wide above.
- `src/frontend/test/bank-filters.test.ts` (new): the active-filter count for "Lọc (n)".
- `e2e/browser/roles.spec.ts` or a new `teacher-session.spec.ts`: a teacher's session page shows "1/1 giải trọn"
  after the student's accepted submission (the existing e2e data), and the "Chấm lại" menu opens with three items.
- Live check with a Playwright script at 1280 and 375 px for items 3 to 7.

## Rollout and risks

- One PR on `feat/oj-34-ui-polish`, after OJ-32 and OJ-33 merge. They touch the same class, session and results files.
- Risk: item 2 moves a rarely used, high-impact action (rejudge) into a menu. Keep the confirm dialogs word for word,
  and name the menu "Chấm lại" so it is still found by its word.
- Risk: item 6 changes the results page width for small sessions. It is checked against the screenshots before merge.
- Roll back by reverting the PR. There is no data change.

## Verification (19 Nov 2026)

- Changed from the plan:
  - Rejudging one problem: the menu lists the session's problems directly, instead of asking in the confirm dialog
    (a session has a handful). With one problem the menu has two items.
  - "Đồng bộ với đề gốc" stays separate. It is not the same as "Cập nhật … & chấm lại": sync brings in the set's
    added or removed problems and new points, while refresh re-reads the content of the problems already in the
    session.
  - The menu sits wherever the wrapped header puts it: full width under the button on phones, and aligned to the side
    with room on wider screens. It closes on Escape, an outside click, focus leaving it, or a scroll.
  - The bank's sets list is unchanged. It has only a search box and one select, which already fit a phone.
  - The filter sheet's "Xóa lọc" clears only what the sheet holds; the search box keeps its text.
- Tests:
  - frontend 112: `session-status.test.ts` and `layout.test.ts`, which also covers `activeFilterCount`;
  - backend: `exam-parser.test.ts` reads `samples/exams/de-mau.docx` through the real Word reader: 2 problems, no
    warnings, and the served copy is the same file;
  - browser: `teacher-session.spec.ts`.
- Live check at 1280 and 375 px (Playwright, seed data), all pass with no page errors:
  - "5/8 giải trọn" per problem, and no "Chưa làm" for the teacher;
  - the rejudge menu has four items, stays inside the screen at both widths, and no button is cut off;
  - the test table fits (299 px at a 375 px phone), and the verdict reads "AC Chấp nhận";
  - the class tabs are at y = 220 on a phone, and "Chi tiết lớp" still opens the card;
  - 4 problems on a phone's first screen, and "Lọc (1)" with Dễ leaves only easy problems;
  - the results board for 2 problems is 1152 px;
  - the import tips show, and the sample is served.
- Before-and-after pairs for the PR: seven, at 1280 and 375 px. They showed the session header's four buttons wrapping
  under the title at 1280 px. Fixed in `PageHeader` (`components/ui.tsx`): the title block now grows and wraps its
  subtitle instead of keeping its one-line width. On every page with header actions, the buttons stay beside the title
  at 1280 and 1024 px and go under it on phones. Checked on six pages at 1280, 1024, 768 and 375 px: no page overflow
  and no cut-off button.
