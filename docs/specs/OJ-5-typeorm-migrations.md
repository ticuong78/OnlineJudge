# OJ-5: Replace DB_SYNC with TypeORM migrations

Status: done (approved by the user 2026-11-14: "Approve, build OJ-5", after the plan in the session; the user does not
want a manual SQL upgrade flow)
Owner: Htet Oo Naing
Risky area: yes (production data; `.env.example`)

## Outcome

Schema changes reach the database through reviewed, versioned migrations instead of `synchronize`, so a deploy can no
longer silently drop or alter a column holding class data. An upgrade is "deploy and start the backend": nobody runs SQL
or a script by hand. Needed before real classes use the system (week 0, item 3), and it replaces OJ-25's manual upgrade
file and backfill script.

## Scope

In:
- **Three migrations** in `src/backend/src/migrations`, listed in `migrations/index.ts`:
  - `Baseline1793923200000`: `master`'s schema (17 tables), generated from its entities.
  - `Oj1ToOj241794528000000`: what OJ-1 to OJ-24 added (5 tables, 6 columns, indexes), generated from the difference
    between the two sets of entities.
  - `NormalizeTopics1794528060000`: the OJ-20 topic backfill as a data migration, with the rows locked. It replaces
    `pnpm topics:normalize`.
  - The first two use `IF NOT EXISTS`, so a database that `DB_SYNC` built, fully or in part, is brought up to date
    instead of failing.
- **Startup:** every pending migration runs in one transaction, before `synchronize` and before any module reads the
  database. A failure leaves the database unchanged and stops the API. As built later: `openDatabase` and
  `prepareDatabase` in `src/database.ts` do this under an advisory lock (OJ-26), without retries (OJ-28); TypeORM's
  `migrationsRun` is off.
- **Configuration:**
  - `src/database.ts` holds the options shared by the API and `src/data-source.ts` (the TypeORM command line).
  - `DB_SYNC` defaults to off in `.env.example` and is a startup error in production.
- **Scripts:** `migration:run`, `migration:revert`, `migration:show`, `migration:generate` and `migration:check` (fails on
  drift).
- **Tests:**
  - the integration suites build their schemas through migrations;
  - a new `migrations.integration.test.ts`;
  - the e2e stack runs with `DB_SYNC=false`.
- **Docs:** README ("Nâng cấp", development), CLAUDE.md (commands, architecture rule 10), ADR 0003 accepted,
  `docs/API.md`, the technical overview and the test plan.

Out:
- Renaming entity files to the convention.
- A lock for several API instances migrating at once: one instance runs during an upgrade.
- CI changes: the drift guard runs inside the existing integration step.

## Done when

- [x] On an empty database the migrations build the full schema, and TypeORM then reports no difference from the
      entities (drift guard, `migrations.integration.test.ts`).
- [x] On a database with only `master`'s schema and old data:
  - the migrations add the new tables and columns;
  - tags such as "Quy hoạch động" and "qhđ" become `dp`;
  - untagged sessions and their learning-record copies get their topics;
  - nothing else is lost.
- [x] On a database `DB_SYNC` already built, the migrations change nothing but are recorded as applied, and the rows
      stay.
- [x] `migration:revert` undoes the last two migrations, and running them again restores the schema with no drift.
- [x] `migration:show`, `migration:run` and `migration:check` work against a fresh database from the command line.
- [x] `DB_SYNC=true` with `NODE_ENV=production` is a startup error, and `.env.example` has `DB_SYNC=false`.
- [x] The developer database (already at OJ-24) starts the backend without `DB_SYNC`: the migrations are recorded and
      the data stays.
- [x] `pnpm build:shared && pnpm typecheck && pnpm test` and the integration suites pass.

## Security

- `.env.example` changes (risky area).
- Migrations run with the app's database user; no new credentials.
- Take a backup before the first production run.

## Tests

- `test/migrations.integration.test.ts`: empty database, old database with data, `DB_SYNC`-built database, revert,
  drift.
- `test/postgres.integration.test.ts`, `integrity.integration.test.ts` and `organization.integration.test.ts`: schema
  from the migrations.
- `test/environment.test.ts`: `DB_SYNC=true` refused in production.

## Rollout and risks

1. Back up.
2. Deploy and start one backend; it migrates before it serves.
3. From then on, every entity change ships with a generated migration, reviewed in its PR.

Rollback: `migration:revert`, or restore the backup.

## Results and notes (2026-11-14)

- **The drift guard proved itself on its first run.** The baseline's foreign key on `test_cases` was checked by name
  across all schemas, so it was skipped when another schema had it. The check is now limited to the current schema.
- **The developer database** had been brought to OJ-24 by hand the day before. It needed no changes, only the three
  migrations recorded. See the session's verification.
