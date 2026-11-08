/**
 * End-to-end test stack: the real compiled backend (src/backend/dist) started as its own process against a fresh
 * database on the throwaway test containers (docker-compose.test.yml). Never the development database or Redis.
 *
 * In development the backend prints every email to its log instead of sending it (no SMTP_HOST). The stack keeps
 * that log and reads the emails out of it, as a person would read their inbox: sign-up codes, invitation links.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKEND = path.join(ROOT, 'src/backend');
// The database drivers come from the backend package (the stack itself adds no dependency).
const backendRequire = createRequire(path.join(BACKEND, 'package.json'));

export const E2E_ADMIN = { email: 'admin@e2e.test', password: 'e2e-admin-password-1' };

export interface StackOptions {
  /** Postgres server of the test stack (a fresh database is created on it). */
  databaseUrl?: string;
  redisUrl?: string;
  port?: number;
  /** Origin of the frontend under test, allowed by CORS and used in email links. */
  frontendUrl?: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Six-digit code in the email, if any. */
  code: string | null;
  urls: string[];
}

export interface BackendStack {
  apiUrl: string;
  databaseName: string;
  mails: () => Mail[];
  waitForMail: (to: string, match?: (m: Mail) => boolean, timeoutMs?: number) => Promise<Mail>;
  log: () => string;
  stop: () => Promise<void>;
}

const DEFAULTS = {
  databaseUrl: process.env.E2E_DATABASE_URL ?? 'postgres://oj:oj@127.0.0.1:55432/online_judge_test',
  redisUrl: process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:56379/1',
  port: Number(process.env.E2E_API_PORT ?? 4100),
  frontendUrl: process.env.E2E_WEB_URL ?? 'http://localhost:3100',
};

/** Refuses anything but the throwaway stack: e2e data must never land in a development database. */
function ensureThrowaway(url: string, kind: string) {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'redis', 'postgres-test', 'redis-test'].includes(u.hostname);
  const devPort = (kind === 'Postgres' && (u.port === '' || u.port === '5432')) || (kind === 'Redis' && (u.port === '' || u.port === '6379'));
  if (!local || (devPort && !process.env.CI)) {
    throw new Error(`${kind} ${u.host} is not the throwaway test stack. Start it with "pnpm infra:test:up" (ports 55432/56379).`);
  }
}

export async function startBackend(options: StackOptions = {}): Promise<BackendStack> {
  const o = { ...DEFAULTS, ...options };
  ensureThrowaway(o.databaseUrl, 'Postgres');
  ensureThrowaway(o.redisUrl, 'Redis');

  // A fresh database per run.
  const { Client } = backendRequire('pg') as typeof import('pg');
  const databaseName = `oj_e2e_${randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: o.databaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  const dbUrl = new URL(o.databaseUrl);
  dbUrl.pathname = `/${databaseName}`;

  // A clean Redis database: rate limits and queues from earlier runs are gone.
  const { Redis } = backendRequire('ioredis') as typeof import('ioredis');
  const redis = new Redis(o.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  await redis.flushdb();
  await redis.quit();

  // Run from an empty folder so no developer .env is loaded; everything comes from here.
  const cwd = mkdtempSync(path.join(tmpdir(), 'oj-e2e-'));
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'development',
    NO_COLOR: '1',
    PORT: String(o.port),
    DATABASE_URL: dbUrl.toString(),
    DB_SYNC: 'true',
    REDIS_URL: o.redisUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    ADMIN_EMAIL: E2E_ADMIN.email,
    ADMIN_PASSWORD: E2E_ADMIN.password,
    ADMIN_NAME: 'Quản trị viên E2E',
    FRONTEND_URL: o.frontendUrl,
    CORS_ORIGINS: o.frontendUrl,
    SMTP_HOST: '',
  };
  const child: ChildProcess = spawn(process.execPath, [path.join(BACKEND, 'dist/main.js')], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout!.on('data', (d) => (output += d));
  child.stderr!.on('data', (d) => (output += d));
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));

  const apiUrl = `http://127.0.0.1:${o.port}/api`;
  const dropDatabase = async () => {
    const cleanup = new Client({ connectionString: o.databaseUrl });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await cleanup.end();
    rmSync(cwd, { recursive: true, force: true });
  };
  const started = Date.now();
  while (!output.includes('API ready')) {
    const failure = child.exitCode !== null
      ? `Backend exited (${child.exitCode}) before it was ready`
      : Date.now() - started > 60_000 ? 'Backend not ready after 60s' : null;
    if (failure) {
      child.kill('SIGKILL');
      await dropDatabase(); // the caller never gets a stack to stop, so clean up here
      throw new Error(`${failure}:\n${output.slice(-3000)}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const mails = () => parseMails(output);
  return {
    apiUrl,
    databaseName,
    mails,
    log: () => output,
    async waitForMail(to, match = () => true, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = mails().filter((m) => m.to === to && match(m)).at(-1);
        if (found) return found;
        if (Date.now() > deadline) throw new Error(`No email to ${to} within ${timeoutMs} ms`);
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    async stop() {
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((r) => setTimeout(r, 15_000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
      await dropDatabase();
    },
  };
}

/** Emails printed by ConsoleMailTransport: "[email ...]\nTo: x\nSubject: y\n<text>" up to the next log line. */
export function parseMails(log: string): Mail[] {
  const mails: Mail[] = [];
  const re = /\nTo: (\S+)\nSubject: ([^\n]*)\n([\s\S]*?)(?=\n\[Nest\]|\n\S*\s*\[Nest\]|$)/g;
  for (const m of log.matchAll(re)) {
    const text = m[3];
    mails.push({
      to: m[1],
      subject: m[2],
      text,
      code: /(?:Mã xác thực[^\d\n]*|là: )(\d{6})/.exec(text)?.[1] ?? null,
      urls: [...text.matchAll(/https?:\/\/\S+/g)].map((u) => u[0]),
    });
  }
  return mails;
}
