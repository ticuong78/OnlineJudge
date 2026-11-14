import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { DisplayName, Email, Phone, User } from '../src/modules/identity/domain/user.js';
import { MAX_ATTEMPTS, Verification } from '../src/modules/identity/domain/verification.js';
import { toUserDto } from '../src/modules/identity/application/account.service.js';
import { hasFullAi } from '../src/shared/application/ai-access.js';

const email = Email.of('An@Truong.edu.vn');

test('phone numbers are normalised to 0xxxxxxxxx', () => {
  assert.equal(Phone.of('+84 912.345.678').value, '0912345678');
  assert.equal(Phone.optional('  '), null);
  assert.throws(() => Phone.of('12345'), DomainError);
});

test('verification is single-use', () => {
  const v = Verification.issue('REGISTER_STUDENT', email, {}, 'hash');
  v.claimAttempt();
  v.consume();
  assert.throws(() => v.claimAttempt(), /hết hạn/);
  assert.throws(() => v.consume(), /hết hạn/);
});

test('verification locks after too many attempts until a new code is sent', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const v = Verification.issue('RESET_PASSWORD', email, {}, 'hash', t0);
  for (let i = 1; i <= MAX_ATTEMPTS; i++) assert.equal(v.claimAttempt(t0), MAX_ATTEMPTS - i);
  assert.throws(() => v.claimAttempt(t0), /hết hạn/, 'no attempt is left, so nothing more is evaluated');

  assert.throws(() => v.reissue('hash2', new Date(t0.getTime() + 30_000)), /đợi 30 giây/);
  const t1 = new Date(t0.getTime() + 61_000);
  v.reissue('hash2', t1);
  assert.equal(v.claimAttempt(t1), MAX_ATTEMPTS - 1);
  v.consume(t1);
});

test('the last allowed attempt may still be the right one', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const v = Verification.issue('RESET_PASSWORD', email, {}, 'hash', t0);
  for (let i = 1; i < MAX_ATTEMPTS; i++) v.claimAttempt(t0);
  assert.equal(v.claimAttempt(t0), 0, 'the fifth attempt is the last');
  v.consume(t0); // it was the right code: spending it must not need a sixth attempt
  assert.throws(() => v.consume(t0), /hết hạn/);
});

test('verification expires', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const v = Verification.issue('REGISTER_STUDENT', email, {}, 'hash', t0);
  const late = new Date(t0.getTime() + 11 * 60_000);
  assert.throws(() => v.claimAttempt(late), /hết hạn/);
  assert.throws(() => v.consume(late), /hết hạn/);
  const invite = Verification.issue('INVITE_TEACHER', email, {}, 'hash', t0);
  assert.ok(invite.isUsable(new Date(t0.getTime() + 6 * 24 * 3600_000)));
});

test('full AI (the AI-usage check) is for VIP teachers and the administrator; it follows the AI plan (OJ-26)', () => {
  const account = (address: string) => ({ email: Email.of(address), displayName: DisplayName.of('Lan'), phone: null, passwordHash: 'h' });
  const teacher = User.acceptTeacherInvitation(account('gv@truong.edu.vn'));
  assert.equal(teacher.vip, false, 'new teachers start on a regular account');
  assert.equal(hasFullAi(teacher.aiPlan()), false);
  assert.equal(toUserDto(teacher).canUseAi, false);
  assert.equal(toUserDto(teacher).aiPlan, 'FREE', 'a regular teacher has a FREE allowance but not full AI');
  teacher.setVip(true);
  assert.equal(toUserDto(teacher).canUseAi, true);
  assert.equal(toUserDto(teacher).aiPlan, 'PLUS');
  teacher.setVip(false);
  assert.equal(hasFullAi(teacher.aiPlan()), false);
  assert.equal(hasFullAi(teacher.aiPlan(true)), true, 'an organization with AI gives full AI');

  const student = User.registerStudent(account('hs@truong.edu.vn'));
  assert.throws(() => student.setVip(true), /Chỉ tài khoản giáo viên/);
  assert.equal(toUserDto(student).canUseAi, false);
  assert.equal(toUserDto(User.bootstrapAdmin(account('admin@truong.edu.vn'))).canUseAi, true);
});
