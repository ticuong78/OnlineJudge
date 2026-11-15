import { EventPublisher } from '../../src/shared/application/event-publisher.js';
import type { DomainEvent } from '../../src/shared/domain/aggregate-root.js';
import { IdentityMailer, PasswordHasher, type EmailLink } from '../../src/modules/identity/application/ports.js';
import type { Email, User } from '../../src/modules/identity/domain/user.js';
import { UserRepository, VerificationRepository } from '../../src/modules/identity/domain/user.repository.js';
import { Verification, type VerificationPurpose, type VerificationState } from '../../src/modules/identity/domain/verification.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Behaves like the Postgres repository: every read returns a fresh copy (a network round trip away), and
 * `claimAttempt`/`consume` are single atomic steps, like one conditional UPDATE.
 */
export class MemoryVerifications extends VerificationRepository {
  readonly rows = new Map<string, VerificationState>();

  async findById(id: string) {
    await sleep(1);
    const row = this.rows.get(id);
    return row ? Verification.rehydrate(id, { ...row }) : null;
  }
  async save(v: Verification) {
    await sleep(1);
    this.rows.set(v.id, { ...v.snapshot });
  }
  async claimAttempt(id: string, now = new Date()) {
    await sleep(1);
    const row = this.rows.get(id); // from here to the end there is no await: nobody can interleave
    if (!row) return null;
    const v = Verification.rehydrate(id, { ...row });
    try {
      v.claimAttempt(now);
    } catch {
      return null;
    }
    this.rows.set(id, { ...v.snapshot });
    return v;
  }
  async consume(v: Verification, now = new Date()) {
    await sleep(1);
    const row = this.rows.get(v.id);
    if (!row || row.consumedAt || row.codeHash !== v.snapshot.codeHash || now >= row.expiresAt) return false;
    row.consumedAt = now;
    return true;
  }
  async deleteExpired(purposes: VerificationPurpose[], expiredBefore: Date) {
    const doomed = [...this.rows.entries()].filter(([, s]) => purposes.includes(s.purpose) && s.expiresAt < expiredBefore);
    for (const [id] of doomed) this.rows.delete(id);
    return doomed.length;
  }
  async saveReissued(v: Verification, sentBefore: Date) {
    await sleep(1);
    const row = this.rows.get(v.id); // no await from here on: atomic, like the conditional UPDATE
    if (!row || row.consumedAt || row.lastSentAt.getTime() !== sentBefore.getTime()) return false;
    this.rows.set(v.id, { ...v.snapshot });
    return true;
  }
  async findOpen(email: Email, purpose: VerificationPurpose) {
    await sleep(1);
    const open = [...this.rows.entries()]
      .filter(([, s]) => s.email.value === email.value && s.purpose === purpose && !s.consumedAt)
      .sort(([, a], [, b]) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return open ? Verification.rehydrate(open[0], { ...open[1] }) : null;
  }
  async findOpenByPurpose(purpose: VerificationPurpose) {
    return [...this.rows.entries()]
      .filter(([, s]) => s.purpose === purpose && !s.consumedAt)
      .map(([id, s]) => Verification.rehydrate(id, { ...s }));
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class MemoryUsers extends UserRepository {
  readonly rows = new Map<string, User>();
  async findById(id: string) { await sleep(1); return this.rows.get(id) ?? null; }
  async findByEmail(email: Email) { await sleep(1); return [...this.rows.values()].find((u) => u.email.value === email.value) ?? null; }
  async findAll() { return [...this.rows.values()]; }
  async findByIds(ids: string[]) { return ids.map((i) => this.rows.get(i)).filter((u): u is User => !!u); }
  async findByRole(role: string) { return [...this.rows.values()].filter((u) => u.role === role); }
  async adminExists() { return [...this.rows.values()].some((u) => u.role === 'ADMIN'); }
  async save(user: User) { await sleep(1); this.rows.set(user.id, user); }
  async delete(id: string) { this.rows.delete(id); }
}

/** Fast stand-in for scrypt that counts how often a password or code was compared. */
export class FakeHasher extends PasswordHasher {
  verifications = 0;
  hashes = 0;
  async hash(plain: string) { this.hashes++; await sleep(1); return `fake$${plain}`; }
  async verify(plain: string, stored: string) { this.verifications++; await sleep(1); return stored === `fake$${plain}`; }
}

export class FakeMailer extends IdentityMailer {
  readonly sent: { kind: string; to: string; code: string; token?: string; url?: string }[] = [];
  async sendRegistrationCode(to: string, _name: string, code: string) { this.sent.push({ kind: 'registration', to, code }); }
  async sendPasswordResetLink(to: string, _name: string, link: EmailLink) { this.sent.push({ kind: 'reset', to, code: '', token: link.token }); }
  async sendTeacherInvitation(to: string, _name: string, url: string, code: string) { this.sent.push({ kind: 'invitation', to, code, url }); }
  async sendOrganizationInvitation(to: string, _name: string, organization: string, url: string) { this.sent.push({ kind: 'organization-invitation', to, code: '', url: `${organization}|${url}` }); }
  async sendAccountExistsNotice(to: string) { this.sent.push({ kind: 'account-exists', to, code: '' }); }
  async sendSignInBlockedNotice(to: string) { this.sent.push({ kind: 'sign-in-blocked', to, code: '' }); }
}

export class RecordingEvents extends EventPublisher {
  readonly published: DomainEvent[] = [];
  async publish(events: DomainEvent[]) { this.published.push(...events); }
}
