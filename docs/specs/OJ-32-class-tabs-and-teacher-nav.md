# OJ-32: Class page tabs and a shorter teacher menu

Status: done
Owner: Htet Oo Naing
Risky area: no (frontend only; no new route, query or contract)

## Outcome

A teacher opens a class and finds sessions, grades, the class board and students in four tabs, with counts that show
what is waiting (join requests, unanswered questions), instead of one long scroll where requests and questions sit
below the fold. The top menu for teachers drops from 7 items to 4, so "Cần xem lại" stops competing with links that
repeat paths found elsewhere (UX review, findings 03 and 04).

## Scope

In:
- Class page `/classes/[id]`: the lifecycle bar and class header stay on top; below them four tabs, kept in the URL as
  `?tab=`:
  - **Phiên** (default): the session list and "Giao bài cho lớp", as now.
  - **Bảng điểm**: the OJ-31 gradebook, moved into the tab. `/classes/[id]/gradebook` redirects to
    `/classes/[id]?tab=gradebook` (a redirect in `next.config.ts`, like the other old routes), so links already shared
    keep working.
  - **Bảng tin**: the class board. The badge shows the number of questions awaiting an answer.
  - **Học sinh (n)**: the requests panel on top, then the roster. The badge shows the number of waiting requests, join
    and leave, since the teacher decides both.
- Teacher menu (TEACHER, and ADMIN plus "Người dùng"): **Trang chủ, Lớp, Ngân hàng, Cần xem lại**. "Cần xem lại"
  shows the number of open integrity flags.
  - "Nhập đề" leaves the menu; the bank keeps its "Nhập đề từ file" button and `/import` still works.
  - "Tổ chức" and "Bài nộp" move to a new account menu next to the name: name and role, Tổ chức (only for an admin or
    an organization member), Bài nộp, sign out. The theme and language switches stay in the bar, one click away.
    Students have no account links, so they keep their name and a one-click sign-out button as today.
- On phones the same items sit in the existing menu panel, with the account items under a divider.
- After the UX review: the class page keeps one width (wide) on every tab, so nothing jumps when the gradebook opens;
  the tab bar sticks under the app header, and switching tabs from far down starts the new tab right under it; on a
  phone the class card shows only the code with a "Chi tiết lớp" toggle for the details, the settings and the active
  class banner (an archived class's banner always shows), so the tabs start at 316px of an 812px screen instead of
  676px.

Out: student menu (5 items, unchanged), teacher home, any new backend count endpoint, the assign dialog (OJ-33),
session stats and problem labels (OJ-34).

## Done when

- [x] As `gv.lan`, Tin học 10A1 opens on the Phiên tab; each tab changes the URL, and reloading or sharing that URL
      opens the same tab. Back and forward move between tabs.
- [x] Bảng điểm shows the same table, filter, sort and CSV as OJ-31; `/classes/[id]/gradebook` lands on that tab.
- [x] In Tin học 10A1, Bảng tin shows "1" (the seed has one unanswered question). After a student asks to join with
      the class code, Học sinh shows "1" (the seed has no join requests in 10A1). Deciding the request clears its badge
      without a reload; answering a question happens on the thread page, and the badge is right on return.
- [x] An archived class shows the four tabs read-only, with the same controls hidden as today.
- [x] A teacher's top menu has 4 items and an admin's 5; the account menu holds Tổ chức (only when it applies), Bài nộp
      and sign out; a student's menu and sign-out button are unchanged.
- [x] "Cần xem lại" shows the open-flag count and no badge at 0.
- [x] At 375 px the tab bar scrolls sideways inside itself and the page does not; tabs and the account menu work with
      the keyboard (arrow keys between tabs, Escape closes the menu and returns focus).
- [x] New strings in `vi` and `en`; `i18n-coverage.test.ts` passes; the gate passes.

## Contexts and contracts

- Frontend only. No backend change, no contract change, no migration.
- Counts come from calls the page or shell already uses: `api.listClassRequests(classId)` (join and leave requests),
  `api.listThreads(classId)` (`awaitingAnswer`), and `api.listIntegrityFlags({ status: 'OPEN' })`, all scoped to the
  actor by the backend today.
- The integrity count is fetched when the shell mounts for staff, after a flag is acknowledged on `/integrity`, and when
  the window regains focus at most once a minute (`refreshDue`); never on a timer. Only the latest call may set the
  count, so a slow reply cannot overwrite a newer one.
- New `lib/nav.ts`: `navItems(user)` and `accountItems(user)` (pure, tested), used by `app-shell.tsx`.
- New `lib/class-tabs.ts`: `classTab(param)` parses `?tab=` with Phiên as the fallback (pure, tested).
- New `lib/tabs.ts`: `nextTabIndex` (arrow keys wrap, Home and End, keys with a modifier left to the browser) and
  `badgeText`; `lib/threads.ts`: `awaitingQuestions` for the board badge (pure, tested).
- A click on a tab adds a history entry; arrow keys replace it, so Back does not walk through every tab passed over.
- The page reads `?tab=` inside a Suspense boundary, and the class body is keyed by the class id so badges and the
  gradebook never carry over to the next class. The gradebook tab uses the wide container, as its own page did.
- Board and requests stay mounted while their tab is hidden, so their own lists drive the badges with no extra
  request; the gradebook loads on its first visit and then stays mounted, so its filter survives switching tabs.
- The gradebook page body moves to `components/gradebook.tsx` and is rendered by the tab; the old page is removed and
  its route redirects.
- Tabs reuse `Tabs` from `components/ui.tsx`, which gains arrow-key, Home and End moves with one tab stop, and
  scrolls sideways when it does not fit (the rule under it is now an inset shadow so the underline is not clipped).
  `CountBadge` in `ui.tsx` is shared by the tabs and the menu; the count is read to screen readers as a sentence.

## Security

No new route or query. Every count comes from an endpoint that already checks roles and scopes to the actor. The
account menu hides Tổ chức from users who are not admins or organization members, as the menu does today; the
`/organizations` page keeps its own check.

## Tests

- `src/frontend/test/nav.test.ts` (new, also covers the class tabs): teacher gets Trang chủ, Lớp, Ngân hàng, Cần xem lại; admin also gets Người
  dùng; Tổ chức in the account menu only for an admin or an organization member; student items unchanged.
- Same file: each tab value parses; unknown or missing falls back to Phiên; the board count takes `awaitingAnswer`
  only; badges show nothing at 0 and "99+" above 99; arrow keys wrap, Home and End jump, a modifier leaves the key to
  the browser; focus refreshes at most once a minute.
- `e2e/browser/roles.spec.ts`, `organization.spec.ts`: Tổ chức and Bài nộp are checked in the account menu (helper
  `e2e/browser/menu.ts`); the student keeps a visible sign-out button. `language.spec.ts` unchanged.
- Checked by hand (no DOM test harness): the flag badge updates after acknowledging a flag; the underline follows a
  badge that appears after load; keyboard focus outline is fully visible on the tabs.
- `src/frontend/test/gradebook.test.ts`: unchanged, still passing after the move.
- `i18n-coverage.test.ts` covers the new strings.

## Rollout and risks

- One PR on `feat/oj-32-class-tabs-and-teacher-nav`, frontend only. Roll back by reverting it.
- Risk: teachers used to "Nhập đề" and "Bài nộp" in the top bar look for them. The bank button and the account menu
  keep both one click away; check with the two pilot teachers.
- Risk: the integrity count reuses the flag list. For a teacher the service checks each flagged session in turn and
  returns full flags that are only counted; for an admin it returns every open flag. Acceptable at today's numbers;
  follow-up: a count endpoint (or a batched `canReview`) if the list grows.
- Update `README.md` if it describes the class page or the menu.
