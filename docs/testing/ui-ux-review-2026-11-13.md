# UI/UX review, 13 November 2026

Scope: the whole web app, judged as a senior UI/UX engineer. The questions were whether it is modern, easy to use,
smoothly animated and responsive.

Method:
- **Reading:** the design plan (`src/frontend/DESIGN.md`), the tokens (`globals.css`) and the shared components.
- **Live walkthrough:** teacher and student journeys on the seeded test system at 1024 px (laptop) and 375 px
  (phone).
- **Load measurements:** in the browser, on a development build.
- **Earlier evidence:** the layout sweep of `uat-2026-11-11.md` (50 page views, 4 widths, 2 languages) and the fixes
  made since (OJ-13).

Read the scorecard against the design plan. The app deliberately looks like a Vietnamese exercise book ("vở ô li"),
and keeps one expressive animation: the score mark. The review respects that identity. "Modern" here means polished,
fast-feeling and consistent, not trend-following.

## Scorecard

| Area | Rating | In one line |
|---|---|---|
| Visual identity | **Strong** | Distinctive and coherent: paper, ink, red pen, chalk green. It does not look like a generated template. |
| Ease of use | **Good** | Every home page leads with one next step; forms are clear. The gaps are in the problem page's order, the results board and practice tools. |
| Responsiveness | **Good** | No overflow at any width in either language. One phone layout wastes space (P1-5). |
| Perceived speed | **Weak** | A blank "checking sign-in" screen on every full load, no feedback on in-app navigation, and full-block spinners. |
| Motion | **Weak** | 10 transitions in the whole app. Dialogs, menu, toasts, tabs and results appear and vanish with no motion. |
| Accessibility | **Good** | Focus handling, labels, titles and alerts were fixed in OJ-13. A few roles and contrast nits remain (P3). |

## What already works well

- **A distinctive visual system.** Six named colours with full scales, a radius hierarchy instead of one radius
  everywhere, no decorative shadows, sentence case, and Be Vietnam Pro for clean Vietnamese diacritics.
- **The verdict moment.** A handwritten score drawn with a ring, then a row of grid cells per test, green or red. It
  is the one loud moment, and it lands.
- **Clear next steps.**
  - Teacher home: "Giao bài" (Assign).
  - Student home: "Vào thi" (Enter the exam) or "Làm tiếp" (Continue).
  - The problem page always shows "Nộp bài" (Submit).
- **Calm, scannable lists.** The bank table, the results board and the learning record. Reloading a list dims it
  instead of blanking it, which is the right pattern.
- **Robust responsiveness.** Since OJ-13 the solve page works on a phone: the result scrolls into view, the timer is
  sticky, and the editor leaves room to scroll.
- **Accessibility.** Reduced motion is respected globally. Focus is visible everywhere.

## P1: biggest effect on how the app feels

Status (2026-11-13): every item of this review is addressed.
- P1-1 to P1-3 in `docs/specs/OJ-16-perceived-speed.md`.
- P1-5, P2 and the P3 polish in `docs/specs/OJ-17-motion-and-usability.md`.
- P1-4 in OJ-17 (editor) and `docs/specs/OJ-18-trial-run.md` (trial run).
- Dark mode in `docs/specs/OJ-19-dark-mode.md`.

Still open: bundling Monaco locally (a dependency change, on request) and per-account editor preferences.

### P1-1. A blank screen on every full page load

**What happens.** Opening a link, refreshing, or opening a new tab shows only a spinner and "Đang kiểm tra đăng
nhập…" (checking sign-in) on an empty page. There is no header and no layout. The page's own data is requested only
after the sign-in check returns. Measured on the development build:
- `/auth/me` starts at about 1.07 s;
- `/problems` starts after it, at about 1.17 s, and finishes at about 1.25 s.

**Why it matters.** Every refresh and every link from email or chat starts with a flash of nothing.

**Fix:**
1. Render the shell (header and page frame) at once, from a small cached copy of the signed-in user. Use
   `sessionStorage`, cleared on sign-out. Then confirm it with `/auth/me` in the background.
2. Start the page's data request in parallel with the check: the token is already in the browser.
3. If the check fails, go to sign-in as today.

**Where:** `components/guards.tsx` (`RequireAuth`) and `lib/auth.tsx`.

### P1-2. Clicking a link gives no feedback

**What happens.** After a click, the old page stays, unchanged, until the new one renders. On a slow network or the
first visit to a page this looks like nothing happened, and students click again. No route has a `loading.tsx`.

**Fix (both are cheap and need no new dependency):**
- Add `loading.tsx` skeletons for the main route groups. Next.js shows them instantly on navigation.
- Add a thin ink-coloured progress bar at the top while a navigation is pending.

### P1-3. Spinners instead of skeletons

**What happens.** 48 places render `<LoadingState>`, a centred spinner that is replaced by the real content when it
arrives. The page jumps, and the user cannot tell what is coming.

**Fix:**
- Build three skeleton pieces: a list row, a table row and a card.
- Use them on the home pages, the bank, sessions, submissions and the results board.
- Keep showing (dimmed) the previous data on reload, as the bank already does.

### P1-4. The solve page lacks the tools learners expect

The solve page is the core screen. Three gaps:

| Gap | Why it matters | Suggestion |
|---|---|---|
| No trial run on the sample tests | Every check of the code costs a real submission, and an attempt in limited exams. Trying the examples is the most common learner action on other judges. | A "Chạy thử" (Try) button that runs only the sample tests and shows each input, expected and actual output side by side, without recording a submission. **Needs a backend endpoint and a spec.** |
| No keyboard shortcut to submit | Students live in the editor. | Ctrl/Cmd+Enter to submit, shown as a hint on the button. |
| Fixed 50/50 split | Long statements or long code need more room. | A draggable divider, remembered per user. Editor font size (A−/A+) in the toolbar. |

### P1-5. Session rows waste space on phones

**What happens.** On the student home at 375 px, the right-hand status ("Chưa bắt đầu, 60 phút", Not started, 60
minutes) keeps its own column. That squeezes the title, badges and meta into a narrow strip where each wraps onto its
own line. One session takes about 300 px, so barely two fit on screen.

**Cause:** `SessionList` in `components/sessions.tsx`, where the right-hand status is `whitespace-nowrap` on the same
flex line.

**Fix:**
- Below `sm`, put the status on its own line (`basis-full sm:basis-auto`).
- Keep the badges on one line.

## P2: motion (aligned with DESIGN.md)

The plan keeps one expressive animation. That should stay. But "no motion" currently also means no *functional*
motion, so state changes look abrupt. I suggest a new **Motion** section in DESIGN.md:

> Motion explains a change of state; it never decorates. Functional transitions are 120–200 ms with one easing curve.
> The verdict remains the only expressive animation. Everything is disabled under reduced motion (already global).

| Element | Today | Suggested |
|---|---|---|
| Dialogs | appear and vanish instantly | Backdrop fades in (160 ms), the panel fades and rises 4 px. On close, the reverse (120 ms). |
| Mobile menu | instant | Slides down 8 px with a fade (160 ms); the backdrop fades. |
| Toasts | appear instantly and vanish after a timeout | Slide in from the edge (180 ms) and fade out; pause on hover. Also give them `role="status"` / `aria-live`: they are not announced today. |
| Tabs | the underline jumps | The underline slides to the new tab (180 ms). |
| Result panel on Submit | appears | Expands its height (200 ms) before the score animation, so the eye follows it. |
| Buttons | colour change only | A subtle press state (`active:translate-y-px` or a darker shade) for tactile feedback. |
| Skeletons (P1-3) | (none) | A soft 1.2 s shimmer, or none under reduced motion. |
| Lists after an action | items pop | A new or updated row fades in once, for example a new question or a saved test. |

**How:**
- Use CSS only, with no animation library: `transition` plus `@starting-style` and `transition-behavior:
  allow-discrete` for enter and exit. These work in current Chrome, Edge, Safari 17.5+ and Firefox 129+. Older
  browsers simply skip the animation.
- Define `--ease-standard` and `--duration-1/2/3` tokens in `globals.css`.
- The exit animations in `Modal` and `Toast` need the element to stay mounted for its exit; a small helper does
  that, with no new dependency.

## P2: ease of use

| # | Where | Finding | Suggestion |
|---|---|---|---|
| U1 | Teacher home | The secondary actions' hints are cut off at 1024 px ("Tải .docx / .pdf, tách thàn…"), and an empty band sits under them. | Let hints wrap to two lines, or shorten the copy. Move "Phiên sắp hết hạn" (Closing soon) up into the left column. |
| U2 | Bank table | The whole row highlights on hover, but only the title is a link. The book icon (has a solution) is explained only by a tooltip. | Make the whole row the link (a stretched link). Replace the icon with a small "Có lời giải" (Has solution) badge, or add screen-reader text. |
| U3 | Problem page | The sharing panel takes the top third of the screen. Editing, the main task, starts below the fold. | Collapse sharing into one summary line under the title ("Riêng tư · Chia sẻ…", Private · Share…) that opens the switches in a popover or drawer. |
| U4 | Results board | No sorting, no rank, no per-problem totals, no live update during an exam, and no way to open a student's submissions from a cell. | Sortable columns, a "solved by n/m" footer row, each cell opening that student's submissions for the problem, and an auto-refresh every 30 s while the session is open ("cập nhật 10 giây trước", updated 10 s ago). |
| U5 | Sign-in, sign-up, reset | No way to show the password. On desktop the card is small in a large empty grid. | A show/hide eye button. On wide screens, a short product line or illustration beside the card, using the grid motif. |
| U6 | Lists on home pages | Up to five pills and coloured labels on one row ("Đang mở", "Sắp hết hạn", "Đề thi", class, points). | Show at most two badges (state and type), the rest as plain text. Colour only what needs action (closing soon). |
| U7 | Toasts on phones | Bottom-right, over the sticky Submit toolbar and the save bars. | Top-centre on phones, bottom-right on desktop. |
| U8 | Empty states | A grey inbox icon and a sentence. | Keep them calm, but add the next action as a button ("Tạo bài đầu tiên", Create your first problem), as the class list already does. |

## P3: polish and later

- **Dark mode.** There is none (0 `dark:` classes), and Monaco uses the light theme only. The colours are CSS
  variables, so a "bảng đen" (blackboard) dark theme fits the classroom identity well: chalk-white text on a
  slate-green board, with ink and red-pen accents. Follow the system setting and add a switch. **Effort: medium.**
- **Editor preferences.** Font size, light or dark, and tab size, remembered per account.
- **Accessibility leftovers from the code review.**
  - `Tabs` without tab roles.
  - Pagination without `aria-current`.
  - `text-slate-400` text below contrast.
  - KaTeX without size limits.
- **Bundle size.** `rehype-highlight` bundles about 37 languages on every Markdown page, but only 5 are needed.
  Monaco loads from a CDN, which also matters for offline labs (review S7).

## Suggested order

1. **P1-1, P1-2, P1-3** (perceived speed). One spec; frontend only; the biggest change in how the app feels.
2. **P2 motion, plus the DESIGN.md Motion section.** One spec; CSS-first; small.
3. **P1-5 and U1–U8.** Small, independent fixes.
4. **P1-4 trial run.** It needs a backend endpoint (run the sample tests without recording a submission), so it goes
   through its own spec, with the security-verifier, because it touches judging.
5. **Dark mode.**

## Not covered

- Real phones and Safari (Chromium device emulation only).
- A production build, whose load times will be lower than the development numbers above.
- Usability testing with real students and teachers. The findings above come from expert review, not observation.
