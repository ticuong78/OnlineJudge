import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import type { Email } from './user.js';

export type VerificationPurpose = 'REGISTER_STUDENT' | 'INVITE_TEACHER' | 'RESET_PASSWORD';

/** Data carried until the verification succeeds (the account does not exist before that). */
export interface VerificationPayload {
  displayName?: string;
  /** Class the student joins (opaque id owned by the Classroom context). */
  classId?: string;
  phone?: string | null;
  passwordHash?: string;
  /** Teacher invitation sent on behalf of an organization: accepting it joins that organization (OJ-8). */
  organizationInvitationId?: string;
}

export const VERIFICATION_POLICY: Record<VerificationPurpose, { ttlMs: number }> = {
  REGISTER_STUDENT: { ttlMs: 10 * 60_000 },
  RESET_PASSWORD: { ttlMs: 10 * 60_000 },
  INVITE_TEACHER: { ttlMs: 7 * 24 * 60 * 60_000 },
};
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;

export interface VerificationState {
  purpose: VerificationPurpose;
  email: Email;
  payload: VerificationPayload;
  codeHash: string;
  /**
   * Hash of the secret in the emailed link: set for password reset, which is completed by the link only, and null
   * otherwise (sign-up and invitations use the code). The link is not limited to MAX_ATTEMPTS: it is long enough not
   * to be guessed, and so cannot be "used up" by someone who only knows the public verification id.
   */
  linkHash: string | null;
  attempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export const invalidCode = () =>
  DomainError.validation('identity.invalid_code', 'Mã xác thực không đúng hoặc đã hết hạn. Hãy kiểm tra lại email hoặc gửi lại mã.');

/**
 * `attemptsLeft` is what remains after the wrong attempt that was just spent. It is also sent as data, so a client
 * showing its own wording (the English interface) can still say how many tries are left.
 */
export const wrongCode = (attemptsLeft: number) =>
  DomainError.validation('identity.wrong_code',
    attemptsLeft > 0 ? `Mã xác thực không đúng. Bạn còn ${attemptsLeft} lần thử.` : 'Bạn đã nhập sai quá nhiều lần. Hãy gửi lại mã mới.',
    { attemptsLeft: String(Math.max(0, attemptsLeft)) });

/**
 * A one-time code sent to an email address to prove ownership before something happens
 * (account creation, teacher activation, password reset). The plain code is never stored.
 */
export class Verification extends AggregateRoot {
  private constructor(id: string, private state: VerificationState) {
    super(id);
  }

  static issue(
    purpose: VerificationPurpose, email: Email, payload: VerificationPayload, codeHash: string, now = new Date(), linkHash: string | null = null,
  ): Verification {
    return new Verification(newId(), {
      purpose,
      email,
      payload,
      codeHash,
      linkHash,
      attempts: 0,
      expiresAt: new Date(now.getTime() + VERIFICATION_POLICY[purpose].ttlMs),
      lastSentAt: now,
      consumedAt: null,
      createdAt: now,
    });
  }

  static rehydrate(id: string, state: VerificationState): Verification {
    return new Verification(id, state);
  }

  get snapshot(): Readonly<VerificationState> {
    return this.state;
  }

  get resendAvailableAt(): Date {
    return new Date(this.state.lastSentAt.getTime() + RESEND_COOLDOWN_MS);
  }

  isUsable(now = new Date()): boolean {
    return !this.state.consumedAt && now < this.state.expiresAt && this.state.attempts < MAX_ATTEMPTS;
  }

  ensurePurpose(purpose: VerificationPurpose): void {
    if (this.state.purpose !== purpose) throw invalidCode();
  }

  /** New code and link (the old ones stop working), new expiry, attempts reset. */
  reissue(codeHash: string, now = new Date(), linkHash: string | null = null): void {
    if (this.state.consumedAt) throw invalidCode();
    if (now < this.resendAvailableAt) {
      const seconds = Math.ceil((this.resendAvailableAt.getTime() - now.getTime()) / 1000);
      throw DomainError.conflict('identity.resend_too_soon', `Vui lòng đợi ${seconds} giây rồi gửi lại mã.`);
    }
    this.state = {
      ...this.state,
      codeHash,
      linkHash,
      attempts: 0,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + VERIFICATION_POLICY[this.state.purpose].ttlMs),
    };
  }

  /**
   * Spends one of the limited attempts and returns how many are left. The caller compares the code only
   * AFTER this succeeded, so a guess is never evaluated without having been counted.
   *
   * This is the in-memory statement of the rule. Persistence must apply it atomically
   * (`VerificationRepository.claimAttempt`), otherwise concurrent guesses all see the same counter.
   */
  claimAttempt(now = new Date()): number {
    if (!this.isUsable(now)) throw invalidCode();
    this.state.attempts++;
    return MAX_ATTEMPTS - this.state.attempts;
  }

  /**
   * The right code was given: the verification is spent for good. It needs no free attempt (the one just
   * claimed may have been the last), only that it is still open.
   */
  consume(now = new Date()): void {
    if (this.state.consumedAt || now >= this.state.expiresAt) throw invalidCode();
    this.state.consumedAt = now;
  }
}
