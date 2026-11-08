/**
 * Decides whether the development seed may run, before anything connects.
 *
 * It must run before Nest starts: creating the application context already connects to the database (and alters
 * the schema when DB_SYNC=true), creates the administrator and starts background jobs. So the check reads the
 * environment the same way ConfigModule will (see app.module.ts) instead of asking ConfigService afterwards.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { isProduction, type Env } from './config/environment.js';

/** Same files and order as ConfigModule.forRoot({ envFilePath }) in app.module.ts. */
export const ENV_FILES = ['.env', '.env.local'] as const;

/** This machine, or the service names of the local docker-compose stack. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'redis']);

/** Same default as the Redis provider in shared.module.ts. */
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

type ReadFile = (path: string) => string;

/**
 * The environment the backend will see. As in ConfigModule, variables already set in the process win over the files,
 * and among the files the first one that defines a variable wins. Missing files are skipped.
 */
export function effectiveEnv(dir: string, processEnv: Env = process.env, read: ReadFile = (p) => readFileSync(p, 'utf8')): Env {
  const fromFiles: Env = {};
  for (const file of ENV_FILES) {
    let text: string;
    try {
      text = read(join(dir, file));
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parseEnv(text))) {
      if (!(key in fromFiles)) fromFiles[key] = value;
    }
  }
  return { ...fromFiles, ...processEnv };
}

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Why the seed must not run with this environment, or null when it may. */
export function seedRefusal(env: Env): string | null {
  if (isProduction(env)) return 'The seed is for development only (NODE_ENV=production).';
  const database = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL : '';
  if (!database) return 'DATABASE_URL is not set.';
  if (!isLocalUrl(database)) {
    return 'DATABASE_URL does not point at a database on this machine; the seed only runs against a local database.';
  }
  // Seeded submissions go through Redis: a shared Redis would send them to another environment's judge.
  const redis = typeof env.REDIS_URL === 'string' && env.REDIS_URL ? env.REDIS_URL : DEFAULT_REDIS_URL;
  if (!isLocalUrl(redis)) return 'REDIS_URL does not point at Redis on this machine; the seed only runs against a local Redis.';
  return null;
}
