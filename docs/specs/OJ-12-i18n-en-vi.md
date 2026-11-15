# OJ-12: Two interface languages (Vietnamese and English) and a layout pass

Status: done (approved by Htet Oo Naing, 2026-11-10: cookie switch; library use-intl, the core of next-intl, without its native extractor dependencies)
Owner: Htet Oo Naing
Risky area: minor (frontend, plus one optional `details` field on an identity error; no API shape, database or sandbox change)

## Outcome

Today every screen is Vietnamese only. Teachers and students who read English better, and visiting reviewers, should
be able to switch the whole interface to English and back, with the choice remembered. Because English labels are
often longer than the Vietnamese ones, every screen is checked and fixed for alignment at phone, tablet and desktop
widths in both languages.

## Scope

In:
1. Locales `vi` (default) and `en`. The choice is stored in a cookie (`oj_locale`, one year), read on the server so
   the first render and `<html lang>` are already in the right language (no flash). No `/en/...` URL prefix: links,
   bookmarks and invitation links stay the same.
2. A language switch in the header (desktop and mobile menu) and on the sign-in, register, invite and forgot-password
   pages.
3. All interface text in `src/frontend` (about 1,070 strings in 72 files) moves into two typed dictionaries,
   `src/frontend/src/i18n/messages/vi.ts` and `en.ts`. The English file must have exactly the same keys as the
   Vietnamese one; a missing key is a type error, not a runtime blank.
4. Plurals ("1 problem / 3 problems"), and dates, times and numbers formatted with `Intl` in the active locale
   (`formatDateTime`, `formatDate`, the character counter on the import page, expiry times).
5. Enum labels (verdict, difficulty, language, set type, session state, role, organization role, problem text field)
   come from the dictionaries. The `*Labels` maps in `@oj/contracts` stay for the backend (print sheets, emails, the
   standard-I/O warning) and are not used by the frontend any more.
6. API errors: the frontend shows a translated message chosen by the stable `code` (K-13) when the dictionary has it,
   and falls back to the server's Vietnamese `message` otherwise. The backend is unchanged.
7. Layout pass, both languages, at 375, 768, 1024 and 1440 px: no text overflowing buttons, badges, table headers or
   cards; no horizontal page scroll; buttons in a row keep one height; icons and labels aligned on the same baseline;
   form labels and inputs on a consistent grid; dialogs fit on a phone.

Out: translating user content (problem statements, test data, thread posts, class names), AI output, emails and
other server-generated text (emails stay Vietnamese), a per-user language saved in the database, right-to-left
languages, more than two languages.

## Done when

- [x] Switching to English shows no Vietnamese interface text (user content excepted), and the choice survives a
      reload, sign-out and sign-in; switching back shows the Vietnamese text unchanged (browser `language` spec; seen
      live as student, teacher and admin).
- [x] `<html lang>` is `vi` or `en` on the first server render.
- [x] A missing or extra English key is a type error (`satisfies Dict<typeof vi>`) and a test failure
      (`i18n.test.ts`, which also checks that both languages use the same arguments and tags and that every message is
      valid ICU).
- [x] Frontend unit tests: locale cookie with fallback to `vi`, plurals, dates per locale, error message by code with
      fallback to the server message (`i18n.test.ts`).
- [x] `i18n-coverage.test.ts` finds no Vietnamese text outside `i18n/messages/vi` (comments excepted).
- [x] Layout audited in both languages at 375 / 768 / 1024 / 1440 px (header also 1280 / 1536) on 26 pages across
      student, teacher and admin: no sideways page scroll, nothing past the viewport, no button, badge, tab or table
      header label wrapping. Found and fixed: the administrator's eight-item header overflowed at 1024 and 1280 px;
      the large class code broke at its hyphen on phones; the sign-in language switch squeezed the tagline; modal
      footers did not wrap.
- [x] Browser end-to-end suite passes: the 8 existing Vietnamese journeys unchanged, plus the new language case.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass (frontend 34, backend 229, engine 166). Checked
      2026-11-10.
- [x] User manual, README, test plan (X-01), technical overview and CLAUDE.md (frontend rule 9) updated.

Review round (2026-11-10, frontend-engineering and product-design reviews): server-safe locale state; only the
active dictionary sent to the browser; English errors keep `attemptsLeft` and translate each field message
(`errors.fields`, checked against every backend DTO message by a test); English plurals for points, minutes, days and
students; results ties sorted the Vietnamese way; admin-name check restored; coverage test also catches `\u` escapes.
Copy: "Quiz" for the set type and preset (no clash with test cases), "Start now" / "Start timed session" for any timed
session, "Solve" on the home card, "No deadline" / "Untimed", "Integrity" in the menu and "Integrity hints" as the
title, the "Public" hint and the cannot-submit reasons fixed. Then one English name per concept (problem set, source
set, your bank, hidden tests, reference solution and solution guide, AI-use check, post, hint, Completed, Closing
soon), clearer sentences (scoring note, class-code hint, "Submitted by" / "Time", "Timing and rules"), curly quotes
and apostrophes, British spelling (practise, centre) with -ize, and shorter long buttons ("Refresh from bank &
rejudge", "Approve all (n)", "New set from your problems", "Use all suggestions", "Use standard I/O", "Hidden until
closed"). The security-verifier found the identity change safe (no new information exposed, same timing). Gate, browser
end-to-end (9) and the English layout sweep of the changed pages pass, 2026-11-11.

Not covered: emails, AI output and integrity reasons stay Vietnamese (server text, out of scope); English wording has
not been reviewed by a native speaker; the print sheet was converted but not printed.

## Contexts and contracts

Frontend, plus no change to `@oj/contracts` types (the `*Labels` maps remain; the frontend stops importing them).
Backend, added in the review round: `DomainError.validation` takes optional `details`, and `identity.wrong_code` sends
`details.attemptsLeft` (the count was already in the Vietnamese message) so English can say how many tries are left.
`ApiErrorBody.details` already existed; no new route, query or database change.

New files: `src/frontend/src/i18n/{config.ts,runtime.ts,provider.tsx,types.d.ts}`, dictionaries
`src/frontend/src/i18n/messages/{vi,en}/<namespace>.ts` (common, enums, shell, errors, auth, student, session, bank,
authoring, classes, assign, admin), `src/frontend/src/components/locale-switch.tsx`. Changed: every page and component
that renders text, `app/layout.tsx` (reads the cookie), `lib/utils.ts` (formatters use the active locale),
`lib/api.ts` (`errorMessage` by code). Switching language reloads the page so no component keeps old text.

Dependency (approved): `use-intl` 4.14.9 in `@oj/frontend`, the core of next-intl with the same API (ICU messages,
`t.rich`, typed keys). next-intl itself was not used: it also installs native SWC and file-watcher binaries for a
message extractor, and its routing layer is not needed without URL prefixes.

## Security

No new route or query. The cookie holds only `vi` or `en`; any other value falls back to `vi`. Translated error text
never includes server data beyond what `message` already showed.

## Tests

`src/frontend/test/i18n.test.ts` (locale resolution, plural, interpolation, formatters, error by code),
`src/frontend/test/i18n-coverage.test.ts` (no stray Vietnamese literals; dictionaries have the same keys).
`e2e/browser`: one new case that switches to English on the sign-in page, signs in and checks the header labels.

## Rollout and risks

Ships as one frontend change; default stays Vietnamese, so existing users see no difference unless they switch.
Risk: a missed string stays Vietnamese in English mode; the coverage test catches literals but not text built from
server data. Risk: wording drift; the Vietnamese file is the source of truth and is moved, not rewritten.
Cost: the root layout reads the cookie, so every route is rendered on the server per request (before, client-only
pages were prerendered). On Vercel each first load is a function call; accepted for a first render that is already in
the right language. The language state used outside components (`i18n/runtime.ts`) is browser-only, because module
state on the server is shared by all requests; server-rendered text must come from hooks.
Rollback: revert the frontend change; nothing persisted except a harmless cookie.
