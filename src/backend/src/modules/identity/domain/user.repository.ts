import type { Role } from '@oj/contracts';
import type { Email, User } from './user.js';
import type { Verification, VerificationPurpose } from './verification.js';

export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: Email): Promise<User | null>;
  abstract findAll(): Promise<User[]>;
  abstract findByIds(ids: string[]): Promise<User[]>;
  abstract findByRole(role: Role): Promise<User[]>;
  abstract adminExists(): Promise<boolean>;
  abstract save(user: User): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

export abstract class VerificationRepository {
  abstract findById(id: string): Promise<Verification | null>;
  /** Latest not-yet-consumed verification for this email and purpose. */
  abstract findOpen(email: Email, purpose: VerificationPurpose): Promise<Verification | null>;
  abstract findOpenByPurpose(purpose: VerificationPurpose): Promise<Verification[]>;
  abstract save(verification: Verification): Promise<void>;
  abstract delete(id: string): Promise<void>;
  /**
   * Spends one attempt of a verification, ATOMICALLY, and returns it with the attempt counted. Returns null when
   * it is gone, already spent, expired or out of attempts (the rule of `Verification.isUsable`).
   *
   * Many requests may guess the same code at once: each caller must get its own attempt number and no more
   * than MAX_ATTEMPTS calls may ever succeed per issued code. Load-then-save cannot give that guarantee.
   */
  abstract claimAttempt(id: string, now?: Date): Promise<Verification | null>;
  /**
   * Marks a claimed verification as spent, ATOMICALLY, only if it is still open with the same code (a code
   * reissued meanwhile does not count). False when someone else spent it first.
   */
  abstract consume(verification: Verification, now?: Date): Promise<boolean>;
  /**
   * Stores a reissued verification, ATOMICALLY, only if it is still open and was last sent at `sentBefore` (i.e.
   * nobody spent or reissued it since it was loaded). False otherwise. A plain `save` here would let a resend
   * reopen a code that was just used, and let parallel resends each send a code past the cooldown.
   */
  abstract saveReissued(verification: Verification, sentBefore: Date): Promise<boolean>;
  /** Deletes verifications of these purposes that expired before `expiredBefore`. Returns how many. */
  abstract deleteExpired(purposes: VerificationPurpose[], expiredBefore: Date): Promise<number>;
}
