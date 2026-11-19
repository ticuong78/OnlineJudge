# OJ-33: Assign from home, code on phones, readable results

Status: done
Owner: Htet Oo Naing
Risky area: no (frontend only; no route, query or contract change)

## Outcome

The three fixes with the most impact from the 19 Nov 2026 UI/UX review of every screen. They cover the two main jobs:
a teacher assigning work and a student handing it in, plus reading the results afterwards.
1. The teacher's main home button opens the assign flow instead of sending them to the bank.
2. A student on a phone can reach the editor and come back to the statement in one tap.
3. The results table shows that scores can be clicked and tells partial scores apart.

## Scope

In:
1. **Assign from home** (`app/(main)/page.tsx`, `components/sessions.tsx`).
   - The "Giao bài" quick action opens a dialog instead of linking to `/bank/sets`.
   - With one active class it goes straight to `AssignFromBankDialog` for that class.
   - With several it first asks "Giao cho lớp nào?": a list of active classes, each with its name and student count. Picking one opens `AssignFromBankDialog`.
   - The hint changes from "Chọn một đề trong ngân hàng…" to "Chọn lớp, chọn đề, đặt hạn nộp".
   - Teachers with no class keep today's "first class" action. Admins keep today's link.
   - After the session is created the teacher lands where the class page's assign flow already lands them.
2. **Statement and code on phones** (`app/(main)/sessions/[id]/problems/[key]/page.tsx`, below `lg` only).
   - While the editor is still below the screen (not when the student has scrolled past it to the result), a floating
     "Viết code ↓" button in the bottom-right corner, at least 44 px tall,
     scrolls to the editor's toolbar, which already sticks and holds Nộp bài.
   - Once the editor is on screen the floating button goes away, so it never covers code. A "↑ Đề bài" button in the
     toolbar (phones only) scrolls back to the top of the statement.
   - An `IntersectionObserver` on the editor decides when the floating button shows.
   - Focus follows each jump (to the language select, or to the statement), because the pressed button disappears or
     scrolls away. The floating button sits under the phone menu's overlay and, from `sm` up, bottom-left, clear of
     toasts.
   - It respects `prefers-reduced-motion`, as the existing `scrollIntoView` calls do.
   - Desktop (`lg` and up) is unchanged.
3. **Results table** (`app/(main)/sessions/[id]/results/page.tsx`).
   - Every score cell and student name gets a dotted underline that becomes solid on hover and on focus, so it reads as clickable.
   - A full score stays green and bold. A partial score (0 < v < max) turns amber (`text-amber-700`) with a small
     `amber-600` dot. Zero is `slate-500`, so it passes 4.5:1.
   - A one-line legend under the table: "Đủ điểm · Một phần · Chưa có điểm · Bấm vào điểm để xem bài nộp".
   - Colour is never the only signal: the dot marks partial scores, and each cell's `title`/`aria-label` gives the score out of the maximum.

4. **Follow-ups from the product walkthrough (19 Nov 2026)**, added to this spec because they finish the same score
   language:
   - results on phones: student names stay on one line and the table scrolls sideways, as the gradebook already does;
   - the class gradebook (OJ-31) uses the same tones, partial dot and legend as the results board. The shared styles
     live in `components/score-tone.tsx`;
   - submission lists that show one session (the results panel, the student-work page, "Bài nộp của tôi") show points
     as `13.33/40` with the percent under it. The rounding mirrors the backend's `scoring.ts`, which stays the rule
     that counts. A list across several sessions keeps the percent: showing points there needs the points on
     `SubmissionDto`, a contract change left for later.

Out:
- The other seven review items (session status for teachers, rejudge menu, phone test table, class code chip, bank filters, page widths, import page): a later spec.
- Any backend, contract or AI change.

## Done when

- [x] A teacher with one active class clicks "Giao bài" on the home page and sees the assign dialog for that class. With two classes they first pick one. Both paths end in a created session, covered by browser e2e.
- [x] At 375 px on the solve page, one tap on "Viết code ↓" brings the editor toolbar (with Nộp bài) into view, and "Đề bài ↑" in the toolbar jumps back. At 1280 px neither button exists.
- [x] On the results page, a partial score renders amber with a dot, a full score green, and zero grey. Every score cell has an accessible name with the score and the maximum. The legend shows.
- [x] New strings live in `vi` and `en`; `i18n-coverage.test.ts` passes.
- [x] The `pnpm build:shared && pnpm typecheck && pnpm test` gate and `pnpm test:e2e:browser` pass.
- [x] Screenshots before and after, at desktop and phone width, are ready for the PR (seven before-and-after pairs:
      home assign, solve on a phone, results, gradebook, a student's work).

## Contexts and contracts

Frontend only. It uses existing API calls: `listClasses`, `listProblemSets('mine')`, `listProblems` and the session create already used by `AssignFromBankDialog`. No change to `@oj/contracts`, entities or migrations.

## Security

No new routes or queries. Class list and bank list stay scoped by the backend to the caller, as today. The class picker shows only classes the API returns for the teacher.

## Tests

- `src/frontend/test/score-tone.test.ts`:
  - `scoreTone` returns full, partial or none at the edges (0, 0.01, max − 0.01, max, max = 0, NaN);
  - the `cellScore` label reads the student, the problem and score/max in `vi` and `en`;
  - `submissionScore` covers judging, hidden results, points with the percent, an unknown problem, and another
    session's points (never used).
- `src/frontend/test/home-actions.test.ts`: which assign entry each teacher gets (no class, one class, several classes,
  admin, class list not loaded).
- `e2e/browser/assign-from-home.spec.ts` (new): the one-class teacher assigns from home, and the session opens. The
  several-classes picker is covered by the unit test and the live check: the e2e teacher has one class.
- `e2e/browser/student-submits.spec.ts`: at phone width, "Viết code" brings Nộp bài on screen and moves focus to the
  language select. The floating button is then gone, and "Đề bài" jumps back.

## Rollout and risks

- One PR on `feat/oj-33-assign-solve-results-ux`, after OJ-32 merges, because it builds on OJ-32's home and class changes.
- Risk: the floating button covers content at the bottom of the statement. Add bottom padding equal to its height below `lg`.
- Risk: a teacher used to "Giao bài" opening the bank. The bank's own "Giao bài" buttons stay, so nothing is lost.
- Roll back by reverting the PR. There is no data change.

## Verification (19 Nov 2026)

- Gate `pnpm build:shared && pnpm typecheck && pnpm test`: frontend 104/104 (6 new in `home-actions.test.ts` and
  `score-tone.test.ts`), backend 384/384, engine 169/169.
- Live on the dev server with the seed data (Playwright script, desktop 1280 px and phone 375 px), 16/16 checks:
  - teacher with two classes: "Giao bài" opens "Giao cho lớp nào?", which lists both classes. Picking one opens
    "Giao bài cho lớp", and the create dialog is locked to that class.
  - phone solve page: "Viết code" brings Nộp bài on screen, then floats away so no code is covered. "Đề bài" in the
    toolbar jumps back to the title. Neither button shows at desktop width.
  - results: a partial score (13.33/40) is amber with a dot, full green, zero grey. Every cell is dotted-underlined, and
    its accessible name reads "Vũ Ngọc Chi, bài 1: 13.33/40 điểm. Bấm để xem bài làm". The legend shows.
- `pnpm test:e2e:browser`: 11/11, including `assign-from-home.spec.ts` and the phone case in `student-submits.spec.ts`.
  Run on a copy of this working tree with the upgrade branch's Next.js 16.4.6 lockfile: on this branch, Next.js 16.4.3
  stops `next build` with `SecurityFatalError`. It runs here unchanged once the upgrade is merged.
- Changed from the plan: the one-class path is covered by browser e2e (the e2e teacher has one class), and the
  several-classes path by the unit test and the live check.
- Review (19 Nov 2026, own pass plus the independent reviewer agent): nothing blocking. All 13 findings fixed:
  - the floating button no longer returns, pointing down, once the student scrolls past the editor;
  - focus follows the jumps, and goes back to "Giao bài" after the assign dialog closes on the several-classes path;
  - the old "Vào Ngân hàng…" hint on the home page is updated;
  - zero scores are `slate-500`, the partial dot is `amber-600`, and the legend draws exactly what the cells show;
  - the `cellScore` label is tested in `vi` and `en`, and the e2e selectors are exact.
  After the fixes: gate passes (frontend 105), browser e2e 11/11 on the Next.js 16.4.6 copy, live checks 24/24.
- Product walkthrough (19 Nov 2026): 13 flows clicked through as a teacher and a student, desktop and phone, all
  complete with no console errors. Its three fixes (scope 4) were checked live: phone result rows are 37 px with the
  table scrolling sideways; the gradebook's 88.89 is amber with a dot, and the legend matches; the results panel, the
  student-work page and "Bài nộp của tôi" show `13.33/40 · 33.33%`. Frontend tests 106 (`earnedPoints` and
  `pointsByProblem` added).
- Re-review (19 Nov 2026), nothing blocking; all 10 fixed:
  - `/submissions` uses a session's points only once that session has loaded, and the table waits for them, so a
    stale maximum never shows and the column does not change format;
  - the copied `earnedPoints` is gone: lists use `utils.scoreLabel` ("13.33 trên 40 điểm" for screen readers);
  - gradebook cells have the same kind of accessible name as results cells;
  - the home hint matches the button shown (assign, bank, or create a class);
  - the score rule is tested (`submissionScore`);
  - nits: tooltips equal the accessible names, long names are cut below `sm`, and the unused keys and prop are removed.
- Last pass: the no-class hint could not be shown live (in the seed data every teacher sees an active class; an org
  admin sees the organization's classes and may assign to them, so the picker offers only classes the backend accepts),
  and the admin password stays in `.env`. Both hints are covered by `home-actions.test.ts`.
