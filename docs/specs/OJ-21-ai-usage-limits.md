# OJ-21: AI usage limits and free monthly allowances

Status: done (approved by the user 2026-11-13: "Approve, start")
Owner: Htet Oo Naing
Risky area: yes. AI calls cost money, the limits are enforced on the server, and it touches identity (who may use AI)
and every Claude adapter's caller.

## Outcome

Today an AI feature is either fully locked (non-VIP teachers) or unlimited (VIP teachers, teachers of organizations with
AI included, admins). There is **no usage count and no rate limit** on any AI call.

After this change:
- **Every AI call counts** against a per-user, per-feature monthly allowance, and has a short per-minute rate limit.
- **Free teachers can try the AI features** within a small monthly allowance, instead of being refused. Once it is used
  up, they are told how many uses they had, when it resets, and that VIP gives more.
- **VIP teachers and organizations with AI included** get a generous allowance (fair use, not unlimited). Admins are
  not limited.
- **Teachers see what is left** next to each AI button ("Còn 3/5 lượt tháng này", 3 of 5 uses left this month).

This is the first step of the new strategy: let teachers try AI, then upgrade. Title rewrites and image import are
separate specs that will use these limits.

## Decisions

- **Monthly allowances, reset on the 1st of each month** (Vietnam time, Asia/Ho_Chi_Minh), not lifetime ones. A
  lifetime "5 uses" is gone in the first session and never brings the teacher back.
- **A use is one successful request**, not one generated item:
  - one test-case generation, whatever the number of tests (still at most 10 per request);
  - one section rewrite;
  - one document or pasted text read by AI.
- **A request that fails gives the use back** (no key, timeout, invalid AI output). The use is reserved first and
  refunded on failure, so parallel requests can never exceed the allowance.
- **Allowances are per account.** Teachers join only by invitation (students self-register but use no AI features), so
  free allowances cannot be multiplied by creating accounts. Organization pools are a later spec.
- **The numbers are settings,** read from `.env` with the defaults below, so they can change without a release.

| Feature (`AiFeature`) | What counts | Free teacher / month | VIP or organization AI / month | Admin |
|---|---|---|---|---|
| `IMPORT` | A document or pasted text read by AI (`/imports/parse`, `/imports/parse-text`) | 3 | 100 | no limit |
| `SECTION` | A section rewrite (`/problems/suggest-section`) | 20 | 500 | no limit |
| `TESTS` | A test-case generation request (draft or saved problem), up to 10 tests | 3 | 100 | no limit |
| `AI_USAGE_CHECK` | An AI-usage review of one student submission, counted for the session's teacher | 0 (stays VIP or organization only) | 2000 | no limit |

**Rate limit:** at most 10 AI requests per minute per user across all features, for everyone except admins, using the
existing Redis `RateLimiter`. It stops runaway scripts and double-click storms, and it is separate from the monthly
allowance.

**When the allowance is used up:**
- **Import:** falls back to the rule-based reader, as for free users today, with a note that this month's AI readings
  are used up. An import is never refused.
- **Section rewrite and tests:** refused with 429 `ai.quota_exceeded`. The details give the feature, the limit and the
  reset date. The rule-based "convert file I/O to standard I/O" rewrite stays free and does not count.
- **AI-usage check:** skipped for that submission. It is logged, and the session's integrity page shows "AI checks
  paused: monthly limit reached".

## Scope

In:
- **Identity:** a single place that decides a user's AI plan: `NONE` (students), `FREE` (teacher without VIP or
  organization AI), `PLUS` (VIP or active organization with AI), or `UNLIMITED` (admin). It replaces the yes/no
  `AiAccess.allows`.
- **Shared (`shared/application/ai-quota.ts`), the `AiQuota` port:**
  - `reserve(userId, feature)` returns a ticket, or throws `ai.quota_exceeded` / `rate.limited`;
  - `refund(ticket)`;
  - `usage(userId)` returns the allowances and what is used.

  The Postgres implementation is a table `ai_usage(user_id, feature, period 'YYYY-MM', used)`. `reserve` is one atomic
  statement (`INSERT … ON CONFLICT DO UPDATE SET used = used + 1 WHERE used < limit RETURNING used`), so concurrent
  requests can never go over.
- **Callers:**
  - catalog: section rewrite and both test-suggestion paths;
  - importing: AI reader with a fallback;
  - integrity: the AI-usage check, counted for the session owner.

  Each reserves before the Claude call and refunds on failure. Free teachers are no longer refused with
  `ai.vip_required` for `IMPORT`, `SECTION` and `TESTS`.
- **API:**
  - `GET /ai/usage` (`@Roles('ADMIN', 'TEACHER')`) returns `AiUsageDto`: plan, period, reset date, and per feature
    the limit (null = no limit) and the uses so far;
  - `UserDto.aiPlan` replaces the frontend's yes/no `canUseAi` decision;
  - a new error code `ai.quota_exceeded` (429).
- **Contracts:** `AiFeature`, `AiPlan`, `AiUsageDto`; `aiPlan` on `UserDto`; the import result carries
  `aiQuotaExhausted?: true`.
- **Frontend:**
  - AI buttons show what is left ("Còn 2/3 lượt tháng này") and are enabled for free teachers.
  - At the limit, the button explains the reset date and that VIP gives more.
  - Import shows the "basic reader this month" note.
  - A "Lượt dùng AI" (AI usage) card on the teacher's account menu or settings page.
  - vi and en strings.
- **Admin:** the user list shows each teacher's AI plan; per-user usage is visible through `GET /ai/usage?userId=`
  (admin only).
- **Docs:** `docs/API.md`, README (VIP and plans), `.env.example` (the limit variables, no secrets).

Out:
- Payments, invoices, buying extra uses (the app has no billing).
- Organization-wide pooled allowances (organizations get `PLUS` per teacher for now).
- Title rewrites and image import (next specs, which add new `AiFeature`s).
- Changing models or prompts.

## Done when

- [x] A free teacher can generate tests 3 times in a month. The 4th request gets 429 `ai.quota_exceeded` with the reset
      date, and the button shows "0/3" and why.
- [x] 20 parallel requests by one user against an allowance of 3 succeed exactly 3 times (Postgres integration test).
- [x] A failed AI call (no key, invalid output) does not use up an allowance.
- [x] A free teacher's import uses AI 3 times, then falls back to the basic reader with a note; it is never refused.
- [x] VIP and organization teachers have the `PLUS` limits; admins are never limited; students have no AI.
- [x] The 11th AI request within a minute is refused with 429 and `Retry-After`.
- [x] The AI-usage check stops at the owner's monthly limit; the integrity page says so; nothing crashes.
- [x] Allowances reset on the 1st (Vietnam time). This is tested with a fixed clock across the month boundary.
- [x] Without `ANTHROPIC_API_KEY`, nothing counts and features behave as today (off, or the rule-based fallback).
- [x] `docs/API.md`, README and `.env.example` are updated, and `pnpm build:shared && pnpm typecheck && pnpm test`
      passes.

## Contexts and contracts

- **Shared:** the `AiQuota` port and the `AiPlan` resolution interface.
- **Identity:** resolves the plan (it already knows VIP and organization AI). Nothing in identity depends on the
  contexts below.
- **Catalog, importing, integrity:** call `AiQuota` through the shared port, as they call `AiAccess` today. No
  cross-context dependency is added.
- **Database:**
  - a new table `ai_usage` (created by `DB_SYNC` in development; a migration with the first production deploy);
  - nothing else changes.

## AI

No new prompt or model. Models stay as they are (`CLAUDE_MODEL`, `CLAUDE_TESTGEN_MODEL`, `CLAUDE_REVIEW_MODEL`).

**Cost per month, at the defaults,** for one active free teacher:
- 3 imports;
- 20 rewrites;
- 3 test generations (the most expensive: long output plus code execution).

That is roughly the cost of a few VIP sessions today. Without a key, every feature keeps working as now and nothing is
counted.

## Security

- Limits are enforced on the server. The frontend only displays them.
- `reserve` is atomic in the database.
- The per-minute rate limit is in Redis and fails closed: if Redis is down, AI requests are refused.
- `GET /ai/usage` returns the caller's own usage. Only admins may pass `userId`.
- `@Roles` is on every new route. No usage data goes outside the system.

## Tests

- `backend/test/ai-quota.test.ts`:
  - plan resolution (student, free, VIP, organization with AI, expired organization, admin);
  - reserve and refund;
  - the limit reached;
  - the month boundary with a fixed clock;
  - each caller refunds on AI failure;
  - import falls back at the limit;
  - the AI-usage check is skipped at the limit;
  - no key, nothing counted.
- `backend/test/*.integration.test.ts`: 20 parallel reserves against a limit of 3 give exactly 3, and different
  features and users are independent.
- `backend/test/public-routes.test.ts`: the new route carries `@Roles`.
- `frontend/test`: the "uses left" label and the limit message by locale; the i18n coverage.

## Rollout and risks

- **Deploy order:**
  - create `ai_usage` (migration);
  - set the `AI_LIMIT_*` variables, or keep the defaults;
  - deploy the backend, then the frontend.
- **Existing VIP users:** they move from unlimited to the `PLUS` caps. Tell them before the deploy; the caps are set
  high enough that normal classroom use never reaches them.
- **Risk: costs from free use.** The caps and the rate limit bound it. Watch total `ai_usage` per month after the
  deploy and adjust the defaults.
- **Rollback:** setting the free limits to 0 restores the old behaviour, VIP-only plus the rule-based fallbacks,
  without a release.

## Results and notes (2026-11-13)

- **Live, on the test system:**
  - The AI key was a placeholder pointed at a closed local port, so every AI call failed on this machine and nothing
    left it. That exercised counting, refunds and the limit screens without a real key.
  - Plans: gv.lan and gv.minh are PLUS, gv.hoa (expired organization) is FREE, hs01 is NONE, the admin is UNLIMITED.
  - Failed AI calls (tests, import) gave their uses back: still 0 after them.
  - At the limit:
    - test suggestions answered 429 `ai.quota_exceeded`, with `{feature, limit, resetsAt}` and `Retry-After`, and the
      message "Bạn đã dùng hết 3 lượt gợi ý test bằng AI của tháng này. Lượt mới có từ ngày 01/12/2026…" (you have used
      all 3 test-suggestion uses this month; new uses from 1/12/2026);
    - the import read with the basic reader, marked `aiQuotaExhausted`.
  - A student's usage request gave 403. A teacher asking for another account got `ai.usage_forbidden`; the admin may.
  - Screens:
    - the teacher home card "Lượt dùng AI tháng này" (3/3, 17/20, 3/3, reset date);
    - "Còn 3/20 lượt tháng này" (3 of 20 left this month) on the whole-problem rewrite switch;
    - the AI test button disabled, with the reset date and the VIP hint;
    - the import page's calm note and "read by template" result.
- **Postgres:** 20 parallel reserves against 3 succeed exactly 3 times (non-default schema, real connection pool), and
  the once-per-student AI review claim holds under 10 parallel claims.
- **Found and fixed while building:**
  - **Empty setting meant every request refused:** an empty `AI_RATE_PER_MINUTE=` (as in `.env.example`) would have
    been read as 0. Empty now means the default; this has a regression test.
  - **Unqualified table names:** the raw SQL named its tables without the schema, so a non-default schema failed. This
    covered the new `ai_usage` table and the existing `integrity_checks` (`markChecked`, a latent bug). Both use the
    configured schema now.
  - **The rewrite count repeated on every section:** it is now shown once, on the whole-problem switch, and on a
    section only when the uses are gone.
  - **Import messages:** at the limit the note was red and the button still said "Tái cấu trúc bằng AI" (restructure
    with AI). The note is now neutral, and the button says "Tách đề theo mẫu" (split with the template).
  - **The usage was cached after a failed request:** the shared "uses left" store kept a failed request (a token
    rejected after a backend restart). After signing in again as the same account, the page kept showing AI as
    available. The store now never keeps a failure and is tied to the sign-in token. Checked live.
- **Security-verifier: nothing blocking.** Fixed:
  - **A:** a student could spend the teacher's AI-check allowance by resubmitting. Only a student's first accepted
    solution per problem is reviewed now.
  - **B:** with Redis down, import and the free file-I/O fix failed with 500. They now fall back, while AI stays off.
  - **C:** a rejudge took a use before the check for "already reviewed". The check now comes first.
  - **Nits:**
    - a failure after Claude answered no longer refunds;
    - the empty-document message says when to retry;
    - "paused" and "no allowance" are logged once per month;
    - the paused note says it covers the viewer's own sessions;
    - env numbers must be plain whole numbers.
- **Kept, with reasons:**
  - **An admin asking for an unknown user id gets plan NONE with zero usage, not 404.** The plan lookup cannot tell a
    missing account from a student. It is harmless: admin only, and no data is revealed.
  - **The translated English `ai.quota_exceeded` text does not repeat the reset date.** In Vietnamese the server
    message has it, and the usage card shows it in both languages.
- **Note for teachers:** the whole-problem rewrite switch rewrites four sections, so it uses four rewrites. 20 free
  rewrites cover about five whole problems.
- **Not covered:**
  - real Claude calls (no key was used);
  - a production migration for `ai_usage` (it comes with the first production deploy, as planned);
  - the 11th request in a minute, live (it is unit-tested).

## Follow-up (OJ-25)

The administrator, who has no monthly limit, keeps a per-minute ceiling (`AI_ADMIN_RATE_PER_MINUTE`, default 60). The README upgrade
steps say that free teachers now get AI, and which settings turn it off.
