import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AI_LIMIT_KEYS } from '../shared/application/ai-quota.js';

export type Env = Record<string, unknown>;

/** A JWT secret shorter than this is guessable offline from a single token. */
export const MIN_JWT_SECRET_LENGTH = 32;

const PLACEHOLDER_SECRET = /change[-_ ]?me|your[-_ ]?secret|secret[-_ ]?key|^secret$|^password$|^(.)\1*$/i;

export interface EnvironmentReport {
  /** The configuration to run with (a development JWT secret may have been generated). */
  env: Env;
  errors: string[];
  warnings: string[];
}

export const isProduction = (env: Env): boolean => env.NODE_ENV === 'production';

const text = (env: Env, key: string): string => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');

/**
 * Checks the configuration before anything starts.
 *
 * The rule behind it: there must be no secret that is known in advance. A copied `.env.example` used to
 * start a server whose admin-signing key was published in the repository. Now a missing secret is either an
 * error (production) or replaced by a random one (development: sessions simply end at restart), and a
 * placeholder or short secret is always an error.
 */
export function checkEnvironment(raw: Env): EnvironmentReport {
  const env: Env = { ...raw };
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = isProduction(env);

  for (const key of ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    if (!text(env, key)) errors.push(`${key} is required.`);
  }

  const secret = text(env, 'JWT_SECRET');
  const howToMakeOne = 'Generate one with: openssl rand -hex 32';
  if (!secret) {
    if (production) {
      errors.push(`JWT_SECRET is required in production. ${howToMakeOne}`);
    } else {
      env.JWT_SECRET = randomBytes(24).toString('hex');
      warnings.push('JWT_SECRET is not set: using a random one for this run, so everyone is signed out whenever the server restarts. ' + howToMakeOne);
    }
  } else if (secret.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (it has ${secret.length}). ${howToMakeOne}`);
  } else if (PLACEHOLDER_SECRET.test(secret)) {
    errors.push(`JWT_SECRET is a placeholder value; anyone who knows it can sign in as the administrator. ${howToMakeOne}`);
  }

  if (production) {
    if (!text(env, 'SMTP_HOST')) {
      errors.push('SMTP_HOST is required in production: without it, emails (with their one-time codes) are only written to the server log.');
    }
    if (text(env, 'DB_SYNC') === 'true') {
      errors.push('DB_SYNC=true is not allowed in production: it alters tables to match the code without review and can drop a column with its data. The schema comes from the migrations, which run at startup (README, "Nâng cấp").');
    }
    for (const key of ['CORS_ORIGINS', 'FRONTEND_URL']) {
      if (!text(env, key) || /localhost|127\.0\.0\.1/.test(text(env, key))) {
        warnings.push(`${key} points at localhost in production (browsers on the real site will be refused, and invitation links will not work).`);
      }
    }
  }

  const trust = text(env, 'TRUST_PROXY');
  if (trust === 'true') {
    const why = 'TRUST_PROXY=true trusts X-Forwarded-For from anyone, so clients can fake their IP and walk around rate limits. Use the number of proxies in front of the API (e.g. TRUST_PROXY=1).';
    (production ? errors : warnings).push(why);
  }

  // Monthly AI allowances (OJ-21): a whole number of uses (0 turns the feature off for that plan) or "unlimited".
  for (const key of AI_LIMIT_KEYS) {
    const value = text(env, key);
    if (value && value !== 'unlimited' && !/^\d+$/.test(value)) {
      errors.push(`${key} must be a whole number of uses (0 or more) or "unlimited" (got "${value}").`);
    }
  }
  for (const key of ['AI_RATE_PER_MINUTE', 'AI_ADMIN_RATE_PER_MINUTE']) {
    const aiRate = text(env, key);
    if (aiRate && !(/^\d+$/.test(aiRate) && Number(aiRate) > 0)) errors.push(`${key} must be a positive whole number (got "${aiRate}").`);
  }

  for (const key of ['MAX_PENDING_SUBMISSIONS', 'JUDGE_STALE_AFTER_SECONDS', 'JUDGE_GIVE_UP_AFTER_SECONDS']) {
    const value = text(env, key);
    if (value && !(Number.isInteger(Number(value)) && Number(value) > 0)) errors.push(`${key} must be a positive whole number (got "${value}").`);
  }

  return { env, errors, warnings };
}

/** `ConfigModule` validation hook: throws one readable error listing everything wrong, logs the warnings. */
export function validateEnvironment(raw: Env): Env {
  const { env, errors, warnings } = checkEnvironment(raw);
  const logger = new Logger('Config');
  warnings.forEach((w) => logger.warn(w));
  if (errors.length) throw new Error(`Invalid configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  return env;
}

/**
 * Express "trust proxy" setting from TRUST_PROXY: unset/false = trust nobody (use the socket address),
 * a number = that many proxy hops, anything else is passed through (e.g. "loopback", a CIDR list).
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const v = value?.trim();
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
