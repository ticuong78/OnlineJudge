---
name: security-audit
description: Run a lead-and-verifier security audit of OnlineJudge (API, identity, data isolation, judge sandbox, AI adapters, uploads) and record the findings under docs/security.
---

# Security audit

Two roles. You are the lead; the `security-verifier` agent independently re-checks every finding. A finding is reported only with evidence (file and line, or a reproduced request).

## Lead procedure

1. Scope from the code, not from memory: list every route in `src/backend/src/modules/*/presentation/*.controller*.ts` with its `@Roles` (or none), every repository method that loads or lists by id, every Claude adapter, the engine sandbox, the runner Dockerfile, `docker-compose.yml`, `.env.example`, `.github/workflows`.
2. Check each area against the questions below. Record each candidate finding as: id, severity (Critical, High, Medium, Low), area, evidence (path:line), impact, fix, effort.
3. Hand the candidate list to the `security-verifier` agent. Keep only findings it marks Confirmed; findings marked Needs runtime are listed separately as "to verify by running".
4. Write `docs/security/audit-<YYYY-MM-DD>.md` with: scope, method, confirmed findings, unverified items, and the top five fixes in order. Create one spec per Critical or High finding.

## Questions per area

Identity: routes without `@Roles` that should have them; brute-force protection on login, OTP, reset and invitation endpoints; OTP and invitation codes hashed, expiring, attempt-limited; JWT lifetime and revocation; password policy; email enumeration on forgot-password; the single-admin invariant.

Data isolation: every list or load scoped by actor (teacher bank, class membership, session ownership, submission ownership); public sessions exposing only what the README says; sharing levels enforced server-side; archived and purged classes read-only or gone.

Input: body size limits; DTO whitelist on every route; docx and pdf parsing limits (size, pages, zip entries); markdown rendering in the frontend (XSS); file names and paths in the engine.

Judge sandbox: flags present and not bypassable (`--network none`, memory and swap, `--pids-limit`, user 65534, `no-new-privileges`, timeouts, output limits); compile step limits; temp directory cleanup; concurrency and queue limits per user; `SANDBOX=local` unreachable in production.

AI adapters: prompt injection paths from uploads, pasted text and student code; zod validation of outputs; model and cost configuration; VIP gating; personal data sent to the model; error handling when the key is missing or the API fails.

Operations: secrets in git history; `DB_SYNC` in production; CORS origins; default admin credentials; dependency pinning and lockfile; CI gates; Docker images and versions.

## Severity guide

Critical: unauthenticated access to data or code execution outside the sandbox. High: cross-tenant read or write, missing auth on a mutating route, sandbox escape path. Medium: brute-force, enumeration, missing limits with a clear abuse path. Low: hardening gaps with no direct exploit.
