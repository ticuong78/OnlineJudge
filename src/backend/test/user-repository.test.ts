import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Repository } from 'typeorm';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { DisplayName, Email, User } from '../src/modules/identity/domain/user.js';
import { TypeOrmUserRepository } from '../src/modules/identity/infrastructure/typeorm-user.repository.js';
import type { UserOrmEntity } from '../src/modules/identity/infrastructure/user.orm-entity.js';

/** What node-postgres reports, through TypeORM, when a unique index refuses a row. */
function uniqueViolation(detail: string) {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', driverError: { code: '23505', detail } });
}

const failingWith = (error: Error) =>
  new TypeOrmUserRepository({ save: async () => { throw error; } } as unknown as Repository<UserOrmEntity>);

const student = () =>
  User.registerStudent({ email: Email.of('lan@truong.vn'), displayName: DisplayName.of('Lan An'), phone: null, passwordHash: 'x' });

test('two sign-ups racing for one address: the loser gets 409 email_taken, not a 500', async () => {
  const repo = failingWith(uniqueViolation('Key (email)=(lan@truong.vn) already exists.'));
  await assert.rejects(repo.save(student()), (e: DomainError) => e instanceof DomainError && e.code === 'identity.email_taken' && !e.message.includes('lan@'));
});

test('other database failures are not dressed up as email_taken', async () => {
  const adminClash = uniqueViolation('Key (role)=(ADMIN) already exists.');
  await assert.rejects(failingWith(adminClash).save(student()), (e: Error) => e === adminClash);
  const down = new Error('connection terminated');
  await assert.rejects(failingWith(down).save(student()), (e: Error) => e === down);
});
