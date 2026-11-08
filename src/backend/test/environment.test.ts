import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkEnvironment,
  isProduction,
  parseTrustProxy,
  validateEnvironment,
  MIN_JWT_SECRET_LENGTH,
} from '../src/config/environment.js';
import { adminPasswordProblem } from '../src/modules/identity/domain/admin-password.js';

const good = {
  DATABASE_URL: 'postgres://oj:oj@localhost:5432/online_judge',
  ADMIN_EMAIL: 'admin@truong.vn',
  ADMIN_PASSWORD: 'a-long-admin-password',
  JWT_SECRET: 'f3a9c2d7e1b84a6f90d2c5e7a1b3d4f6a8c0e2d4',
  SMTP_HOST: 'smtp.truong.vn',
};

test('a complete, strong configuration passes untouched', () => {
  const r = checkEnvironment({ ...good, NODE_ENV: 'production', CORS_ORIGINS: 'https://oj.truong.vn', FRONTEND_URL: 'https://oj.truong.vn' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.env.JWT_SECRET, good.JWT_SECRET);
});

test('production refuses to start without SMTP, which would write one-time codes to the log', () => {
  const r = checkEnvironment({ ...good, SMTP_HOST: '', NODE_ENV: 'production', CORS_ORIGINS: 'https://oj.truong.vn', FRONTEND_URL: 'https://oj.truong.vn' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /SMTP_HOST is required in production/);
  assert.deepEqual(checkEnvironment({ ...good, SMTP_HOST: '' }).errors, [], 'development may leave it empty');
});

test('production refuses to start without a JWT secret, and says how to make one', () => {
  const r = checkEnvironment({ ...good, JWT_SECRET: '', NODE_ENV: 'production' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /JWT_SECRET is required in production.*openssl rand -hex 32/);
});

test('development without a JWT secret gets a random one for this run, never a known default', () => {
  const a = checkEnvironment({ ...good, JWT_SECRET: undefined });
  const b = checkEnvironment({ ...good, JWT_SECRET: undefined });
  assert.deepEqual(a.errors, []);
  assert.match(String(a.env.JWT_SECRET), /^[0-9a-f]{48}$/);
  assert.notEqual(a.env.JWT_SECRET, b.env.JWT_SECRET);
  assert.match(a.warnings[0], /signed out whenever the server restarts/);
});

test('short and placeholder secrets are refused in every environment', () => {
  const bad = [
    'change-me-to-a-long-random-string', // what .env.example used to ship
    'Change_Me_Please_Change_Me_Please_!!',
    'your-secret-your-secret-your-secret-1',
    'secret-key-secret-key-secret-key-123',
    'x'.repeat(40),
    '0'.repeat(64),
    'too-short',
  ];
  for (const secret of bad) {
    for (const NODE_ENV of ['production', 'development', undefined]) {
      const r = checkEnvironment({ ...good, JWT_SECRET: secret, NODE_ENV });
      assert.equal(r.errors.length, 1, `${secret} / ${NODE_ENV} should be refused`);
    }
  }
  assert.match(checkEnvironment({ ...good, JWT_SECRET: 'too-short' }).errors[0], new RegExp(`at least ${MIN_JWT_SECRET_LENGTH}`));
});

test('required settings are reported together, not one restart at a time', () => {
  const r = checkEnvironment({ NODE_ENV: 'production' });
  assert.equal(r.errors.length, 5);
  assert.throws(() => validateEnvironment({ NODE_ENV: 'production' }), /Invalid configuration:\n  - DATABASE_URL.*\n  - ADMIN_EMAIL.*\n  - ADMIN_PASSWORD.*\n  - JWT_SECRET.*\n  - SMTP_HOST/);
});

test('production warns about settings that only make sense on a developer machine', () => {
  const r = checkEnvironment({ ...good, NODE_ENV: 'production', DB_SYNC: 'true', CORS_ORIGINS: 'http://localhost:3000' });
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 3, r.warnings.join('\n'));
  assert.deepEqual(checkEnvironment({ ...good, DB_SYNC: 'true', CORS_ORIGINS: 'http://localhost:3000' }).warnings, [], 'quiet in development');
});

test('numeric settings must be positive whole numbers', () => {
  const r = checkEnvironment({ ...good, MAX_PENDING_SUBMISSIONS: '0', JUDGE_STALE_AFTER_SECONDS: 'soon', JUDGE_GIVE_UP_AFTER_SECONDS: '600' });
  assert.equal(r.errors.length, 2);
  assert.equal(checkEnvironment({ ...good, MAX_PENDING_SUBMISSIONS: '3' }).errors.length, 0);
});

test('TRUST_PROXY=true is refused in production, where it would let clients choose their IP (R2-F7)', () => {
  const r = checkEnvironment({ ...good, NODE_ENV: 'production', CORS_ORIGINS: 'https://oj.truong.vn', FRONTEND_URL: 'https://oj.truong.vn', TRUST_PROXY: 'true' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /TRUST_PROXY=true/);
  assert.equal(checkEnvironment({ ...good, NODE_ENV: 'production', CORS_ORIGINS: 'https://oj.truong.vn', FRONTEND_URL: 'https://oj.truong.vn', TRUST_PROXY: '1' }).errors.length, 0);
});

test('only TRUST_PROXY=true earns a warning, and it is parsed the way Express wants it', () => {
  assert.equal(checkEnvironment({ ...good, TRUST_PROXY: 'true' }).warnings.length, 1);
  assert.equal(checkEnvironment({ ...good, TRUST_PROXY: '1' }).warnings.length, 0);
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('10.0.0.0/8, loopback'), '10.0.0.0/8, loopback');
});

test('the administrator password must not be a known default, and must be long enough', () => {
  for (const weak of ['admin12345', 'Admin12345', 'password123', '12345678', 'short-pw']) assert.ok(adminPasswordProblem(weak), weak);
  assert.equal(adminPasswordProblem('a-long-admin-password'), null);
  assert.match(adminPasswordProblem('admin12345')!, /well-known default/);
  assert.match(adminPasswordProblem('abc123xyz')!, /shorter than 12/);
});

test('production is only an explicit NODE_ENV=production', () => {
  assert.equal(isProduction({ NODE_ENV: 'production' }), true);
  for (const NODE_ENV of [undefined, 'development', 'test', 'Production']) assert.equal(isProduction({ NODE_ENV }), false);
});
