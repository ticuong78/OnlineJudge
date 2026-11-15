# OJ-25: Upgrade safety and AI cost limits from the manager review

Status: done (approved by the user 2026-11-13: "Yes, fix them", after the engineering-manager review of OJ-13 to OJ-24)
Owner: Htet Oo Naing
Risky area: yes (database upgrade of a running server, a data backfill, the AI cost limit)

> **Superseded in part by OJ-5 (2026-11-14).** The manual upgrade file `docs/upgrade/2026-11-oj-1-to-oj-24.sql` and the
> `topics:normalize` script were removed. Their SQL and their locked backfill are now the migrations
> `Oj1ToOj241794528000000` and `NormalizeTopics1794528060000`, which the API runs at startup. The AI cost fixes below
> stand as written.

## Outcome

An existing server can be upgraded from `master` to OJ-24 without `DB_SYNC`, without losing topics or a teacher's edit,
and AI spending stays bounded for every account and is never switched on for an operator without a note telling them.
Four findings of the review are closed:
- **No upgrade steps for the new schema:** OJ-1 to OJ-24 add 5 tables and 6 columns. The README named two of them.
- **The backfill ran too late:** the docs said to run `topics:normalize` after deploying. A session saved in between got
  `[]` tags and the backfill skipped it from then on.
- **The backfill could lose a teacher's edit:** it read every session, then wrote whole `problems` columns, with no
  transaction or lock.
- **No AI cost limit for admins,** and free teachers get AI on upgrade without the operator choosing it.

## Scope

In:
- **`docs/upgrade/2026-11-oj-1-to-oj-24.sql`:**
  - generated from the difference between `master`'s TypeORM entities and the current ones;
  - every statement is `IF NOT EXISTS`, and the whole file is one transaction.
- **`topics-normalize.ts`:**
  - one transaction with `SELECT … FOR UPDATE` on problems, sessions and learning-record sessions;
  - `--dry-run` takes the same path, then rolls back;
  - the O(n²) lookup is replaced with a map.
- **`AiQuota`:** administrators keep the per-minute guard, with their own `AI_ADMIN_RATE_PER_MINUTE` (default 60). The
  setting is validated at startup.
- **Docs:**
  - README "Nâng cấp": an ordered procedure (back up, stop the API, SQL, backfill, sandbox image, `.env`, start). It
    includes the note on free-teacher AI, with the settings that turn it off.
  - `docs/API.md`: the backfill order and the admin rate.
  - `.env.example`.

Out:
- Real migrations (OJ-5, ADR 0003).
- Changing the FREE defaults. The user approved freemium in OJ-21, so the upgrade note documents them instead.

## Done when

- [x] On a database built from `master`'s entities, the SQL file runs twice without error. Afterwards TypeORM reports
      no remaining difference from the current entities.
- [x] On that database, a problem tagged "Quy hoạch động" and "qhđ" becomes `dp`. An untagged session and its
      learning-record copy get `dp`. The dry run writes nothing, and a second run changes nothing.
- [x] Concurrency: a teacher transaction adds problem B to the session and holds it for 3 s while the backfill
      starts. The backfill waits, then tags both A and B, so B is not lost.
- [x] Admin: 5 requests a minute pass, the 6th gets `rate.limited`, and the next minute opens again. This test failed
      with the old code. Background AI-usage checks stay exempt.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` passes, and so do the integration suites.

## Tests

- `test/ai-quota.test.ts`:
  - the admin ceiling, with a failing-then-passing check;
  - `AI_ADMIN_RATE_PER_MINUTE` validation and its empty default.
- The upgrade rehearsal is a manual check on throwaway databases, recorded above. The script to repeat it is not checked
  in: it is a stand-in until OJ-5 migrations exist.
