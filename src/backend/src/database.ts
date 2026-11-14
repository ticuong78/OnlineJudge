import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { MIGRATIONS } from './migrations/index.js';

/**
 * The database settings shared by the API (app.module.ts) and the migration scripts (data-source.ts, migrate.ts).
 * The schema comes from the migrations (OJ-5, ADR 0003), which `prepareDatabase` runs at startup before anything else
 * touches the database. `DB_SYNC=true` is only for a throwaway development database, and is refused in production.
 */
export function databaseOptions(get: (key: string) => string | undefined) {
  const url = get('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL is not set (the backend database).');
  const ca = get('DATABASE_SSL_CA');
  return {
    type: 'postgres',
    url,
    migrations: MIGRATIONS,
    // Run by `prepareDatabase` under a lock, not by TypeORM while connecting.
    migrationsRun: false,
    // Read by `openDatabase`, which syncs only after the migrations.
    synchronize: get('DB_SYNC') === 'true',
    // Hosted Postgres (e.g. Supabase) signs its certificate with its own CA: verify against that file.
    ...(ca ? { ssl: { ca: readFileSync(ca, 'utf8') } } : {}),
  } satisfies DataSourceOptions;
}

/** Any fixed number: the advisory lock that lets one process at a time change the schema (OJ-26). */
export const MIGRATION_LOCK = 7_340_501;
/** How long startup waits for another process that holds the lock (OJ-28). Long migrations can take minutes. */
export const MIGRATION_LOCK_WAIT_MS = 10 * 60_000;

/**
 * The migrations could not be applied, or the lock could not be taken. Not a connection problem, so the API must not
 * retry it: retrying would run a failing migration again and again (OJ-28).
 */
export class DatabasePreparationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DatabasePreparationError';
  }
}

const log = new Logger('Database');

/**
 * Runs `work` while holding the migration lock on a connection of its own. It waits for another holder (a second
 * backend starting, or `migration:run`) up to `waitMs`, then gives up with a clear error instead of hanging. The
 * lock is always released; a failure to release it is logged, never put in place of the work's own error.
 */
export async function withMigrationLock<T>(ds: DataSource, work: () => Promise<T>, waitMs = MIGRATION_LOCK_WAIT_MS): Promise<T> {
  const lock = ds.createQueryRunner();
  await lock.connect();
  try {
    const deadline = Date.now() + waitMs;
    for (let announced = false; ; ) {
      const [{ locked }] = (await lock.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK])) as { locked: boolean }[];
      if (locked) break;
      if (Date.now() >= deadline) {
        throw new DatabasePreparationError(
          `Another process has held the migration lock for over ${Math.round(waitMs / 1000)} s; not starting. ` +
            'Check for a stuck backend or migration:run, or wait for it to finish.',
        );
      }
      if (!announced) log.warn('Another process is migrating the database; waiting for it to finish.');
      announced = true;
      await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
    try {
      return await work();
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch((error: unknown) => {
        // The session ends with the connection, which frees the lock anyway; keep the work's own error visible.
        log.error(`Could not release the migration lock: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  } finally {
    await lock.release();
  }
}

/**
 * Runs the pending migrations, all in one transaction, under the migration lock. A second backend starting at the same
 * time waits, then finds nothing pending. Then, only when `sync` is set (`DB_SYNC=true`, development), alters tables
 * to match the entities. A failure leaves the database as it was.
 */
export async function prepareDatabase(ds: DataSource, { sync = false, lockWaitMs }: { sync?: boolean; lockWaitMs?: number } = {}): Promise<void> {
  await withMigrationLock(ds, () => ds.runMigrations({ transaction: 'all' }), lockWaitMs);
  if (sync) await ds.synchronize();
}

/**
 * Connects and prepares the database for the API (app.module.ts). If preparing fails, the connection pool is closed
 * and a `DatabasePreparationError` is thrown, which the API's connection retry does not repeat (OJ-28).
 */
export async function openDatabase(options: DataSourceOptions, { lockWaitMs }: { lockWaitMs?: number } = {}): Promise<DataSource> {
  const ds = await new DataSource({ ...options, synchronize: false, migrationsRun: false }).initialize();
  try {
    await prepareDatabase(ds, { sync: options.synchronize === true, lockWaitMs });
    return ds;
  } catch (error) {
    await ds.destroy().catch(() => undefined);
    if (error instanceof DatabasePreparationError) throw error;
    throw new DatabasePreparationError(`Database migration failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** For Nest's TypeORM connection retry: retry connection problems, never a failed migration or lock wait. */
export const retryDatabaseError = (error: unknown): boolean => !(error instanceof DatabasePreparationError);
