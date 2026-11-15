# OJ-1: Identity hardening, rate limits and startup checks

Status: approved 2026-11-07 by Htet Oo Naing (retroactive: the code exists as uncommitted work on top of dbb5168)
Owner: Htet Oo Naing
Risky area: yes (identity, `.env.example`)

## Outcome

Brute-force and abuse protection on every public route (week 0, item 2 of the playbook). One-time codes that cannot be spent twice or guessed past the attempt limit by racing. Tokens revoked when the password changes. A server that refuses to start with a dangerous configuration.

## Scope

In:
- Shared rate limiting: `shared/application/rate-limiter.ts`, `shared/infrastructure/memory-rate-limiter.ts`, `shared/presentation/rate-limit.ts` (`@RateLimit`, global `RateLimitGuard`), `client-address.ts`, `TRUST_PROXY`, and `Retry-After` exposed through CORS.
- Identity: `authenticator.ts`, `rate-limits.ts`, the `sendAccountExistsNotice` mail, and changes to `account.service.ts`, `one-time-codes.ts`, `verification.ts`, `security.ts` (token `cv` claim), `auth.guard.ts`, `identity.controllers.ts`, and the `classrooms.controller.ts` register limit.
- Startup: `config/environment.ts` (JWT secret rules, admin password policy, production warnings), `main.ts` (short config errors, shutdown timeout), `.env.example`.
- Docs: `docs/API.md` and `README.md` (limits and 429 behaviour).

Out: a shared Redis store for the limiter (single instance today), and token storage (ADR 0002).

The limiter is custom rather than `@nestjs/throttler`. This is accepted because it needs per-target keys (per mailbox, per verification id) that throttler does not express cleanly. Record that choice in the PR.

## Done when

- [x] Every `@Public()` route carries `@RateLimit` (enforced by `public-routes.test.ts`).
- [x] Two concurrent correct guesses spend a code once, and a code reissued mid-guess cannot be spent (`one-time-codes.test.ts`).
- [x] A password change or reset makes earlier tokens fail (`account-security.test.ts`).
- [x] Review finding B1 fixed: no full email in logs (`account.service.ts`, sign-in limit warning), with a test asserting the log text (`account-security.test.ts`, "throttled sign-ins are logged without the email address"; failed before the fix, passes after).
- [x] Review finding S5 / audit C5 (Medium) and audit N1 (Medium, pre-existing) fixed together.
  - Unknown addresses (forgot password) and existing ones (sign-up) now get real stored tickets, so resend, cooldown and wrong-code answers are identical by construction.
  - The owner of an existing account is emailed a notice with no code instead of a sign-up code.
  - The in-memory decoy table is no longer used. `decoy-tickets.ts` is left on disk because deleting an untracked file needs Htet.
  - Tests in `account-security.test.ts`: "follow-ups on a forgot-password ticket answer unknown addresses exactly like real ones" and "signing up with an address that already has an account looks exactly like a new sign-up". Both failed before the fix and pass after.
  - `docs/API.md` updated.
  - Re-verified by the security-verifier on 2026-11-07: C5 and N1 Fixed (`docs/security/audit-2026-11-07.md`).
- [x] Review finding S7 / audit C6: the guard stops at the first refusal and refunds what the call was already charged (`rate-limit.ts`). Tests in `rate-limit.test.ts` (a client blocked per IP cannot use up a victim's target budget; a target refusal costs no IP budget). Failed before, pass after.
- [x] Audit N2 (Medium): 50 wrong passwords per hour per account from all IPs together (`LOGIN_PER_ACCOUNT`).
  - The cap skips addresses that signed in to the account in the last 30 days (`recent-sign-ins.ts`, in memory), so an attack cannot lock the owner out.
  - A password reset lifts the cap.
  - The owner is emailed once per hour while the cap is hit (`sendSignInBlockedNotice`). Unknown addresses are capped the same way and get no email.
  - Tests in `account-security.test.ts`, four new.
- [x] Audit L3: background sends start with `setImmediate`, so known addresses do no extra synchronous work.
- [x] Review nit N4 / audit L1 (atomic resend): new `VerificationRepository.saveReissued` is a conditional UPDATE on `consumedAt IS NULL AND lastSentAt = <loaded value>`, used by resend, forgot password and teacher invitation resend.
  - Parallel resends send one code; the others get `resend_too_soon`.
  - A resend can no longer reopen a just-used code.
  - Tests: two in `account-security.test.ts`, one for invitations, and two PostgreSQL cases. Each unit test failed before the fix.
- [x] Audit L1 (fresh sign-up cooldown): accepted. Parallel first-time sign-ups for one mailbox are already held to 2 per minute by the guard's atomic per-mailbox limit; making the domain cooldown atomic too would need a partial unique index (a schema change) for a 2-to-1 reduction.
- [x] Audit R1: a unique-email violation on save is mapped to 409 `identity.email_taken` (`typeorm-user.repository.ts`, matched on Postgres's `Key (email)` detail, so the single-admin index is not mislabelled). Tests in `user-repository.test.ts` plus a PostgreSQL case.
- [x] Audit L2: `VerificationSweeper` deletes sign-up and reset tickets a day past expiry, hourly. Invitations are kept, since the admin can still resend expired ones. Tests in `verification-sweeper.test.ts` plus a PostgreSQL case.
- [x] Mailer: a failed send logs a masked address (`n***@truong.vn`), with a test in `mail-transports.test.ts`. Production refuses to start without `SMTP_HOST`, so `ConsoleMailTransport` (which logs OTP text) cannot run there; tested in `environment.test.ts`. `.env.example` and README updated.
- [x] Review nits:
  - N1: `adminPasswordProblem` moved to `identity/domain/admin-password.ts`; application code no longer imports `config/`.
  - N2: the decoy hash is made at start-up, with a test.
  - N3: forgot password now does the same lookup and save on both paths.
  - N4: see above.
- [ ] PostgreSQL cases for `saveReissued`, `deleteExpired` and the email unique violation are written but have not run here (running against the local database was not permitted in the session). Run: `TEST_DATABASE_URL=postgres://oj:oj@localhost:5432/online_judge pnpm --filter @oj/backend test`.
- [x] security-verifier run on this diff (2026-11-07). Results are in `docs/security/audit-2026-11-07.md`, "Re-verification of the OJ-1 changes".
- [x] R2-F1 (Medium): approved and fixed 2026-11-07. `RedisRateLimiter` (`shared/infrastructure/redis-rate-limiter.ts`) is a Lua sliding window per key with its own expiry and no eviction to make room; it is wired as the app's `RateLimiter`. The in-memory limiter is for tests only. Tests:
  - the limiter contract, run against both implementations (`test/support/rate-limiter-contract.ts`);
  - a 60,000-key flood that must not wipe a live counter (`redis.integration.test.ts`, which needs `TEST_REDIS_URL`);
  - a wiring test (`wiring.test.ts`).
- [x] R2-F2 (Medium): approved and fixed.
  - `LOGIN_PER_ACCOUNT` raised to 100 per hour, more than one IP's 60, so one address cannot fill it. A test with the old cap of 50 fails.
  - Exemptions are behind a `RecentSignIns` port, kept in Redis (`RedisRecentSignIns`) with a 30-day expiry, so they survive restarts and cannot be evicted.
  - `resetPassword` records the caller's address as known. A test removing that fails.
- [x] R2-F3 (Medium): approved and fixed.
  - Sign-up and reset emails carry a link `FRONTEND_URL/<page>?v=<id>#t=<token>`. The token is 32 random bytes, stored hashed with the existing scrypt hasher in a new nullable `verifications.linkHash` column.
  - `OneTimeCodes.checkLink` completes the ticket without spending attempts, so a code used up by someone else does not lock the owner out. Tests: the owner resets via the link after an attacker spent all 5 attempts; old, wrong and reused links are refused; real and unknown addresses answer alike.
  - Contracts: `VerifyCodeRequest` and `ResetPasswordRequest` take `code` or `token`.
  - Frontend: `/register` and `/forgot-password` read the link with `useEmailLink` (the token is in the URL fragment and is removed from the address bar once read). Sign-up from a link needs a click, so mail scanners cannot complete it.
- [x] Re-verified by the security-verifier on 2026-11-07: R2-F1, R2-F2 and R2-F3 Fixed. Details in `docs/security/audit-2026-11-07.md`, "Re-verification of the R2-F1 to R2-F3 fixes".
- [x] R3-N1 (Medium, introduced by R2-F3): approved and fixed 2026-11-07. Sign-up is code-only: no link in the email, no link secret stored, and the contract and DTO accept only `code`. Regression test in `account-security.test.ts` (fails on the previous build); confirmed live.
- [x] R3-N2 (Medium, pre-existing): approved and fixed 2026-11-07. Password reset is link-only: the email has no code, `ResetPasswordRequest` takes `token`, and a typed code is refused. Wrong links spend nothing. The `/forgot-password` page now says "check your email" and the link opens the new-password form. Regression test in `account-security.test.ts`; confirmed live.
- [x] R3-N3 (both `code` and `token` skip validation) is gone: each endpoint now takes exactly one kind of proof. R3-N4 fixed: `checkLink` refuses closed tickets before hashing.
- [x] Re-verified by the security-verifier on 2026-11-07: R3-N1 and R3-N2 Fixed, no regression in R2-F1 and R2-F2 (`docs/security/audit-2026-11-07.md`).
- [x] R4-N1 (Low): approved and fixed 2026-11-07. A per-address budget of 20 wrong sign-up codes per 24 hours (`SIGNUP_CODES`, in Redis) survives resends and new sign-ups. It is counted before the code is compared; a right code or a spent ticket gives it back. Accepted trade-off: someone who started a sign-up with a not-yet-registered address can block sign-up for that address for a day. Tests in `account-security.test.ts`, two new (they fail on the previous build). Live: 20 wrong codes over 3 real resends, then even the right code got 429, while another address signed up normally.
- [x] R4-N3 (Low): approved and fixed. The invitation link is `FRONTEND_URL/invite?id=<id>#c=<code>`. The invite page reads `#c=`, or `?code=` from invitations sent before the change, and removes it from the address bar. Test in `account-security.test.ts`. Checked in the browser for both link forms: the address bar is left with only `?id=`. Not checked: pre-filling the code on a real invitation (needs the admin login).
- [x] Remaining Lows, 2026-11-07. Fixed, each with a test that fails on the previous build:
  - R2-F4: SMTP error text has any echoed address masked (`maskEmailsIn`).
  - R2-F5: the administrator email is masked in the creation log.
  - R2-F6: a failed start-up decoy hash is retried, so unknown addresses still get 401.
  - R2-F7 / R3-N6: `TRUST_PROXY=true` is refused in production, and any non-IP client address becomes one shared `unknown` key.
  - R2-F9: the sweeper also runs at start-up.
  - R3-N5: a password reset forgets every earlier exemption (`RecentSignIns.forget`; Redis now keeps one hash per account). Live: 5/5.
- [x] Accepted, with reasons:
  - R4-N2 / R3-N8 (reissues make the reset link stale): the attacker must email the victim every minute from two IPs, indefinitely, and the owner's usual addresses stay exempt from the login cap. A proper fix needs several live links per ticket (a schema change); revisit if it is seen in practice.
  - R2-F8 (two live tickets from parallel first requests): already capped at 2 per mailbox per minute by the guard.
  - R3-N7 (windows use the backend clock, not Redis `TIME`): one backend instance today. Switch to Redis `TIME` before running several instances.
- [x] Production Redis must run with `maxmemory-policy noeviction`: documented in the README deployment section, together with the manual `linkHash` column.
- [ ] Production Redis must run with `maxmemory-policy noeviction`. Document it in the README deployment section.
- [ ] Schema: `verifications.linkHash` is a new nullable column. `DB_SYNC` adds it; without sync run `ALTER TABLE verifications ADD COLUMN "linkHash" varchar(255);`, and add it to the OJ-5 baseline.
- [x] Live API runs on 2026-11-07, both against a fresh build on :4100 using the dev PostgreSQL and Redis. Second run, after R3-N1 and R3-N2: 16/16 passed (sign-up email has no link and a token is refused; reset email has no code and a typed code is refused; after 6 wrong links the real link resets, once). First run: 14/14 passed, against a fresh build on :4100 using the dev PostgreSQL and Redis:
  - limiter counters land in Redis with their own expiry;
  - a sign-up completes via the emailed link, while a wrong or reused link is refused;
  - after 5 wrong guesses the typed code is dead (the control), but the emailed link still resets the password;
  - the new password signs in and the old one does not;
  - the reset address is stored in Redis with a 30-day expiry;
  - unknown addresses are counted account-wide in Redis.

  Test account left in the dev database: `live-verify-fwokvdpb@truong.test`. Not covered live:
  - the browser pages, because the dev frontend still talks to the old backend on :4000;
  - the multi-IP cap (one client address only).
- [ ] Redis and PostgreSQL integration suites written but not run in this session: `TEST_REDIS_URL=redis://localhost:6379 TEST_DATABASE_URL=postgres://oj:oj@localhost:5432/online_judge pnpm --filter @oj/backend test`.
- [ ] R2-F4 to R2-F9 (Low): SMTP error text, admin email log, decoy-hash failure, `TRUST_PROXY=true` in production, parallel first tickets, sweep at start-up.
- [ ] Second human reviewer (Cuong Le).
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` pass (2026-11-07, latest after the remaining Lows: backend 177/177, engine 147/147, all four packages typecheck; the PostgreSQL and Redis suites skipped without their URLs).

## Contexts and contracts

Contexts: identity and shared, plus one decorator in the classroom presentation layer. No dependency direction change. No `@oj/contracts` change; the error codes `rate.limited` and `identity.too_many_attempts` are new.

## Security

This spec is the security change. The limiter is in process memory, so limits reset on restart and do not hold across two instances. Accepted for one instance; revisit before scaling out.

## Tests

`rate-limit.test.ts`, `public-routes.test.ts`, `one-time-codes.test.ts`, `account-security.test.ts`, `environment.test.ts`, `identity.test.ts`.

## Rollout and risks

Set `TRUST_PROXY` correctly behind the production proxy. Otherwise every student shares the proxy's IP and a whole class hits the per-IP limit. Watch 429 counts in the first exam session.
