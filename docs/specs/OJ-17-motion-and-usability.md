# OJ-17: Motion, phone layout and usability fixes from the UI/UX review

Status: done (approved by the user 2026-11-13: "proceed to the rest")
Owner: Htet Oo Naing
Risky area: no (frontend only)

## Outcome

The remaining frontend findings of `docs/testing/ui-ux-review-2026-11-13.md` are fixed:
- **P1-5:** the phone rows.
- **P1-4, editor side:** the solve page's shortcut, split and font size.
- **P2:** motion and the usability items U1–U8.
- **P3:** the accessibility leftovers and the Markdown bundle size.

The trial run (P1-4, server side) is OJ-18 and dark mode is OJ-19.

## Scope

In:
- **Motion (DESIGN.md gets a Motion section).**
  - Tokens: `--ease-standard` and 120/180/240 ms durations.
  - Dialogs fade, and their panel rises on open. Closing reverses it.
  - The mobile menu slides down. The tab underline slides between tabs.
  - Toasts slide in and fade out, pause on hover, are announced (`role="status"`, `aria-live`), and sit top-centre on
    phones (U7).
  - The result panel eases open.
  - Buttons have a subtle pressed state.
  - Everything is CSS (`@starting-style`, `transition-behavior: allow-discrete`), and is off under reduced motion.
- **P1-5:** session rows on phones put the status on its own line.
- **Solve page:**
  - Ctrl/Cmd+Enter submits, with a hint on the button.
  - A draggable statement/editor divider from `lg`, remembered.
  - Editor font size A−/A+, remembered.
- **U1:** teacher home hints wrap instead of being cut off.
- **U2:** the whole bank row opens the problem, and "has a solution" is a visible badge.
- **U3:** the problem page's sharing panel collapses to one summary line, opened on demand.
- **U4:** the results board sorts by column, shows a "solved by" row per problem, links each cell to that student's
  submissions, and refreshes every 30 s while the session is open.
- **U5:**
  - Password fields get a show/hide button.
  - The sign-in page uses its width on large screens.
- **U6:** at most two badges per session row; the rest is plain text.
- **U8:** empty lists offer their next action where one exists.
- **P3:**
  - `Tabs` get `tablist`/`tab`/`aria-selected` roles.
  - Pagination marks the current page.
  - Real text no longer uses `slate-400`.
  - KaTeX gets size limits.
  - `rehype-highlight` registers only the five judge languages.

Out:
- The trial run (OJ-18).
- Dark mode (OJ-19).
- Bundling Monaco locally. That is a dependency change, done only if the owner asks.

## Done when

- [x] Each item above can be seen on the test system at 1024 and 375 px, with reduced motion respected.
- [x] Tests:
  - the pure helpers (split clamp, font-size steps, results sorting and totals);
  - the i18n coverage.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass.

## Contexts and contracts

Frontend only. No contract change. The results board's "solved by" totals are computed from the existing
`SessionResultsDto`.

## Results and notes (2026-11-13, test system)

- **Checked live:**
  - The sign-in page uses two columns at 1024 px, and the password toggle switches the field type and
    `aria-pressed`.
  - The results board sorts by every column with `aria-sort`, shows the "solved by" row, links cells to that problem's
    submissions (filtered), and shows the live-update note.
  - Bank rows are clickable across their whole width, with a visible solution badge.
  - The sharing panel collapses and expands.
  - The tab underline slides (`left, width 0.18s`).
  - Dialogs play their exit (`data-state="closing"`), then unmount and return focus.
  - On the solve page, the divider moves with the keyboard and is remembered, A+ raises the font (remembered), and
    Ctrl+Enter submits. The key hint reads "⌘ ↵" on a Mac.
  - On phones the session row is 176 px tall (about 300 before) and toasts sit at the top.
- **Bugs found and fixed during the check:**
  - Fast repeated presses on the divider and the font buttons counted once (stale state). They now use functional
    updates.
  - On a Mac, Monaco's `CtrlCmd` is Cmd. Both Ctrl+Enter and Cmd+Enter are now bound.
- **Kept as is:**
  - U6: the rows have only two badges (state, type). Their crowding on phones was the layout problem fixed in P1-5.
  - The results cells open the problem's submissions for all students: there is no per-student filter in the API.
    Adding one is a backend change for later.
- **Not measured:** the transition timings could not be watched in this embedded browser, because a hidden pane
  freezes animation clocks. The transitions were checked to run and to finish at the right values.
- **Correction (2026-11-13, Safari check in OJ-20):** U2's stretched link over the bank row broke Safari. Safari does
  not position table rows, so the overlay covered the whole bank page. The row now handles clicks itself
  (`lib/row-link.ts`); see the OJ-20 spec, "Safari check".

