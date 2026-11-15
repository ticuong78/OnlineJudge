import { Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import type { VerificationTicketDto } from '@oj/contracts';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { invalidCode, MAX_ATTEMPTS, wrongCode, type Verification } from '../domain/verification.js';
import { VerificationRepository } from '../domain/user.repository.js';
import { PasswordHasher } from './ports.js';

/** Generates/checks one-time codes and records attempts on Verification aggregates. */
@Injectable()
export class OneTimeCodes {
  constructor(
    private readonly hasher: PasswordHasher,
    private readonly verifications: VerificationRepository,
  ) {}

  /**
   * Returns the plain code and link token (to email) and their hashes (to store). Both are hashed with the same
   * hasher as passwords, so no second hashing scheme exists (CLAUDE.md security rule 4).
   */
  async generate(): Promise<{ code: string; hash: string; token: string; linkHash: string }> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const token = randomBytes(32).toString('base64url');
    const [hash, linkHash] = await Promise.all([this.hasher.hash(code), this.hasher.hash(token)]);
    return { code, hash, token, linkHash };
  }

  async load(id: string): Promise<Verification> {
    const verification = await this.verifications.findById(id);
    if (!verification) {
      throw DomainError.validation('identity.invalid_code', 'Mã xác thực không đúng hoặc đã hết hạn. Hãy gửi lại mã.');
    }
    return verification;
  }

  /**
   * Checks a code the caller typed, spending one of the verification's limited attempts.
   *
   * The attempt is claimed BEFORE the code is compared, in one atomic step, so a guess is never evaluated
   * unless it was counted. (Comparing first and saving the counter afterwards let parallel requests all
   * see the same counter: hundreds of guesses were evaluated against one 5-attempt budget.)
   * Throws unless the code is right; on success the verification is spent.
   */
  async check(verification: Verification, code: string): Promise<void> {
    const claimed = await this.verifications.claimAttempt(verification.id);
    if (!claimed) throw invalidCode();

    const matches = await this.hasher.verify(code.trim(), claimed.snapshot.codeHash);
    if (!matches) throw wrongCode(MAX_ATTEMPTS - claimed.snapshot.attempts);

    claimed.consume();
    if (!(await this.verifications.consume(claimed))) throw invalidCode();
  }

  /**
   * Completes a verification with the token from its emailed link. Unlike a typed code this spends no attempt:
   * the token cannot be guessed, so the attempt limit is not needed, and without one nobody who merely knows the
   * public verification id can make the link stop working. Throws unless the token is right; on success the
   * verification is spent.
   */
  async checkLink(verification: Verification, token: string, now = new Date()): Promise<void> {
    const { linkHash, consumedAt, expiresAt } = verification.snapshot;
    // Closed tickets are refused before hashing, so they cost no scrypt work (audit R3-N4).
    if (!linkHash || consumedAt || now >= expiresAt) throw invalidCode();
    if (!(await this.hasher.verify(token, linkHash))) throw invalidCode();
    verification.consume(now);
    // Atomic: still open and still the same code and link (a resend meanwhile makes this link stale).
    if (!(await this.verifications.consume(verification))) throw invalidCode();
  }
}

export function toTicket(v: Verification): VerificationTicketDto {
  return {
    verificationId: v.id,
    email: v.snapshot.email.value,
    expiresAt: v.snapshot.expiresAt.toISOString(),
    resendAvailableAt: v.resendAvailableAt.toISOString(),
  };
}
