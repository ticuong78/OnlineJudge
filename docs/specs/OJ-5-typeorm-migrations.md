# OJ-5: Replace DB_SYNC with TypeORM migrations

Status: draft
Owner: Htet Oo Naing
Risky area: yes (production data; `.env.example`)

## Outcome

Schema changes reach the database through reviewed, versioned migrations instead of `synchronize`, so a deploy can no longer silently drop or alter a column holding class data. Needed before real classes use the system (week 0, item 3).

## Scope

In: a baseline migration generated from the 17 current entities; `migrations` and `migrationsRun` in the TypeORM config; `DB_SYNC` defaulting to off everywhere; scripts to generate, run and revert migrations; docs.
Out: changing any entity; data backfills; moving to a different ORM.

## Done when

- [ ] `src/backend/src/migrations/<timestamp>-baseline.ts` creates the full current schema on an empty PostgreSQL 16 database.
- [ ] `pnpm --filter @oj/backend migration:run` against an empty database followed by `typeorm schema:log` reports no pending changes.
- [ ] The same baseline, run against a database previously built by `DB_SYNC=true`, is a no-op (marked as applied, nothing altered).
- [ ] `.env.example` has `DB_SYNC=false`; `environment.ts` turns `DB_SYNC=true` in production from a warning into an error.
- [ ] `postgres.integration.test.ts` builds its schema through migrations, not `synchronize`, and passes with `TEST_DATABASE_URL` set.
- [ ] README (setup) and CLAUDE.md (commands) document `migration:generate`, `migration:run`, `migration:revert`.

## Contexts and contracts

No context boundaries change. TypeORM config in `src/backend/src/app.module.ts` (currently `synchronize: DB_SYNC === 'true'`, `autoLoadEntities: true`). A separate `src/backend/src/data-source.ts` is needed for the TypeORM CLI. No `@oj/contracts` change.

Note: entity files are named inconsistently (`orm-entities.ts`, `problem.orm-entities.ts`, `classroom.persistence.ts`, `persistence.ts`, `*.orm-entity.ts`); the data source must glob all of them. Renaming them to the CLAUDE.md convention is a separate chore, not part of this spec.

## Security

`.env.example` changes (risky area). Migrations run with the app's database user; no new credentials. Backups before the first production run.

## Tests

`src/backend/test/postgres.integration.test.ts`: schema from migrations, then the existing cases. `src/backend/test/environment.test.ts`: `DB_SYNC=true` with `NODE_ENV=production` is rejected.

## Rollout and risks

1. Take a backup. 2. Deploy with the baseline marked applied (`migrationsRun` on an already-synced database inserts the row without changes; verify on a copy first). 3. From then on every entity change ships with a generated migration reviewed in the PR. Rollback: `migration:revert`, or restore the backup. Risk: drift between an old synced database and the entities; check with `schema:log` on a copy of production before step 2.
