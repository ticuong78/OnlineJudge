# Design plan: "Vở ô li" (the squared exercise book)

Subject: an online judge for one Vietnamese high-school class. Students practise and sit coding exams;
the teacher imports exam papers, composes sets and prints answer keys. The main job of the UI is to take a
student from "which problem?" to "submitted, here is my verdict" without friction.

The visual source is the Vietnamese classroom itself: the squared exercise book (vở ô li) with its pale
blue grid, purple ink (mực tím) that students write in, the green chalkboard, and the teacher's red pen
that writes the score in the margin.

## Colour (CSS variables in `src/app/globals.css`, exposed as Tailwind tokens)

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F5F7FB` | Page background. Cool, slightly blue white of exercise-book paper (not cream). |
| `rule` | `#CBD5E6` | Grid lines, borders, dividers. The ô li line colour. |
| `ink` | `#4A2FA0` | Primary actions, links, focus ring, selected state. Mực tím. Full scale `ink-50…900`. |
| `graphite` | `#232838` | Body text and headings (blue-grey, not a tinted near-black). |
| `chalk` | `#1F6B4A` | Accepted / success. Chalkboard green. Scale `chalk-50…900`. |
| `mark` | `#C8302A` | Teacher's red pen: wrong answers, errors, destructive actions, and the score mark. Scale `mark-50…900`. |

Amber stays only for "needs checking" warnings (import drafts, TLE/MLE). Contrast: ink, graphite, chalk
and mark on paper/white are all ≥ 4.5:1.

## Type

- **Be Vietnam Pro** (Google, `vietnamese` subset) for all interface text and statements. It was drawn
  for Vietnamese, so stacked diacritics (ặ, ể, ỡ) sit cleanly at small sizes. Scale: 13 / 15 / 17 / 21 / 28,
  weights 400, 500, 600 and 700 only for page titles.
- **JetBrains Mono** (`vietnamese` subset) only where text is code or judge I/O: editor, sample tests,
  test data, source listings. Not used for small metadata labels.
- **Patrick Hand** (`vietnamese` subset) used in exactly one place: the score the judge writes in the
  margin after a submission ("100", "40"), like a teacher's handwritten mark.

Sentence case everywhere; no all-caps labels; table headers are normal-weight graphite-60.

## Layout

Left-aligned throughout; reading columns stay under ~75 characters (statements use `max-w-[72ch]`).
Radius hierarchy instead of one radius on everything: controls 6px, panels 10px, badges full-round. No drop
shadows on panels; separation comes from rule-coloured borders, like lines in the book.

Problem page (desktop: two panes filling the viewport; mobile: stacked, editor below the statement):

```
+-----------------------------------------------------------------------------------+
| [logo] Bài tập  Đề  Bài nộp                                  Nguyễn An  Đăng xuất |
+--------------------------------------+--------------------------------------------+
| < Kho bài tập          (Sửa bài)     | [C++17 v]  Mã mẫu         [ Nộp bài ]      |
| Đề bài | Bài nộp của tôi | Lời giải  |--------------------------------------------|
|--------------------------------------|                                            |
| P0007  Trung bình  mảng              |   Monaco editor                            |
| Tổng đoạn con lớn nhất               |                                            |
| 1000 ms   256 MB                     |                                            |
|                                      |                                            |
| statement (max 72ch)                 |--------------------------------------------|
| Dữ liệu vào / Kết quả / Ràng buộc    |  ( 40 )   Sai kết quả ở test 3             |
| Ví dụ 1  [input | output]  Sao chép  |  ~~~~~~   [■][■][✕][■][✕]  ← one cell/test |
|                                      |  table: test, kết quả, thời gian, bộ nhớ   |
+--------------------------------------+--------------------------------------------+
```

The result panel is the one bold moment: the score is written in Patrick Hand in the teacher's red (or
chalk green for 100) and circled by an SVG stroke that draws once; each test is a square cell of the
exercise-book grid, filled green or crossed in red. Everything else stays quiet.

Import review page (admin):

```
+-----------------------------------------------------------------------------------+
| Nhập đề từ file                                               [Chọn file khác]    |
| de-thi-hk1.docx   tách được 4 bài, đã chọn 3       Chọn tất cả | Bỏ chọn          |
| (i) Kiểm tra tên bài, chọn độ khó, giới hạn và ví dụ trước khi nhập.              |
| +-------------------------------------------------------------------------------+ |
| | [x] Bài 1 [ Tên bài ............................ ] [Độ khó v]  Sửa chi tiết   | |
| | ! Không tìm thấy ví dụ                         (amber strip, only if warnings)| |
| | first two lines of the statement…    1000 ms, 256 MB, 2 ví dụ                 | |
| +-------------------------------------------------------------------------------+ |
| | [ ] Bài 2 ...  (dimmed when excluded)                                         | |
| +-------------------------------------------------------------------------------+ |
| > Văn bản trích xuất gốc (collapsed)                                              |
|---------------------------------------- sticky bar -------------------------------|
|                                   3 bài sẽ được thêm vào kho     [ Nhập 3 bài ]   |
+-----------------------------------------------------------------------------------+
```

## Motion (OJ-17)

Motion explains a change of state; it never decorates. The verdict (the score ring) stays the only expressive
animation.

- **Tokens:** `--ease-standard` (`cubic-bezier(0.2, 0, 0, 1)`) and `--duration-1/2/3` (120 / 180 / 240 ms) in
  `globals.css`. Nothing longer than 240 ms, except the navigation bar and skeletons.
- **Entering:** a fade, and for panels a 6 px rise.
- **Leaving:** the reverse, faster (120 ms). `usePresence` keeps the element mounted for its exit.
- **Where it is used:**
  - dialogs (backdrop fade, panel rise);
  - the phone menu (drops in);
  - toasts (slide from the screen edge they sit on);
  - the tab underline (slides);
  - the result panel (rises);
  - buttons (1 px press).
- **Never:** hover lifts on panels, parallax, bouncing, or motion on page load.
- **Accessibility:** the reduced-motion rule makes all of it instant. The progress bar stays as a static bar,
  because the feedback matters more than the movement.
- **Implementation:** CSS first, with `@starting-style` for entry. No animation library.

## Dark theme: "bảng đen" (OJ-19)

The dark theme is a blackboard: chalk-white text (`graphite` #e4ebe7) on a dark slate-green board (`paper` #141d19,
`surface` #1b2621), with violet ink, green chalk and red pen as accents.

- **Choosing it.** The default follows the system. The header switch (and the one on the sign-in pages) cycles system
  → light → dark and is remembered on this computer (`oj:theme`). A boot script in `<head>` sets `<html data-theme>`
  before the first paint.
- **Tokens, not `dark:` classes.** Under `:root[data-theme='dark']` every colour scale keeps its name and reverses its
  lightness:
  - light tints (50–200, used for backgrounds) become dark tints;
  - dark shades (600–900, used for text) become light;
  - so `bg-amber-50 text-amber-800` stays a readable pair in both themes.

  Write components with the scales as before. Do not add `dark:` variants.
- **Three roles that do not reverse:**
  - `bg-surface` for cards and panels (not `bg-white`);
  - `bg-scrim/…` for backdrops;
  - `bg-ink-solid`, `bg-chalk-solid`, `bg-mark-solid` (and `-hover`) for solid fills that carry white text.

  The hover shade is darker in both themes.
- **Contrast.** Text pairs and white-on-solid are checked at 4.5:1 or more by `test/theme.test.ts`, which reads the
  dark tokens from `globals.css`. Add a pair there when a new combination appears.
- **Other parts of the page:**
  - Monaco uses `oj-board` (vs-dark on the board's colours).
  - highlight.js gets the GitHub-dark colours.
  - The prose colours come from the tokens.
- **Paper stays paper.** The dark tokens apply on screens only, and the printed set and answer key always use light,
  also when reached by an in-app link (`LightThemeOnly`).

## Principles

1. The book, not the dashboard: paper, ruled lines, ink. Decoration only where it carries meaning (the grid
   cells are the tests; red ink is grading).
2. One loud moment: the verdict. Navigation, lists and forms stay calm.
3. Every core action is one click from the nav, and every page names its next step ("Nộp bài", "Thêm
   test", "In đề").
4. Labels are verbs that match their result: "Nộp bài" → "Đã nộp bài", "Lưu bài" → "Đã lưu bài",
   "Nhập 3 bài" → "Đã nhập 3 bài". Errors say what happened and what to do next.
5. Print is a separate medium: black on white, A4, no screen colours. The printed exam paper and answer
   key are set in Times New Roman (the convention for Vietnamese school papers, full diacritic coverage),
   with a "Họ và tên / Lớp" line, bordered sample tables, one problem per page and line-numbered code on
   white. None of the screen tokens (paper, ink, grid) reach the printed sheet.

## Review against generic defaults, and what changed

First draft and what I revised after checking it against the common defaults:

- **SaaS card kit.** The first build split the dashboard into a grid of identical rounded cards with the same
  soft shadow and hover-lift. Changed to one primary "next step" block in ink plus a plain list of other
  actions; shadows removed from all panels; a radius hierarchy replaces the single radius.
- **All-caps eyebrows.** Table headers were tracked-out uppercase. Now sentence case, normal weight.
- **Middle-dot meta strings.** Meta lines like "1000 ms · 256 MB · 2 ví dụ" and "Trang 1/3 · 40 kết quả" were
  rewritten as separate spaced items or plain commas.
- **Arrows on links/buttons.** Removed "→" from "Thêm test và lời giải".
- **Monospace for small labels.** Problem codes (P0007) were mono; now tabular sans. Mono is kept for code.
- **Indigo-on-slate default.** The first palette was stock Tailwind indigo/slate, the colour of every
  generated app. Replaced with mực tím ink, chalk green and red-pen mark tied to the classroom; the stock
  scales are not used.
- **Cream + terracotta / black + acid / broadsheet.** Avoided on purpose: the paper is cool blue-white, the
  accents come from school ink, and radius is kept (this is a book, not a newspaper).
- Removed the waving-hand emoji from the greeting and the decorative gradient on the auth page (the auth
  page now uses the faint ô li grid instead, which is the subject's own texture).

## Self-critique notes (screenshots in the Browser pane, API mocked)

- Score mark reads well: a handwritten "60" in red ink, ring drawn once, then a row of grid cells (green filled,
  red crossed). Kept it as the only animated moment; it is disabled under `prefers-reduced-motion`.
- The language select stretched to full width because `w-full` and `w-auto` both applied. `cn()` now uses
  tailwind-merge so later utilities win.
- On a 375px phone the dashboard's two-column grid overflowed because an implicit grid track sized to a
  truncated title. Every layout grid now declares `grid-cols-1` at the base breakpoint.
- The print toolbar's hint text crushed the title on phones; it is hidden below `sm`, and the sheet uses smaller
  side padding on screen while keeping A4 margins in print.
- Code in the answer key used `break-all`, which split identifiers mid-word; switched to
  `overflow-wrap: anywhere` so lines wrap at spaces first.
