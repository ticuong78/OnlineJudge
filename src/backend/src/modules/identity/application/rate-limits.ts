import type { RateLimitPolicy } from '../../../shared/application/rate-limiter.js';

/**
 * Limits on the public identity endpoints. They are per client IP, and a whole class may share one public IP
 * (school NAT), so they leave room for a class signing up or logging in at the same minute while still
 * making guessing and mail flooding impractical.
 */

/** Wrong passwords: how often one IP may try one account. Successful logins do not count. */
export const LOGIN_PER_ACCOUNT_AND_IP: RateLimitPolicy = { limit: 10, windowMs: 10 * 60_000 };
/** Wrong passwords from one IP across all accounts (password spraying). */
export const LOGIN_PER_IP: RateLimitPolicy = { limit: 300, windowMs: 10 * 60_000 };
/**
 * Wrong passwords for one account from all IPs together (guessing spread over many addresses, e.g. IPv6 /64s).
 * Above what one IP may send in the same hour under LOGIN_PER_ACCOUNT_AND_IP (60), so a single address can never
 * fill it. Addresses that signed in to the account recently, or reset its password, are exempt, so the owner
 * is not locked out by an attack from many addresses either.
 */
export const LOGIN_PER_ACCOUNT: RateLimitPolicy = { limit: 100, windowMs: 60 * 60_000 };

/**
 * Emails. One mailbox (or verification) may be written to a couple of times a minute: the same pace as the
 * 60-second resend cooldown of the domain, but held in one place so parallel requests cannot slip past it.
 * Deliberately NOT a bigger budget per target: forgot/resend identifiers are public, so a generous per-target
 * limit would let anyone use up a victim's allowance for the whole window.
 */
export const FORGOT_PER_IP: RateLimitPolicy = { limit: 30, windowMs: 60 * 60_000 };
export const FORGOT_PER_EMAIL: RateLimitPolicy = { limit: 2, windowMs: 60_000 };
export const RESEND_PER_IP: RateLimitPolicy = { limit: 30, windowMs: 60 * 60_000 };
export const RESEND_PER_VERIFICATION: RateLimitPolicy = { limit: 2, windowMs: 60_000 };

/**
 * Typing a code: per IP only. A code allows 5 attempts in total however they arrive, and the verification id is
 * public, so limiting per verification would only hand an attacker a way to lock the real owner out of their code.
 */
export const VERIFY_PER_IP: RateLimitPolicy = { limit: 300, windowMs: 10 * 60_000 };

/**
 * Wrong sign-up codes per address, across resends and new sign-ups. A code allows 5 attempts, but a resend or a
 * new sign-up issues a fresh one, so without this an attacker could keep asking for codes and guessing, and claim
 * someone's address with a password of their own (audit R4-N1). Kept low enough that guessing a 6-digit code is
 * hopeless; a student who mistypes that often just waits a day or asks the teacher.
 */
export const SIGNUP_CODES: RateLimitPolicy = { limit: 20, windowMs: 24 * 60 * 60_000 };

export const INVITATION_PREVIEW_PER_IP: RateLimitPolicy = { limit: 120, windowMs: 10 * 60_000 };
/**
 * Organization invitations send email, and cancelling one frees its seat, so without a cap an org admin could
 * invite and cancel in a loop and mail any address (OJ-8 review L1). Enough for onboarding a whole school at once.
 */
export const ORGANIZATION_INVITES_PER_IP: RateLimitPolicy = { limit: 60, windowMs: 60 * 60_000 };
