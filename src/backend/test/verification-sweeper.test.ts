import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Logger } from '@nestjs/common';
import { VerificationSweeper } from '../src/modules/identity/application/verification-sweeper.js';
import { Email } from '../src/modules/identity/domain/user.js';
import { Verification, type VerificationPurpose } from '../src/modules/identity/domain/verification.js';
import { MemoryVerifications } from './support/identity-fakes.js';

const DAY = 24 * 60 * 60_000;
const now = new Date('2026-11-07T12:00:00Z');

async function issue(repo: MemoryVerifications, purpose: VerificationPurpose, email: string, issuedAt: Date) {
  const v = Verification.issue(purpose, Email.of(email), {}, 'hash', issuedAt);
  await repo.save(v);
  return v.id;
}

test('expired sign-up and reset tickets are deleted a day after they expire; invitations and live tickets stay', async () => {
  const repo = new MemoryVerifications();
  const oldReset = await issue(repo, 'RESET_PASSWORD', 'ghost@truong.vn', new Date(now.getTime() - 2 * DAY));
  const oldSignUp = await issue(repo, 'REGISTER_STUDENT', 'that@truong.vn', new Date(now.getTime() - 2 * DAY));
  const justExpired = await issue(repo, 'RESET_PASSWORD', 'lan@truong.vn', new Date(now.getTime() - 60 * 60_000));
  const live = await issue(repo, 'REGISTER_STUDENT', 'moi@truong.vn', now);
  const oldInvitation = await issue(repo, 'INVITE_TEACHER', 'gv@truong.vn', new Date(now.getTime() - 30 * DAY));

  const removed = await new VerificationSweeper(repo).sweep(now);

  assert.equal(removed, 2);
  assert.deepEqual([...repo.rows.keys()].sort(), [justExpired, live, oldInvitation].sort());
  assert.ok(!repo.rows.has(oldReset) && !repo.rows.has(oldSignUp));
});

test('the first sweep runs at start-up, not an hour later (R2-F9)', async (ctx) => {
  const repo = new MemoryVerifications();
  const swept = ctx.mock.method(repo, 'deleteExpired', async () => 0);
  const sweeper = new VerificationSweeper(repo);
  sweeper.onModuleInit();
  sweeper.onModuleDestroy();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(swept.mock.callCount(), 1);
});

test('a failing sweep is logged and retried next time, never thrown', async (ctx) => {
  const repo = new MemoryVerifications();
  repo.deleteExpired = async () => { throw new Error('db down'); };
  const error = ctx.mock.method(Logger.prototype, 'error', () => {});
  assert.equal(await new VerificationSweeper(repo).sweep(now), 0);
  assert.match(String(error.mock.calls[0].arguments[0]), /db down/);
});
