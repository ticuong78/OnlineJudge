# OJ-19: Dark mode ("bảng đen")

Status: done (approved by the user 2026-11-13: "proceed to the rest", the P3 dark-mode item of the UI/UX review)
Owner: Htet Oo Naing
Risky area: no (frontend only)

## Outcome

The app has a dark theme that fits its classroom identity: a "bảng đen" (blackboard) with chalk-white text on a dark
slate-green board, and violet-ink, green-chalk and red-pen accents.
- It follows the system setting by default.
- A switch in the header (and on the sign-in pages) cycles system → light → dark. The choice is remembered on this
  computer.
- The theme is set before the first paint, so there is no light flash.
- The code editor follows it (Monaco `vs-dark`).

## Scope

In:
- **Tokens, not per-element `dark:` classes.**
  - Under `:root[data-theme='dark']`, `globals.css` redefines `paper`, `rule`, `graphite`, a new `surface` (cards, was
    `bg-white`) and a `scrim`.
  - The 50–900 scales are redefined with reversed lightness, so light tints become dark-tinted backgrounds and dark
    shades become light text. Scales: slate, ink, chalk, mark, amber, sky, orange and purple.
  - Solid fills that carry white text use new `ink-solid`, `chalk-solid` and `mark-solid` tokens (and their `-hover`
    variants), so they keep white-text contrast in both themes.
- **Code changes, mechanical:**
  - `bg-white` → `bg-surface`;
  - solid `bg-*-600/700` → `bg-*-solid(-hover)`;
  - `bg-slate-900/x` scrims → `bg-scrim/x`.
- **The rest of the page:**
  - the grid paper;
  - Markdown (`prose`), code highlighting and KaTeX;
  - native controls (`color-scheme`);
  - scrollbars.
- **Printing** always uses the light theme. The dark tokens apply on screens only.
- **`lib/theme.ts`:** the preference (`system`/`light`/`dark`) and its resolution, plus the boot script.
  `ThemeSwitch` component; vi/en strings.
- **DESIGN.md:** a "Dark theme" section.

Out:
- A per-account setting stored on the server (this computer only, like the editor font size).
- High-contrast themes.

## Done when

- [x] On every main page (home, bank, problem, session, solve, results, submissions, class, sign-in) in dark mode, text
      meets 4.5:1 against its background, and solid buttons keep white text at 4.5:1 or more.
- [x] The theme is applied before the first paint, follows the system while set to "system" (also when the system
      changes), and is remembered.
- [x] Printing a set or an answer key from dark mode prints light.
- [x] The Monaco editor is dark in dark mode.
- [x] Tests:
  - the preference parsing and resolution;
  - a contrast check of the dark tokens;
  - the i18n coverage.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass.

## Contexts and contracts

Frontend only. No contract change.

## Results and notes (2026-11-13, test system)

- **Checked live in dark mode:** sign-in, teacher home, bank, a problem page (editor, preview with KaTeX, solution
  with Monaco), a submission, the results board, the solve page with a trial run, and the home page and menu on a
  phone.
- **Contrast scan:** every rendered text element was checked against its own background. No text fell under 4.5:1
  (3:1 for large text), except the two below. Both are the same faint grey in the light theme by design: the board's
  "0" for "nothing submitted" and code line numbers.
- **Switching:**
  - The switch cycles system → light → dark and its label says the current and next choice.
  - "System" follows an OS change while the page is open.
  - The print page is light with "dark" saved. The "In đề" (Print) link opens it in a new tab, which is a full load,
    and going back restores dark.
  - In-app navigation into a print page is covered by `LightThemeOnly`, but no link does that today, so it was not
    exercised live.
- **Light theme:** the teacher home looks as before. Only that page was compared side by side.
- **Found and fixed during the check:**
  - The dark chalk and red hover fills gave white text 4.29:1 and 4.48:1. All hovers now darken.
  - The print page would have stayed dark after an in-app link. It now forces light while shown.
- **Not covered:** real devices and Safari; Windows high-contrast mode.
