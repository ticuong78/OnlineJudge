# OJ-16: Perceived speed: instant shell, navigation feedback, skeletons

Status: done (approved by the user 2026-11-13: "Start P1 speed fixes")
Owner: Htet Oo Naing
Risky area: low. The frontend only. It touches how the signed-in user is restored (`lib/auth.tsx`); the server still
checks every request.

## Outcome

Findings P1-1 to P1-3 of `docs/testing/ui-ux-review-2026-11-13.md` are fixed:
- **Instant shell:** pages appear with their header straight away on every full load, instead of a blank "checking
  sign-in" screen.
- **Navigation feedback:** clicking a link shows progress at once.
- **Skeletons:** lists show their shape while loading, instead of a spinner that is then replaced.

## Scope

In:
- **P1-1, instant shell.**
  - After sign-in, the account summary (`UserDto`) is kept in `localStorage` as `oj:me`, together with a fingerprint
    of the token it belongs to.
  - On load, before the first paint, a cached user that matches the current token is shown at once. `/auth/me` then
    confirms or updates it in the background.
  - A 401 clears the cache and signs out, as today. A network error keeps the cached user, so the page shows its own
    error instead of the sign-in page.
  - Sign-out clears the cache.
  - With no cache (first visit), a header skeleton replaces the blank screen.
  - The page's data request now starts at the same time as `/auth/me`, not after it.
- **P1-2, navigation feedback.**
  - A thin ink progress bar at the top of the page starts on any click on an in-app link to another page, and ends
    when the new page is shown. If nothing changes within 10 s, it ends anyway.
  - It does not start when the leave guard stopped the click.
  - `app/(main)/loading.tsx` shows a page skeleton while Next.js prepares the next route.
- **P1-3, skeletons.**
  - `Skeleton`, `ListSkeleton` and `TableSkeleton` in `components/ui.tsx`. Each has `aria-busy` and a screen-reader
    text from the dictionaries. The pulse stops under reduced motion (global rule).
  - They are used where whole lists load: the home pages (classes, sessions, announcements and the learning record),
    the bank, the sets, sessions, submissions, the results board, classes, and the student class list.

Out:
- Data caching between pages (SWR-style).
- The motion work (P2) beyond the skeleton pulse and the bar.
- Server-side rendering of pages.

## Done when

- [x] A full load of a signed-in page shows the header and page frame without the "checking sign-in" screen.
- [x] The page data and `/auth/me` start at the same time.
- [x] A cached user is never shown for a different token.
- [x] Sign-out removes the cache.
- [x] A 401 still sends the user to sign-in.
- [x] Clicking an in-app link shows the bar at once and hides it on arrival. A click stopped by the leave guard shows
      no bar.
- [x] The main lists show skeletons while loading.
- [x] Tests:
  - the cache read, write and clear with token matching;
  - the bar's start rule (reusing `leavesPage`).
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass. A live check on the test system at 1024 and 375 px.

## Contexts and contracts

Frontend only. No contract change.

## Security

- **Server checks unchanged:** the cached summary is only a hint for drawing the interface, and the server still
  authorizes every request.
- **Personal data:** it holds the same personal data `/auth/me` returns (name, email, phone), in the same storage
  as the token itself (ADR 0002). It is cleared on sign-out and on a 401.
- **Token matching:** the fingerprint (last 16 characters of the token) prevents showing one account's summary with
  another account's token.

## Results (2026-11-13, test system, development build)

- **Full reload of the bank page:**
  - The header and a table skeleton are shown at once; the "checking sign-in" screen is gone.
  - `/problems` now starts while `/auth/me` is still running (405 ms against 355–454 ms), instead of after it.
  - The data was in after about 460 ms. Before the change it took about 1,250 ms, but development timings vary.
- **Navigation bar:**
  - It appears on an in-app click and is gone on arrival.
  - It does not appear behind the leave guard's "Rời trang khi chưa lưu?" (Leave without saving?) dialog.
- **Rejected token with a cached account:** it goes to `/login?next=…`, and both the token and the cache are
  cleared.
- **Found during the check:** the home pages' main card first showed a fallback and then switched. For example, the
  student saw "Luyện tập" (Practice) before "Vào thi" (Enter the exam), so the button moved under the finger. It now
  shows a placeholder until its data is known. The class line above it reserves its space too.
- **Not covered:** no hydration warnings appeared in the console. CLS could not be measured in the embedded browser,
  and a production build was not measured.
