# OJ-35: Spacing and visual consistency

Status: done
Owner: Htet Oo Naing
Risky area: no (frontend styling only; no route, query or contract change)

## Outcome

The app reads as one product: every page starts at the same edge, sections are the same distance apart, cards share
one padding, and the same action looks the same everywhere. Today each page made its own choices, so moving between
pages feels uneven even though each page alone is fine.

## Evidence (measured 19 Nov 2026, 27 pages at 1280 px, Playwright on the seed data)

- **Left edge:**
  - normal pages start their content at x = 80;
  - wide pages (the class page and its tabs, a review flag, results with more than 4 problems) start at x = 16;
  - so the content jumps sideways when a teacher moves between them.
- **Gaps between page sections:** 12, 16, 20, 24 and 32 px.
  - 20 px on the session, problem and organization pages;
  - 12 px on a thread;
  - 32 px on Học bạ;
  - 24 px elsewhere.
- **Card padding:** six variants: 20/20, 16/20, 20/24, 12/20, 12/12, and 0 with a 12/20 header.
- **Delete:** three looks for the same action:
  - "Xóa" with a label (the session and the thread);
  - "Xóa bài" (a problem);
  - an icon only (a set).
- **Class page:** two boxes stacked before the tabs: the status bar ("Đang học" … "Lưu trữ lớp") and the class card.
- **Problem editor:** the "Thay đổi chia sẻ" link sits alone in a 40 px band between the header and the tabs.

## Scope

In:
1. **One container and gutter** (`Container` in `components/app-shell.tsx`).
   - Both widths use the gutter `px-4 sm:px-6 lg:px-8`.
   - Normal pages: `max-w-7xl` (1280 px). Wide pages: `max-w-[1440px]`.
   - At 1280 px every page's content starts at x = 32. Wider screens center normal pages, and wide pages use the
     extra room.
   - The OJ-34 rule for when a page is wide stays the same, and the comment on `Container` gives the new values.
   - The header bar uses the same gutter, so the logo lines up with the page content.
2. **One vertical rhythm.**
   - 24 px (`space-y-6` / `mb-6`) between page sections: header to content, card to card.
   - 16 px only inside a group: a filter bar and its list, the home page's main card and its quick actions.
   - Fix the outliers: the session, problem, organization, thread and Học bạ pages.
3. **One card padding.**
   - Content cards: `p-5` (20 px).
   - Card headers: `px-5 py-3`, with a bottom border.
   - Toolbars, such as the filter bars: `p-3`.
   - Lists inside cards: `px-5 py-3` rows.
   - Fix the cards measured at 16/20 and 20/24.
4. **One delete action.**
   - Every page-level delete is the same ghost red button with an icon and the label "Xóa": the session, the thread,
     a problem (today "Xóa bài"), and a set (today an icon only).
   - Row-level deletes inside lists and editors (test cases, path steps) stay icon buttons, each with an accessible
     name.
5. **Class page header.**
   - The status badge and "Lưu trữ lớp" / "Khôi phục" move into the class card, so there is one box before the tabs.
   - The confirm dialogs and behaviour are unchanged.
   - Phones keep the OJ-34 compact line.
6. **Problem editor header.** "Thay đổi chia sẻ" moves next to the sharing badge under the title, instead of in its own
   band.

Out: colours and the theme, typography sizes (already one scale: h1 28/700, h2 16/600), new components, dark-theme
changes beyond keeping the existing tokens, and pages with no measured issue.

## Done when

- [x] At 1280 px, the content of all 27 pages audited starts at x = 32 (Playwright `audit.mjs`, which moves into
      `e2e/browser/` or the spec's verification), and the header logo too.
- [x] The gaps between page sections are 24 px on every page, except the named 16 px groups.
- [x] Content cards use 20 px padding; no 16/20 or 20/24 cards are left.
- [x] Every page-level delete reads "Xóa" with the same style. Icon-only deletes are row-level only, each with an
      accessible name.
- [x] The class page shows one box before the tabs at 1280 px; archive and restore work as before.
- [x] The problem editor has no band holding only "Thay đổi chia sẻ".
- [x] No horizontal page overflow at 375, 768, 1024 and 1280 px on any audited page.
- [x] The gate and `pnpm test:e2e:browser` pass, and the before-and-after screenshots are attached.

## Contexts and contracts

Frontend only: `components/app-shell.tsx`, `components/ui.tsx`, the page files named above. No contract, entity or
migration change.

## Security

None: styling and layout only. The same actions, routes and confirm dialogs.

## Tests

- `src/frontend/test/layout.test.ts`: the container class for normal and wide (the gutter and the max widths), as a
  pure function moved out of `Container`.
- A Playwright audit script at 1280 px: left edge, gaps between sections and card padding on every page. It runs before
  and after, and the numbers go in the verification section. It is a check for this change, not a CI test, because
  the seed data differs from the e2e data.
- `e2e/browser/teacher-session.spec.ts` keeps passing ("Xóa" on the session page).

## Rollout and risks

- One PR on `feat/oj-35-spacing`, after OJ-32, OJ-33 and OJ-34. It touches many page files, so it goes last to avoid
  conflicts.
- Risk: wider normal pages (1152 → 1216 px of content at 1280) make long reading text wider. Statements and Markdown
  already cap their measure (`max-w-[72ch]`), so line length does not change.
- Risk: moving the class status into the card changes where "Lưu trữ lớp" is. It is still in the class header, beside
  "Sửa lớp".
- Roll back by reverting the PR. There is no data change.

## Verification (19 Nov 2026)

- **Measured again** with the same Playwright audit at 1280 px on all 27 pages:
  - every page's content and the header logo start at x = 32 (before: 80 on normal pages, 16 on wide ones);
  - every gap between sections is 24 px. The only exceptions are the allowed ones:
    - a filter bar and its list (16 px: the bank, the sets, the review list);
    - a heading and its own list on a thread (12 px).
  - no 16/20 or 20/24 cards are left; the import drop zone is not a card.
- **No horizontal overflow** on any audited page at 375, 768, 1024 or 1280 px.
- **Delete:** the session, thread, problem and set pages use `DeleteButton` ("Xóa", ghost red). The class page's
  "Xóa ngay" keeps its own label, in the same style. Row-level deletes (test cases, users) stay icon buttons with
  names. The unused "Xóa bài" / "Xóa đề" strings are removed.
- **Changed from the plan:**
  - An archived class keeps its amber panel. It holds the deletion schedule and is a warning, so it stays apart.
  - For an active class, the status and its note move under the title, and "Lưu trữ lớp" joins the class card.
  - The problem editor's gap above "Bộ test" is the form's own sticky "Lưu bài" bar in its place at the end of the
    form, not a spacing bug. It is left as is.
- **Tests:** frontend 113 (`layout.test.ts` covers `containerClass`), backend 385, engine 169; browser e2e 12/12 on the
  Next.js 16.4.6 copy.
- **Screenshots:** six before-and-after pairs for the PR.
