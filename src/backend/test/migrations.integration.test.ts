import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { DataSource, type DataSourceOptions, type MigrationInterface } from 'typeorm';
import { DatabasePreparationError, MIGRATION_LOCK, openDatabase, prepareDatabase, retryDatabaseError } from '../src/database.js';
import { Baseline1793923200000 } from '../src/migrations/1793923200000-baseline.js';
import { NormalizeTopics1794528060000 } from '../src/migrations/1794528060000-normalize-topics.js';
import { Oj1ToOj241794528000000 } from '../src/migrations/1794528000000-oj1-to-oj24.js';
import { MIGRATIONS } from '../src/migrations/index.js';
import { ALL_ENTITIES, migratedOptions } from './support/migrated-schema.js';
import { throwaway } from './support/throwaway.js';

/**
 * The migrations (OJ-5) on the three kinds of database a deploy meets: empty, an old `master` one with data, and one
 * that `DB_SYNC` already built. Also the guard that keeps them honest: after the migrations, the entities and the
 * database must not differ, so an entity change without a migration fails here (and in CI).
 *   pnpm infra:test:up   then   pnpm test:integration
 */
const { url, skip } = throwaway('TEST_DATABASE_URL');

const P = '11111111-1111-4111-8111-111111111111';
const SID = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333';

describe('migrations', { skip }, () => {
  let admin: DataSource;
  const schemas: string[] = [];

  before(async () => {
    admin = new DataSource({ type: 'postgres', url });
    await admin.initialize();
  });

  after(async () => {
    for (const s of schemas) await admin?.query(`DROP SCHEMA IF EXISTS "${s}" CASCADE`);
    await admin?.destroy();
  });

  const newSchema = async () => {
    const schema = `oj_mig_${randomBytes(4).toString('hex')}`;
    schemas.push(schema);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    return schema;
  };
  const open = async (options: DataSourceOptions) => new DataSource(options).initialize();
  /** What TypeORM would still change to match the entities: must be nothing. */
  const drift = async (ds: DataSource) => (await ds.driver.createSchemaBuilder().log()).upQueries.map((q) => q.query);
  const applied = async (ds: DataSource) =>
    ((await ds.query('SELECT name FROM migrations ORDER BY id')) as { name: string }[]).map((r) => r.name);
  const ALL = MIGRATIONS.map((m) => new m().name);

  test('an empty database gets the whole schema, and the entities match it exactly (drift guard)', async () => {
    const ds = await open(migratedOptions(url!, await newSchema(), ALL_ENTITIES));
    try {
      assert.deepEqual(await applied(ds), ALL);
      assert.deepEqual(await drift(ds), [], 'an entity changed without a migration: run migration:generate');
      assert.deepEqual(await ds.runMigrations(), [], 'running again does nothing');
    } finally {
      await ds.destroy();
    }
  });

  test('an old master database is upgraded and its topics normalised, without losing data', async () => {
    const schema = await newSchema();
    const old = await open({ ...migratedOptions(url!, schema, []), migrations: [Baseline1793923200000] });
    await old.query(
      `INSERT INTO problems (id, seq, "ownerId", "ownerName", title, difficulty, tags, statement, "inputFormat", "outputFormat", constraints, "timeLimitMs", "memoryLimitMb")
       VALUES ($1, 1, $2, 'GV', 'Dãy con', 'MEDIUM', ARRAY['Quy hoạch động','qhđ'], 's', 'i', 'o', 'c', 1000, 256)`,
      [P, OWNER],
    );
    await old.query(
      `INSERT INTO sessions (id, title, type, settings, "createdById", "createdByName", problems, "createdAt")
       VALUES ($1, 'Luyện DP', 'PRACTICE', '{}', $2, 'GV', $3, now())`,
      [SID, OWNER, JSON.stringify([{ key: 'A', sourceProblemId: P, title: 'Dãy con', points: 100 }])],
    );
    await old.query(`INSERT INTO learning_sessions ("sessionId", title, type, problems) VALUES ($1, 'Luyện DP', 'PRACTICE', $2)`, [
      SID,
      JSON.stringify([{ key: 'A', title: 'Dãy con', points: 100 }]),
    ]);
    await old.destroy();

    const ds = await open(migratedOptions(url!, schema, ALL_ENTITIES));
    try {
      assert.deepEqual(await applied(ds), ALL);
      assert.deepEqual(await drift(ds), []);
      assert.deepEqual((await ds.query('SELECT tags FROM problems'))[0].tags, ['dp']);
      assert.deepEqual((await ds.query(`SELECT problems->0->'tags' AS t FROM sessions`))[0].t, ['dp']);
      assert.deepEqual((await ds.query(`SELECT problems->0->'tags' AS t FROM learning_sessions`))[0].t, ['dp']);
      assert.equal((await ds.query('SELECT count(*)::int AS n FROM learning_paths'))[0].n, 0, 'new tables exist');
    } finally {
      await ds.destroy();
    }
  });

  test('a database DB_SYNC built before migrations existed is only recorded as migrated; its rows stay', async () => {
    const schema = await newSchema();
    // What DB_SYNC made of the OJ-24 entities (no drift then: see the first test), without a migrations table.
    const synced = await open({ ...migratedOptions(url!, schema, []), migrations: [Baseline1793923200000, Oj1ToOj241794528000000] });
    await synced.query('DROP TABLE migrations');
    await synced.query(
      `INSERT INTO problems (id, seq, "ownerId", "ownerName", title, difficulty, tags, statement, "inputFormat", "outputFormat", constraints, "timeLimitMs", "memoryLimitMb")
       VALUES ($1, 1, $2, 'GV', 'Dãy con', 'MEDIUM', ARRAY['dp'], 's', 'i', 'o', 'c', 1000, 256)`,
      [P, OWNER],
    );
    await synced.destroy();

    const ds = await open(migratedOptions(url!, schema, ALL_ENTITIES));
    try {
      assert.deepEqual(await applied(ds), ALL);
      assert.deepEqual(await drift(ds), []);
      assert.equal((await ds.query('SELECT title FROM problems'))[0].title, 'Dãy con');
    } finally {
      await ds.destroy();
    }
  });

  test('migration:revert undoes the last migrations, and running them again restores the schema', async () => {
    const ds = await open(migratedOptions(url!, await newSchema(), ALL_ENTITIES));
    try {
      await ds.undoLastMigration(); // first reviews (OJ-26)
      await ds.undoLastMigration(); // topics: data only, nothing to undo
      await ds.undoLastMigration(); // OJ-1 to OJ-24
      assert.deepEqual(await applied(ds), [ALL[0]]);
      const table = async (name: string) => (await ds.query('SELECT to_regclass($1) AS t', [name]))[0].t;
      assert.equal(await table('learning_paths'), null);
      assert.equal(await table('ai_usage'), null);
      assert.equal(await table('integrity_first_reviews'), null);
      const column = await ds.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'problems' AND column_name = 'sharedOrganizationIds'`,
      );
      assert.equal(column.length, 0);
      await ds.runMigrations({ transaction: 'all' });
      assert.deepEqual(await applied(ds), ALL);
      assert.deepEqual(await drift(ds), []);
    } finally {
      await ds.destroy();
    }
  });

  test('OJ-26: two backends starting together both come up, and each migration runs once (advisory lock)', async () => {
    const schema = await newSchema();
    const options = { ...migratedOptions(url!, schema, ALL_ENTITIES), migrationsRun: false };
    const [a, b] = await Promise.all([open(options), open(options)]);
    try {
      await Promise.all([prepareDatabase(a), prepareDatabase(b)]);
      assert.deepEqual(await applied(a), ALL, 'each migration recorded exactly once');
      assert.deepEqual(await drift(a), []);
    } finally {
      await Promise.all([a.destroy(), b.destroy()]);
    }
  });

  test('OJ-26: first-solution reviews move to their own table; the old hashed AI_FIRST rows are removed', async () => {
    const schema = await newSchema();
    const old = await open({
      ...migratedOptions(url!, schema, []),
      migrations: [Baseline1793923200000, Oj1ToOj241794528000000, NormalizeTopics1794528060000],
    });
    await old.query(
      `INSERT INTO integrity_checks ("submissionId", kind, "checkedAt") VALUES ($1, 'AI_FIRST', now()), ($2, 'PLAGIARISM', now())`,
      ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'],
    );
    await old.destroy();

    const ds = await open(migratedOptions(url!, schema, ALL_ENTITIES));
    try {
      assert.deepEqual(await applied(ds), ALL);
      const kinds = (await ds.query('SELECT kind FROM integrity_checks')) as { kind: string }[];
      assert.deepEqual(kinds.map((k) => k.kind), ['PLAGIARISM'], 'only the hashed first-review rows go');
      assert.equal((await ds.query('SELECT count(*)::int AS n FROM integrity_first_reviews'))[0].n, 0);
    } finally {
      await ds.destroy();
    }
  });

  // ------------------------------------------------------------ OJ-28: startup as the API runs it (openDatabase)

  const connectionsNamed = async (name: string) =>
    ((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1', [name])) as { n: number }[])[0].n;
  const lockIsFree = async () => {
    const [{ ok }] = (await admin.query('SELECT pg_try_advisory_lock($1) AS ok', [MIGRATION_LOCK])) as { ok: boolean }[];
    if (ok) await admin.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    return ok;
  };

  test('R13: with DB_SYNC the migrations run first, then sync; the result has no drift', async () => {
    const ds = await openDatabase({ ...migratedOptions(url!, await newSchema(), ALL_ENTITIES), synchronize: true });
    try {
      assert.deepEqual(await applied(ds), ALL);
      assert.deepEqual(await drift(ds), []);
    } finally {
      await ds.destroy();
    }
  });

  test('R1: a failing migration stops startup at once, frees the lock and closes every connection; it is not retried', async () => {
    class Broken1799999999999 implements MigrationInterface {
      name = 'Broken1799999999999';
      async up(q: { query: (sql: string) => Promise<unknown> }) {
        await q.query('CREATE TABLE broken_half_done (id int)');
        await q.query('SELECT definitely_not_a_function()');
      }
      async down() {}
    }
    const schema = await newSchema();
    const name = `oj28-${schema}`;
    const options = { ...migratedOptions(url!, schema, ALL_ENTITIES, { application_name: name }), migrations: [...MIGRATIONS, Broken1799999999999] };
    const failure = await openDatabase(options).then(() => null, (e: unknown) => e);
    assert.ok(failure instanceof DatabasePreparationError, String(failure));
    assert.match((failure as Error).message, /definitely_not_a_function/);
    assert.equal(retryDatabaseError(failure), false, 'Nest must not retry it');
    assert.equal(retryDatabaseError(new Error('connect ECONNREFUSED')), true, 'a database not up yet is still retried');
    assert.equal(await connectionsNamed(name), 0, 'the pool was closed');
    assert.equal(await lockIsFree(), true, 'the lock was released');
    // One transaction: nothing of the failed run stayed. (TypeORM creates its own bookkeeping table before the
    // transaction starts, so that table may exist, but it records nothing.)
    assert.equal((await admin.query(`SELECT to_regclass('"${schema}".broken_half_done') AS t`))[0].t, null);
    assert.equal((await admin.query(`SELECT to_regclass('"${schema}".problems') AS t`))[0].t, null, 'not even the baseline');
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "${schema}".migrations`))[0].n, 0);
  });

  test('R9: startup waits for another holder of the lock, then gives up with a clear error', async () => {
    const holder = admin.createQueryRunner();
    await holder.connect();
    await holder.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    try {
      const started = Date.now();
      const failure = await openDatabase(migratedOptions(url!, await newSchema(), ALL_ENTITIES), { lockWaitMs: 1500 }).then(() => null, (e: unknown) => e);
      assert.ok(failure instanceof DatabasePreparationError);
      assert.match((failure as Error).message, /migration lock/);
      assert.ok(Date.now() - started >= 1400, 'it waited before giving up');
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
      await holder.release();
    }
  });

  test('R10: the baseline cannot be reverted, so one revert too many cannot drop every table', async () => {
    const ds = await open({ ...migratedOptions(url!, await newSchema(), ALL_ENTITIES), migrations: [Baseline1793923200000] });
    try {
      await assert.rejects(ds.undoLastMigration(), /cannot be reverted/);
      assert.notEqual((await ds.query(`SELECT to_regclass('problems') AS t`))[0].t, null, 'the tables are still there');
      assert.deepEqual(await applied(ds), [ALL[0]]);
    } finally {
      await ds.destroy();
    }
  });

  test('R5: prepareDatabase from two places at once (a backend and migration:run) applies each migration once', async () => {
    const schema = await newSchema();
    const options = { ...migratedOptions(url!, schema, ALL_ENTITIES), migrationsRun: false };
    const [a, b] = await Promise.all([open(options), open(options)]);
    try {
      await Promise.all([prepareDatabase(a), prepareDatabase(b), prepareDatabase(a)]);
      assert.deepEqual(await applied(a), ALL);
    } finally {
      await Promise.all([a.destroy(), b.destroy()]);
    }
  });
});
