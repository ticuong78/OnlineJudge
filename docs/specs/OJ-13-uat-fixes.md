# OJ-13: Fixes from the UI and UAT pass of 11 November 2026

Status: done (approved by the user 2026-11-12: "Fix all findings")
Owner: Htet Oo Naing
Risky area: no (frontend behaviour; two read-only backend additions, staff-only)

## Outcome

Every finding in `docs/testing/uat-2026-11-11.md` (H1, M1 to M9, L1 to L10) is fixed. Teachers stop losing
unsaved work, students on phones see their verdict and their exam clock, dialogs and errors work with a keyboard and a
screen reader, and teachers see new questions on their home page.

## Scope

In:
- **H1:** the problem and set editors warn before leaving with unsaved changes. This covers in-app links (a
  confirmation dialog) and reload or closing the tab (the browser prompt). The new-problem form also keeps a local
  draft that is restored on return, with a "discard draft" action.
- **M1:** after Submit on a narrow screen, the result panel scrolls into view.
- **M2:** below `lg`, the exam timer is repeated in the editor toolbar, and that toolbar is sticky.
- **M3:**
  - Monaco does not trap the mouse wheel (`alwaysConsumeMouseWheel: false`).
  - The editor is shorter on phones, so there is page around it to scroll.
- **M4:**
  - Teachers with 7 menu items get the brand and their name from 1320 px.
  - Names are truncated, never wrapped.
- **M5:** `Modal` manages focus:
  - moves focus in when it opens;
  - traps Tab inside;
  - returns focus to the trigger when it closes;
  - labels itself with `aria-labelledby`.
- **M6:** `InlineAlert` uses `role="alert"` for errors and warnings, and `role="status"` for info and success.
- **M7:** asking a question from the solve page keeps the student on the problem; the new question appears in the
  list.
- **M8:**
  - `ThreadSummaryDto.awaitingAnswer` is true for a question with no reply from a teacher or administrator.
  - The teacher home lists these questions across the teacher's active classes.
- **M9:** every page sets its own tab title. `PageHeader` sets it from its title, and pages without a header set their
  own.
- **L1:** label the controls:
  - `MarkdownField`: the label is tied to the textarea, and the Write/Preview toggles carry `aria-pressed`;
  - the test input and output textareas;
  - the search inputs;
  - the code language selects;
  - the logo link.
- **L2:** tap targets of at least 24 px for:
  - remove tag and the delete or remove buttons;
  - AI switches;
  - "Copy";
  - "Ask about this problem".
- **L3:** "Assign" is disabled for a problem with no tests, and says why.
- **L4:** native validation messages come from the i18n dictionaries.
- **L5:** signing out goes to `/login` without `?next=`.
- **L6:** Escape on the mobile menu returns focus to the Menu button.
- **L7:** the timed session page shows its rules once.
- **L8:** managers do not see the student progress line on a session page.
- **L9:** when the server has no Claude key, AI switches are disabled with the reason. This uses a new
  `GET /api/features` (staff) that returns `FeaturesDto { ai: boolean }`.
- **L10:** "Create your first class" opens the create-class dialog directly (`/classes?create=1`).

Out:
- A route guard for the browser Back button. Next.js has no route-change events; the new-problem draft covers it.
- Notifications by email.
- Real-device testing.

## Done when

- [x] Each finding above can be seen fixed on the UAT stack in Chromium, at the widths where it was found.
- [x] `community` test: `awaitingAnswer` is true for an unanswered question, false after a teacher reply, still true
      after only a student reply, and false for an announcement.
- [x] Frontend tests cover the unsaved-change detection, draft storage and `Modal`'s focus helpers. Where those need a
      DOM, they cover the pure parts.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass.
- [x] `docs/API.md` lists `GET /features` and the new `awaitingAnswer` field.

## Contexts and contracts

- **community:** `Thread.awaitsAnswer` (domain) and `toSummary`. No new dependency.
- **shared presentation:** `FeaturesController` reads `ClaudeClient.enabled`. No context dependency.
- **`@oj/contracts`:** `ThreadSummaryDto.awaitingAnswer: boolean`, and the new `FeaturesDto`.
- **Database:** no entity or migration change. Thread replies are already stored with the author's role.

## Security

- `GET /features` takes `@Roles('ADMIN', 'TEACHER')`. It returns one boolean and never the key or the model.
- `awaitingAnswer` is computed from data the caller can already read.

## Tests

- `src/backend/test/integrity-community.test.ts`: the `awaitingAnswer` cases.
- `src/frontend/test/`: unsaved-changes and draft helpers, and the focus-trap target selection.

## Notes from implementation

- **Header (M4):** the 1320px rule is written `min-[82.5rem]`. A `min-[1320px]` rule is emitted before `lg:hidden`
  in the stylesheet, so `lg:hidden` won and the brand never came back.
- **Tab titles (M9):** Next.js rewrites the root metadata title after some navigations (for example
  `router.replace` to the same path). `usePageTitle` therefore re-applies its title when the head changes, and only
  the last-mounted owner does so.
- **Tags label (L1):** the tags `Field` was a `<label>` whose control became the first "remove tag" button. Clicking
  the caption removed a tag. It is now a caption plus `aria-labelledby`.
- **Unrelated flaky test:** `src/engine/test/sweeper.test.ts` failed once under full-suite load, because a fixed
  110ms sleep was too short for its 20ms timers. It now waits for the sweeps with a 2-second deadline. This is a test
  change only.

## Review fixes (2026-11-12)

The `/review` pass found these. All are fixed and re-checked live:
- **Focus return:** Modal recorded its opener in an effect, after an `autoFocus` field had already taken focus, so
  form dialogs returned focus to nothing. It now records the opener while rendering the opening. Only the top
  dialog answers Escape, and Tab inside a nested dialog stays there.
- **Saved state:** the problem form compares against the last saved value and shows the stored version after a save.
  The server lowercases tags and trims the title, which left the form "unsaved" after a successful save.
- **Tab switches:** the problem page asks before switching tabs with unsaved statement or solution edits.
- **Sign-out:** problem drafts are cleared, like the "continue" shortcut (K-2).
- **Validation:** pattern, step and bad-input messages use the app's wording too.
- **Backend:** `awaitingAnswer` counts only students' questions. `/features` reads an application port,
  `AiAvailability`, not the infrastructure class. The route test now proves it scans `src/shared`.
- **Smaller fixes:**
  - one leave dialog per click;
  - a stack of title owners;
  - `GET /features` has its own section in `docs/API.md`.
- **New tests:**
  - `backend/test/features.test.ts`;
  - in `frontend/test/uat-fixes.test.ts`: the L5 redirect, the M8 list, draft clean-up, and a source check that
    `TagsInput` is never inside a `<label>`.

## Shared-computer code drafts (2026-11-12, approved by the user: "Yes, fix it here")

- **Problem:** found while fixing drafts. Students' code drafts on the solve page were stored per session, problem
  and language, but not per account. On a shared lab computer, the next student who opened the same problem saw the
  previous student's code.
- **Fix:**
  - Drafts are now keyed `oj:draft:u:<account>:<session>:<problem>:<language>` (`codeDraftKey` in `lib/unsaved.ts`).
  - Sign-out removes old unkeyed drafts and teachers' problem drafts.
  - A student's own keyed drafts stay, so they get their work back when they sign in again on that computer.
- **Trade-off:** a draft saved before this change is no longer offered. It cannot safely be given to anyone, since
  nothing records whose it was. Submitted code is on the server and is unaffected.
- **Tests:** in `frontend/test/uat-fixes.test.ts`.
- **Live check:** two students in one browser on the same problem.
  - The second student got the template.
  - The first student got their draft back after signing in again.
  - Old shared drafts were gone after sign-out.

## Senior review fixes (2026-11-12)

- **Sign-out:** it asks first ("Đăng xuất khi chưa lưu?") when a form has unsaved changes. Sign-out also deletes
  problem drafts, so it used to lose a half-written problem without a word.
- **Waiting questions:** the teacher home's list now comes from one request, `GET /threads/awaiting` (ADMIN,
  TEACHER). It is scoped to the active classes the caller runs, and to all classes for an administrator. It replaces
  one request per class, which stopped at 12 classes and so gave administrators an incomplete count. Tested in
  `backend/test/community-awaiting.test.ts`.
- **Testable fixes:** the logic behind three earlier fixes is now in plain functions with regression tests
  (`trackOpener`, `adoptStored`, `createDraftAutosave` in `frontend/test/uat-fixes.test.ts`):
  - dialog focus going back to its opener;
  - the form counting as saved after a save the server normalised;
  - no stale draft after a fast save.

  This needed no new dependency.
- **User manual:** `docs/guide/user-manual.md` covers:
  - per-account code drafts;
  - the leave and sign-out prompts and restored problem drafts;
  - "Giao bài" needing a test;
  - waiting questions on the teacher home;
  - asking a question from a problem staying on that problem.

## Rollout and risks

Frontend behaviour, one new read-only staff route and additive contract fields; old clients ignore them.

**Release outside exam hours.** Code drafts saved before this release used names without an account, so they are not
offered back afterwards. Nothing records whose they were, so they cannot safely be given to anyone. A student in the
middle of a timed exam would find the template instead of their unsaved code; submitted code is on the server and
unaffected. Put this in the PR description.

A student's own drafts stay in that browser after sign-out. The next person cannot see them in the app, only through
the browser's developer tools. This is accepted. Watch for the leave dialog appearing
after a successful save. The editors clear their dirty state before navigating.
