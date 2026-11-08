import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Role } from '@oj/contracts';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { Email, Phone, User } from '../domain/user.js';
import { UserRepository, VerificationRepository } from '../domain/user.repository.js';
import { MAX_ATTEMPTS, Verification, type VerificationPurpose } from '../domain/verification.js';
import { UserOrmEntity, VerificationOrmEntity } from './user.orm-entity.js';

@Injectable()
export class TypeOrmUserRepository extends UserRepository {
  constructor(@InjectRepository(UserOrmEntity) private readonly repo: Repository<UserOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: Email) {
    const row = await this.repo.findOneBy({ email: email.value });
    return row ? toUser(row) : null;
  }

  async findAll() {
    return (await this.repo.find({ order: { createdAt: 'ASC' } })).map(toUser);
  }

  async findByIds(ids: string[]) {
    return ids.length ? (await this.repo.findBy({ id: In(ids) })).map(toUser) : [];
  }

  async findByRole(role: Role) {
    return (await this.repo.find({ where: { role }, order: { displayName: 'ASC' } })).map(toUser);
  }

  async adminExists() {
    return this.repo.existsBy({ role: 'ADMIN' });
  }

  async save(user: User) {
    try {
      await this.repo.save({
        id: user.id,
        email: user.email.value,
        displayName: user.displayName,
        phone: user.phone?.value ?? null,
        role: user.role,
        passwordHash: user.passwordHash,
        vip: user.vip,
        createdAt: user.createdAt,
      });
    } catch (error) {
      // The application checks the address is free first, but two requests can both pass that check; the
      // unique index then refuses the second one, which should read as the same 409, not a server error.
      if (isEmailTaken(error)) throw DomainError.conflict('identity.email_taken', 'Email này đã có tài khoản. Hãy đăng nhập.');
      throw error;
    }
  }

  async delete(id: string) {
    await this.repo.delete({ id });
  }
}

/** PostgreSQL unique violation (23505) on the email column; the index name is generated, so match the column. */
function isEmailTaken(error: unknown): boolean {
  const driver = (error as { driverError?: { code?: string; detail?: string } }).driverError;
  return driver?.code === '23505' && /^Key \(email\)=/.test(driver.detail ?? '');
}

function toUser(row: UserOrmEntity): User {
  return User.rehydrate(row.id, {
    email: Email.of(row.email),
    displayName: row.displayName,
    phone: row.phone ? Phone.of(row.phone) : null,
    role: row.role as Role,
    passwordHash: row.passwordHash,
    vip: row.vip ?? false,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class TypeOrmVerificationRepository extends VerificationRepository {
  constructor(@InjectRepository(VerificationOrmEntity) private readonly repo: Repository<VerificationOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toVerification(row) : null;
  }

  async findOpen(email: Email, purpose: VerificationPurpose) {
    const row = await this.repo.findOne({
      where: { email: email.value, purpose, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return row ? toVerification(row) : null;
  }

  async findOpenByPurpose(purpose: VerificationPurpose) {
    const rows = await this.repo.find({ where: { purpose, consumedAt: IsNull() }, order: { createdAt: 'DESC' } });
    return rows.map(toVerification);
  }

  async save(v: Verification) {
    const s = v.snapshot;
    await this.repo.save({
      id: v.id,
      purpose: s.purpose,
      email: s.email.value,
      payload: s.payload,
      codeHash: s.codeHash,
      linkHash: s.linkHash,
      attempts: s.attempts,
      expiresAt: s.expiresAt,
      lastSentAt: s.lastSentAt,
      consumedAt: s.consumedAt,
      createdAt: s.createdAt,
    });
  }

  async delete(id: string) {
    await this.repo.delete({ id });
  }

  // The two statements below restate `Verification.isUsable` / `consume` in SQL on purpose: only a single
  // conditional UPDATE is atomic (row locks serialise concurrent callers; no connection is held while the
  // code is hashed). Keep them in step with the aggregate.

  async claimAttempt(id: string, now = new Date()) {
    const result = await this.repo
      .createQueryBuilder()
      .update(VerificationOrmEntity)
      .set({ attempts: () => '"attempts" + 1' })
      .where('"id" = :id AND "consumedAt" IS NULL AND "expiresAt" > :now AND "attempts" < :max', { id, now, max: MAX_ATTEMPTS })
      .returning('*')
      .execute();
    const row = (result.raw as VerificationOrmEntity[])[0];
    return row ? toVerification(row) : null;
  }

  async consume(v: Verification, now = new Date()) {
    const result = await this.repo
      .createQueryBuilder()
      .update(VerificationOrmEntity)
      .set({ consumedAt: now })
      .where('"id" = :id AND "consumedAt" IS NULL AND "codeHash" = :hash AND "expiresAt" > :now', {
        id: v.id,
        hash: v.snapshot.codeHash,
        now,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async deleteExpired(purposes: VerificationPurpose[], expiredBefore: Date) {
    const result = await this.repo.delete({ purpose: In(purposes), expiresAt: LessThan(expiredBefore) });
    return result.affected ?? 0;
  }

  async saveReissued(v: Verification, sentBefore: Date) {
    const s = v.snapshot;
    const result = await this.repo
      .createQueryBuilder()
      .update(VerificationOrmEntity)
      .set({ codeHash: s.codeHash, linkHash: s.linkHash, attempts: s.attempts, expiresAt: s.expiresAt, lastSentAt: s.lastSentAt })
      .where('"id" = :id AND "consumedAt" IS NULL AND "lastSentAt" = :sentBefore', { id: v.id, sentBefore })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}

function toVerification(row: VerificationOrmEntity): Verification {
  return Verification.rehydrate(row.id, {
    purpose: row.purpose as VerificationPurpose,
    email: Email.of(row.email),
    payload: row.payload,
    codeHash: row.codeHash,
    linkHash: row.linkHash ?? null,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    lastSentAt: row.lastSentAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  });
}
