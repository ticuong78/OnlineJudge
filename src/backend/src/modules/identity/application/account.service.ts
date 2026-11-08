import { Injectable, Logger } from '@nestjs/common';
import type { AuthResponse, RegisterRequest, UserDto, VerificationTicketDto, OrganizationMembershipDto } from '@oj/contracts';
import { randomBytes } from 'node:crypto';
import type { Actor } from '../../../shared/application/actor.js';
import { EventPublisher } from '../../../shared/application/event-publisher.js';
import { RateLimiter, waitText, type RateLimitPolicy } from '../../../shared/application/rate-limiter.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';
import { maskEmail } from '../../../shared/domain/mask-email.js';
import { STUDENT_REGISTERED, type StudentRegisteredEvent } from '../identity.events.js';
import { adminPasswordProblem } from '../domain/admin-password.js';
import { DisplayName, Email, Phone, User } from '../domain/user.js';
import { UserRepository, VerificationRepository } from '../domain/user.repository.js';
import { Verification } from '../domain/verification.js';
import { OneTimeCodes, toTicket } from './one-time-codes.js';
import { IdentityMailer, PasswordHasher, TokenService } from './ports.js';
import { LOGIN_PER_ACCOUNT, LOGIN_PER_ACCOUNT_AND_IP, LOGIN_PER_IP, SIGNUP_CODES } from './rate-limits.js';
import { RecentSignIns } from './recent-sign-ins.js';
import { OrganizationRepository } from '../domain/organization.repository.js';
import { aiFromOrganizations, membershipViewsOf } from './organization-memberships.js';

export function validatePassword(password: string): void {
  assert(password.length >= 6 && password.length <= 128, 'identity.weak_password', 'Mật khẩu phải có ít nhất 6 ký tự.');
}

/** Use cases of a person acting on their own account: sign-up, sign-in, password reset. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  /**
   * Hash of a random password, checked against when the address is unknown. Made at start-up rather than on
   * first use, so the first unknown-address sign-in does not cost one hash more than every other sign-in.
   */
  private decoyHash: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly verifications: VerificationRepository,
    private readonly codes: OneTimeCodes,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly mailer: IdentityMailer,
    private readonly events: EventPublisher,
    private readonly limiter: RateLimiter,
    private readonly recentSignIns: RecentSignIns,
    private readonly organizations: OrganizationRepository,
  ) {
    this.decoyHash = this.makeDecoyHash();
  }

  // ---------- Student sign-up (2 steps) ----------

  /**
   * `classId` (optional) was resolved from the class code by the Classroom context.
   *
   * An address that already has an account is answered exactly like a new one (a stored ticket, the same
   * cooldown, the same errors on resend or a wrong code), so sign-up cannot be used to find out who has an
   * account. Its owner is emailed a notice instead of a code, so the ticket can never be completed.
   */
  async requestRegistration(input: Omit<RegisterRequest, 'classCode'>, classId: string | null): Promise<VerificationTicketDto> {
    const email = Email.of(input.email);
    const displayName = DisplayName.of(input.displayName);
    const phone = Phone.optional(input.phone);
    validatePassword(input.password);
    const existing = await this.users.findByEmail(email);

    const previous = await this.verifications.findOpen(email, 'REGISTER_STUDENT');
    if (previous) {
      if (new Date() < previous.resendAvailableAt) {
        throw DomainError.conflict('identity.resend_too_soon', 'Mã vừa được gửi tới email này. Vui lòng đợi 1 phút rồi thử lại.');
      }
      await this.verifications.delete(previous.id);
    }

    // Code only, no emailed link: a link would let whoever opens the mailbox confirm a sign-up that a stranger
    // started with the stranger's password (audit R3-N1). The code is typed on the screen that asked for it.
    const { code, hash } = await this.codes.generate();
    const verification = Verification.issue('REGISTER_STUDENT', email, {
      displayName: displayName.value,
      phone: phone?.value ?? null,
      classId: classId ?? undefined,
      passwordHash: await this.hasher.hash(input.password),
    }, hash);
    await this.verifications.save(verification);
    if (existing) await this.mailer.sendAccountExistsNotice(email.value, existing.displayName);
    else await this.mailer.sendRegistrationCode(email.value, displayName.value, code, verification.snapshot.expiresAt);
    return toTicket(verification);
  }

  async completeRegistration(verificationId: string, code: string): Promise<AuthResponse> {
    const verification = await this.codes.load(verificationId);
    verification.ensurePurpose('REGISTER_STUDENT');
    await this.checkSignUpCode(verification, code);

    const { email, payload } = verification.snapshot;
    await this.ensureEmailFree(email);
    const user = User.registerStudent({
      email,
      displayName: DisplayName.of(payload.displayName ?? ''),
      phone: Phone.optional(payload.phone),
      passwordHash: payload.passwordHash!,
    });
    await this.users.save(user);
    const event: StudentRegisteredEvent = { name: STUDENT_REGISTERED, occurredAt: new Date(), userId: user.id, classId: payload.classId ?? null };
    await this.events.publish([event]);
    return this.authResponse(user);
  }

  /**
   * "Send again" for sign-up and password reset codes. Tickets for addresses with no account (reset) or an
   * existing account (sign-up) are real rows, so they pass the same checks and cooldown as any other.
   */
  async resendCode(verificationId: string): Promise<VerificationTicketDto> {
    const verification = await this.codes.load(verificationId);
    const { purpose, email, payload } = verification.snapshot;
    assert(purpose !== 'INVITE_TEACHER', 'identity.invalid_code', 'Lời mời giáo viên chỉ được gửi lại bởi quản trị viên.');
    const { code, hash, token, linkHash } = await this.codes.generate();
    const sentBefore = verification.snapshot.lastSentAt;
    verification.reissue(hash, new Date(), purpose === 'RESET_PASSWORD' ? linkHash : null);
    if (!(await this.verifications.saveReissued(verification, sentBefore))) {
      // Spent or resent by a parallel request since it was loaded: answer as the domain does for the current state.
      (await this.codes.load(verificationId)).reissue(hash);
      throw DomainError.conflict('identity.resend_too_soon', 'Mã vừa được gửi lại. Vui lòng đợi 1 phút rồi thử lại.');
    }

    const user = await this.users.findByEmail(email);
    const expiresAt = verification.snapshot.expiresAt;
    if (purpose === 'REGISTER_STUDENT') {
      if (user) await this.mailer.sendAccountExistsNotice(email.value, user.displayName);
      else await this.mailer.sendRegistrationCode(email.value, payload.displayName ?? '', code, expiresAt);
    } else if (user) {
      // In the background, as in forgotPassword: an unknown address sends nothing, so waiting for the mail
      // server here would make real addresses answer more slowly.
      this.inBackground('Password reset email', () => this.mailer.sendPasswordResetLink(email.value, user.displayName, { verificationId, token }, expiresAt));
    }
    return toTicket(verification);
  }

  // ---------- Sign-in ----------

  /**
   * Wrong passwords are limited per account-and-IP, per IP, and per account from all IPs together. Every attempt
   * is counted BEFORE the password is looked at and handed back on success, so a burst of parallel guesses is
   * cut off just like sequential ones. Addresses that signed in to the account recently skip the account-wide
   * limit, so an attack spread over many addresses cannot lock the owner out.
   */
  async login(email: string, password: string, clientIp: string): Promise<AuthResponse> {
    const address = Email.of(email);
    const accountKey = `login|acct:${address.value}|ip:${clientIp}`;
    const ipKey = `login|ip:${clientIp}`;
    const accountWideKey = accountWideLoginKey(address);
    const limits: [string, RateLimitPolicy, string][] = [
      [accountKey, LOGIN_PER_ACCOUNT_AND_IP, `per account, IP ${clientIp}`],
      [ipKey, LOGIN_PER_IP, `per IP, IP ${clientIp}`],
    ];
    const knownClient = await this.recentSignIns.has(address.value, clientIp);
    if (!knownClient) limits.push([accountWideKey, LOGIN_PER_ACCOUNT, `per account from all IPs, IP ${clientIp}`]);

    const charged: string[] = [];
    for (const [key, policy, logLabel] of limits) {
      try {
        await this.admit(key, policy, logLabel);
      } catch (error) {
        for (const done of charged) await this.limiter.refund(done);
        if (key === accountWideKey) this.noticeSignInBlocked(address);
        throw error;
      }
      charged.push(key);
    }

    const user = await this.users.findByEmail(address);
    // Unknown address: still do the same hashing work, so the response time does not reveal whether it exists.
    const passwordOk = await this.hasher.verify(password, user?.passwordHash ?? (await this.currentDecoyHash()));
    if (!user || !passwordOk) {
      throw DomainError.unauthorized('identity.bad_credentials', 'Email hoặc mật khẩu không đúng.');
    }

    await this.limiter.reset(accountKey);
    await this.limiter.refund(ipKey);
    if (!knownClient) await this.limiter.refund(accountWideKey);
    await this.recentSignIns.record(address.value, clientIp);
    return this.authResponse(user);
  }

  /** Tells the owner, at most once per window, that sign-in from new addresses is blocked. Unknown addresses get nothing. */
  private noticeSignInBlocked(address: Email) {
    this.inBackground('Sign-in blocked notice', async () => {
      const first = await this.limiter.hit(`login-blocked-notice|acct:${address.value}`, { limit: 1, windowMs: LOGIN_PER_ACCOUNT.windowMs });
      if (!first.allowed) return;
      const user = await this.users.findByEmail(address);
      if (user) await this.mailer.sendSignInBlockedNotice(address.value, user.displayName);
    });
  }

  /**
   * Checks a typed sign-up code against the address's budget of wrong codes (SIGNUP_CODES), which, unlike the
   * ticket's 5 attempts, survives resends and new sign-ups. Counted before the code is compared, like every other
   * limit here; given back when the guess was right or no guess was made (a ticket already spent or expired).
   */
  private async checkSignUpCode(verification: Verification, code: string) {
    const key = `signup-code|acct:${verification.snapshot.email.value}`;
    const decision = await this.limiter.hit(key, SIGNUP_CODES);
    if (!decision.allowed) {
      throw DomainError.rateLimited('identity.too_many_attempts',
        `Mã xác thực cho email này đã bị nhập sai quá nhiều lần. Vui lòng thử lại sau ${waitText(decision.retryAfterMs)}.`, decision.retryAfterMs / 1000);
    }
    try {
      await this.codes.check(verification, code);
    } catch (error) {
      if (!(error instanceof DomainError && error.code === 'identity.wrong_code')) await this.limiter.refund(key);
      throw error;
    }
    await this.limiter.refund(key);
  }

  private makeDecoyHash(): Promise<string> {
    const made = this.hasher.hash(randomBytes(16).toString('hex'));
    made.catch(() => undefined); // a failure is handled where it is awaited, not as an unhandled rejection
    return made;
  }

  /**
   * The decoy hash, made again if making it at start-up failed. Without the retry every unknown-address sign-in
   * would fail with a server error while known addresses got 401, telling the two apart (audit R2-F6).
   */
  private currentDecoyHash(): Promise<string> {
    return this.decoyHash.catch(() => (this.decoyHash = this.makeDecoyHash()));
  }

  /** `logLabel` names the limit for the log; the key itself holds the email, which must never be logged. */
  private async admit(key: string, policy: RateLimitPolicy, logLabel: string) {
    const decision = await this.limiter.hit(key, policy);
    if (!decision.allowed) {
      this.logger.warn(`Too many sign-in attempts (${logLabel})`);
      throw DomainError.rateLimited('identity.too_many_attempts',
        `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${waitText(decision.retryAfterMs)}.`, decision.retryAfterMs / 1000);
    }
  }

  async me(actor: Actor): Promise<UserDto> {
    const user = await this.users.findById(actor.id);
    if (!user) throw DomainError.unauthorized('identity.user_gone', 'Tài khoản không còn tồn tại. Vui lòng đăng nhập lại.');
    return toUserDto(user, await membershipViewsOf(this.organizations, user.id));
  }

  // ---------- Password reset ----------

  /**
   * Answers every address the same way, whether or not it has an account: a stored ticket, the same ticket
   * again within the resend cooldown, and the same answers to resend and to a wrong code afterwards. Only a
   * real account is emailed a code, so a ticket for an unknown address can never be completed. The email
   * goes out in the background so the response time does not depend on the mail server either.
   */
  async forgotPassword(rawEmail: string): Promise<VerificationTicketDto> {
    const email = Email.of(rawEmail);
    const user = await this.users.findByEmail(email);
    // `hash` (of a code nobody is sent) only marks each issue, so a stale link is refused; the reset itself is
    // decided by the link alone, which cannot be guessed (audit R3-N2).
    const { hash, token, linkHash } = await this.codes.generate();

    const open = await this.verifications.findOpen(email, 'RESET_PASSWORD');
    if (open && new Date() < open.resendAvailableAt) return toTicket(open); // the code already sent is still the current one

    let verification = open;
    if (open) {
      const sentBefore = open.snapshot.lastSentAt;
      open.reissue(hash, new Date(), linkHash);
      if (!(await this.verifications.saveReissued(open, sentBefore))) {
        // A parallel request resent it first: answer with that ticket, as within the cooldown. If it was spent, start over.
        const current = await this.verifications.findOpen(email, 'RESET_PASSWORD');
        if (current) return toTicket(current);
        verification = null;
      }
    }
    if (!verification) {
      verification = Verification.issue('RESET_PASSWORD', email, {}, hash, new Date(), linkHash);
      await this.verifications.save(verification);
    }
    if (user) {
      const { expiresAt } = verification.snapshot;
      const link = { verificationId: verification.id, token };
      this.inBackground('Password reset email', () => this.mailer.sendPasswordResetLink(email.value, user.displayName, link, expiresAt));
    }
    return toTicket(verification);
  }

  /** Started on the next turn of the event loop, so none of its work (not even the start of an SMTP send) is inside the request. */
  private inBackground(what: string, task: () => Promise<void>) {
    setImmediate(() => void task().catch((error) => this.logger.error(`${what} failed: ${(error as Error).message}`)));
  }

  /**
   * `token` comes from the emailed link: only the link resets a password, so there is no short code to guess and
   * no attempt budget for others to use up. `clientIp` is where the owner just proved they hold the mailbox: it
   * becomes a known address, so a renewed attack on the account-wide limit cannot lock them out.
   */
  async resetPassword(verificationId: string, token: string, newPassword: string, clientIp: string): Promise<AuthResponse> {
    validatePassword(newPassword);
    const verification = await this.codes.load(verificationId);
    verification.ensurePurpose('RESET_PASSWORD');
    await this.codes.checkLink(verification, token);

    const user = await this.users.findByEmail(verification.snapshot.email);
    if (!user) throw DomainError.notFound('identity.user_not_found', 'Không tìm thấy tài khoản.');
    user.changePassword(await this.hasher.hash(newPassword));
    await this.users.save(user);
    // A new password makes the guesses that caused an account-wide block worthless: let the owner in anywhere.
    await this.limiter.reset(accountWideLoginKey(user.email));
    // Addresses that signed in before the reset may have been an attacker's: only this one stays exempt (audit R3-N5).
    await this.recentSignIns.forget(user.email.value);
    await this.recentSignIns.record(user.email.value, clientIp);
    return this.authResponse(user);
  }

  // ---------- Bootstrap ----------

  /**
   * Guarantees the system has exactly one administrator (created from configuration).
   * `strict` (production): a weak or well-known ADMIN_PASSWORD refuses to create the account at all.
   */
  async ensureAdmin(email: string, password: string, displayName: string, options: { strict: boolean } = { strict: false }): Promise<void> {
    if (await this.users.adminExists()) return;
    const problem = adminPasswordProblem(password);
    if (problem && options.strict) {
      throw new Error(`${problem} Refusing to create the administrator account with it in production. Set a strong ADMIN_PASSWORD (12+ characters) and start again.`);
    }
    if (problem) this.logger.warn(`${problem} Fine for development, but change it before real use.`);

    const admin = User.bootstrapAdmin({
      email: Email.of(email),
      displayName: DisplayName.of(displayName),
      phone: null,
      passwordHash: await this.hasher.hash(password),
    });
    await this.users.save(admin);
    this.logger.log(`Created administrator account ${maskEmail(admin.email.value)}`);
  }

  private async ensureEmailFree(email: Email) {
    if (await this.users.findByEmail(email)) {
      throw DomainError.conflict('identity.email_taken', 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu".');
    }
  }

  private async authResponse(user: User): Promise<AuthResponse> {
    const accessToken = await this.tokens.issue(user);
    return { accessToken, user: toUserDto(user, await membershipViewsOf(this.organizations, user.id)) };
  }
}

function accountWideLoginKey(email: Email) {
  return `login|acct:${email.value}`;
}

/** `organizations`: the user's memberships (OJ-8); AI may also come from an active organization. */
export function toUserDto(user: User, organizations: OrganizationMembershipDto[] = []): UserDto {
  return {
    id: user.id,
    email: user.email.value,
    displayName: user.displayName,
    role: user.role,
    phone: user.phone?.value ?? null,
    createdAt: user.createdAt.toISOString(),
    vip: user.vip,
    canUseAi: user.canUseAi || (user.role === 'TEACHER' && aiFromOrganizations(organizations)),
    organizations,
  };
}
