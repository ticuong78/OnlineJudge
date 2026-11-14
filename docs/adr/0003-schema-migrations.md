# ADR 0003: Schema changes go through migrations

Date: 2026-11-07
Status: accepted 2026-11-14 (decision owner: Htet Oo Naing; implemented in `docs/specs/OJ-5-typeorm-migrations.md`)

## Context

The schema is created and altered by TypeORM `synchronize`, switched on by `DB_SYNC` (`app.module.ts`; `.env.example` ships `DB_SYNC=true`). In production `environment.ts` only warns about it. `synchronize` compares entities with the live database at startup and alters tables to match. A renamed or removed property drops the column and its data, with no review and no rollback.

## Decision

Use TypeORM migrations, checked into `src/backend/src/migrations/` and starting from a baseline of the schema deployed servers have (`master`). The API runs pending migrations at startup, in one transaction, before it accepts requests. Data fixes for existing rows are migrations too. Turn `synchronize` off in every environment except throwaway local databases, and make `DB_SYNC=true` in production a startup error.

## Consequences

Every entity change ships with a generated migration that is reviewed in the same PR, and a reviewer can see what SQL a deploy will run. One extra command for contributors (`migration:generate`). The first production run needs a backup and a drift check (OJ-5, rollout).

As built (OJ-5): the baseline and the first upgrade are written with `IF NOT EXISTS`, so databases that `DB_SYNC` built earlier, fully or in part, are brought up to date rather than refused. Later migrations are generated as usual. An integration test fails when the entities and the migrations differ. Migrations run under a PostgreSQL advisory lock (OJ-26), shared by every backend instance and by `migration:run` and `migration:revert`. Others wait up to 10 minutes. A failed migration stops startup at once, without retries (OJ-28). The baseline cannot be reverted.
