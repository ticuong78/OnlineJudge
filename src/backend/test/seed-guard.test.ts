import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { effectiveEnv, isLocalUrl, seedRefusal } from '../src/seed-guard.js';

const LOCAL_DB = 'postgres://oj:oj@localhost:5432/online_judge';

/** Fake env files: path -> content; any other path does not exist. */
const files = (contents: Record<string, string>) => (path: string) => {
  const name = Object.keys(contents).find((f) => path === join('/app', f));
  if (name === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  return contents[name];
};

test('seed guard: a local database and Redis may be seeded', () => {
  assert.equal(seedRefusal({ DATABASE_URL: LOCAL_DB }), null);
  assert.equal(seedRefusal({ DATABASE_URL: 'postgres://oj@127.0.0.1/oj', REDIS_URL: 'redis://127.0.0.1:6379' }), null);
  assert.equal(seedRefusal({ DATABASE_URL: 'postgres://oj@[::1]:5432/oj' }), null);
  // Service names of the local docker-compose stack.
  assert.equal(seedRefusal({ DATABASE_URL: 'postgres://oj@postgres:5432/oj', REDIS_URL: 'redis://redis:6379' }), null);
});

test('seed guard: production is refused', () => {
  assert.match(seedRefusal({ NODE_ENV: 'production', DATABASE_URL: LOCAL_DB }) ?? '', /development only/);
});

test('seed guard: a database on another machine is refused', () => {
  for (const url of [
    'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres',
    'postgres://u@localhost.evil.com/oj', // looks local, is not
    'postgres://u@10.0.0.5/oj',
    'not a url',
  ]) {
    assert.match(seedRefusal({ DATABASE_URL: url }) ?? '', /DATABASE_URL/, url);
  }
  assert.match(seedRefusal({}) ?? '', /DATABASE_URL is not set/);
});

test('seed guard: a shared Redis is refused, a missing one defaults to localhost', () => {
  assert.match(seedRefusal({ DATABASE_URL: LOCAL_DB, REDIS_URL: 'rediss://cache.example.com:6380' }) ?? '', /REDIS_URL/);
  assert.equal(seedRefusal({ DATABASE_URL: LOCAL_DB, REDIS_URL: '' }), null);
});

test('seed guard: settings in .env are seen before Nest starts (ConfigModule order)', () => {
  const read = files({
    '.env': 'NODE_ENV=production\nDATABASE_URL=postgres://u@db.example.com/oj\n',
    '.env.local': 'DATABASE_URL=postgres://oj@localhost/oj\nREDIS_URL=redis://cache.example.com\n',
  });
  const env = effectiveEnv('/app', {}, read);
  // The first file wins over later ones, as in ConfigModule.
  assert.equal(env.DATABASE_URL, 'postgres://u@db.example.com/oj');
  assert.equal(env.REDIS_URL, 'redis://cache.example.com');
  assert.match(seedRefusal(env) ?? '', /production/);
});

test('seed guard: variables set in the process win over the files; missing files are fine', () => {
  const read = files({ '.env': 'DATABASE_URL=postgres://u@db.example.com/oj\n' });
  const env = effectiveEnv('/app', { DATABASE_URL: LOCAL_DB }, read);
  assert.equal(env.DATABASE_URL, LOCAL_DB);
  assert.equal(seedRefusal(env), null);
  assert.deepEqual(effectiveEnv('/app', {}, files({})), {});
});

test('seed guard: isLocalUrl only accepts this machine', () => {
  assert.equal(isLocalUrl('redis://localhost:6379'), true);
  assert.equal(isLocalUrl('redis://example.com'), false);
  assert.equal(isLocalUrl(''), false);
});
