import type { User } from '../domain/user.js';

export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenClaims {
  userId: string;
  /** The credential fingerprint the token was issued for (see `TokenService.credentialOf`). */
  credential: string;
}

export abstract class TokenService {
  /** A signed token for the user, bound to the credentials they have right now. */
  abstract issue(user: User): Promise<string>;
  /** The claims of a valid, unexpired token; null otherwise (including tokens issued before credentials were bound in). */
  abstract verify(token: string): Promise<TokenClaims | null>;
  /**
   * A fingerprint of what proves the user's identity. It changes when the password changes, which is
   * what retires every token issued before.
   */
  abstract credentialOf(user: User): string;
}

/** What the emailed link carries: the ticket and the secret only the mailbox receives. */
export interface EmailLink {
  verificationId: string;
  token: string;
}

/** Port: identity-related emails. Wording lives in the adapter; the application only says what to send. */
export abstract class IdentityMailer {
  abstract sendRegistrationCode(to: string, name: string, code: string, expiresAt: Date): Promise<void>;
  /** The reset email carries only the link: there is no code, so there is nothing short to guess. */
  abstract sendPasswordResetLink(to: string, name: string, link: EmailLink, expiresAt: Date): Promise<void>;
  abstract sendTeacherInvitation(to: string, name: string, acceptUrl: string, code: string, expiresAt: Date): Promise<void>;
  /** An existing teacher was invited into an organization: they accept on their home page. Carries no code. */
  abstract sendOrganizationInvitation(to: string, name: string, organizationName: string, homeUrl: string, expiresAt: Date): Promise<void>;
  /** Sent instead of a sign-up code when the address already has an account. Carries no code. */
  abstract sendAccountExistsNotice(to: string, name: string): Promise<void>;
  /** Sent once per window when sign-in to the account is blocked by too many wrong passwords from many addresses. */
  abstract sendSignInBlockedNotice(to: string, name: string): Promise<void>;
}
