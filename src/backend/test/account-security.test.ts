import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { InMemoryRateLimiter } from '../src/shared/infrastructure/memory-rate-limiter.js';
import { AccountService } from '../src/modules/identity/application/account.service.js';
import { Authenticator } from '../src/modules/identity/application/authenticator.js';
import { LOGIN_PER_ACCOUNT, SIGNUP_CODES } from '../src/modules/identity/application/rate-limits.js';
import { TeamService } from '../src/modules/identity/application/team.service.js';
import { MemoryRecentSignIns } from '../src/modules/identity/infrastructure/memory-recent-sign-ins.js';
import { OneTimeCodes } from '../src/modules/identity/application/one-time-codes.js';
import { DisplayName, Email, User } from '../src/modules/identity/domain/user.js';
import { JwtTokenService } from '../src/modules/identity/infrastructure/security.js';
import { FakeHasher, FakeMailer, MemoryUsers, MemoryVerifications, RecordingEvents } from './support/identity-fakes.js';
import { MemoryOrganizations } from './support/organization-fakes.js';

function setup() {
  const clock = { now: 1_800_000_000_000 };
  const users = new MemoryUsers();
  const verifications = new MemoryVerifications();
  const hasher = new FakeHasher();
  const mailer = new FakeMailer();
  const jwt = new JwtService({ secret: 's3cret-'.repeat(8), signOptions: { expiresIn: '7d' } });
  const tokens = new JwtTokenService(jwt);
  const limiter = new InMemoryRateLimiter(() => clock.now);
  const accounts = new AccountService(users, verifications, new OneTimeCodes(hasher, verifications), hasher, tokens, mailer, new RecordingEvents(), limiter, new MemoryRecentSignIns(() => clock.now), new MemoryOrganizations());
  const authenticator = new Authenticator(tokens, users, new MemoryOrganizations());

  async function addUser(email: string, password: string, name = 'Lan An') {
    const user = User.registerStudent({ email: Email.of(email), displayName: DisplayName.of(name), phone: null, passwordHash: await hasher.hash(password) });
    await users.save(user);
    return user;
  }
  return { clock, users, verifications, hasher, mailer, jwt, tokens, limiter, accounts, authenticator, addUser };
}

const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const kind = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.kind);

// ---------------------------------------------------------------- sign-in throttling

test('wrong passwords are limited per account and IP; the right password is refused while blocked', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let i = 0; i < 10; i++) assert.equal(await outcome(t.accounts.login('lan@truong.vn', 'sai', '10.0.0.1')), 'identity.bad_credentials');

  assert.equal(await kind(t.accounts.login('lan@truong.vn', 'dung-mat-khau', '10.0.0.1')), 'rate_limited', 'even the right password waits');
  await assert.rejects(t.accounts.login('lan@truong.vn', 'dung-mat-khau', '10.0.0.1'), (e: DomainError) => /thử lại sau \d+ phút/.test(e.message) && Number(e.details?.retryAfterSeconds) > 0);

  // The block is for that IP only: the account owner elsewhere is not locked out.
  await t.accounts.login('lan@truong.vn', 'dung-mat-khau', '10.0.0.2');
  // ...and it ends by itself.
  t.clock.now += 10 * 60_000 + 1;
  await t.accounts.login('lan@truong.vn', 'dung-mat-khau', '10.0.0.1');
});

/** Background work (emails) starts on the next turn of the event loop. */
const settle = () => new Promise((resolve) => setImmediate(resolve));
/** The account-wide cap on wrong passwords (all IPs together). */
const CAP = LOGIN_PER_ACCOUNT.limit;
const ip = (i: number) => `198.51.${Math.floor(i / 250)}.${i % 250}`;

test('the first sign-in with an unknown address costs no more hashing than any later one', async () => {
  const t = setup();
  await settle();
  const before = t.hasher.hashes;
  await outcome(t.accounts.login('khong-co@truong.vn', 'x', '10.0.0.1'));
  assert.equal(t.hasher.hashes - before, 0, 'the decoy hash was made at start-up, not on this request');
});

test('guesses spread over many IPs are capped per account', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let i = 0; i < CAP; i++) assert.equal(await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(i))), 'identity.bad_credentials');

  assert.equal(await kind(t.accounts.login('lan@truong.vn', 'sai', ip(CAP))), 'rate_limited');
  assert.equal(await kind(t.accounts.login('lan@truong.vn', 'dung-mat-khau', ip(CAP + 1))), 'rate_limited', 'a new IP cannot get in, even with the password');
  assert.equal(await outcome(t.accounts.login('khac@truong.vn', 'sai', ip(CAP + 2))), 'identity.bad_credentials', 'other accounts are not affected');
  // unknown addresses are capped the same way, so the cap does not reveal which accounts exist
  for (let i = 0; i < CAP; i++) await outcome(t.accounts.login('khong-co@truong.vn', 'sai', ip(i)));
  assert.equal(await kind(t.accounts.login('khong-co@truong.vn', 'sai', ip(CAP))), 'rate_limited');
});

test('one IP guessing as fast as it is allowed cannot fill the account-wide cap (R2-F2)', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let window = 0; window < 6; window++) { // six 10-minute windows from one address, at its per-account limit
    if (window > 0) t.clock.now += 10 * 60_000 + 1;
    for (let i = 0; i < 10; i++) assert.equal(await outcome(t.accounts.login('lan@truong.vn', 'sai', '198.51.100.66')), 'identity.bad_credentials');
  }
  // all 60 guesses are still inside the hour the account-wide limit looks at
  await t.accounts.login('lan@truong.vn', 'dung-mat-khau', '203.0.113.200');
});

test('while the account is under attack, its owner still signs in from an address they used before', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  await t.accounts.login('lan@truong.vn', 'dung-mat-khau', '203.0.113.7');
  for (let i = 0; i < CAP + 10; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(i)));

  await t.accounts.login('lan@truong.vn', 'dung-mat-khau', '203.0.113.7');
});

test('the owner is emailed once when sign-in is blocked for their account; unknown addresses get no email', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let i = 0; i < CAP + 30; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(i)));
  for (let i = 0; i < CAP + 30; i++) await outcome(t.accounts.login('khong-co@truong.vn', 'sai', ip(i)));
  await settle();
  assert.deepEqual(t.mailer.sent.map((m) => [m.kind, m.to]), [['sign-in-blocked', 'lan@truong.vn']]);
});

test('resetting the password lifts the account-wide block', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let i = 0; i < CAP + 10; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(i)));
  const ticket = await t.accounts.forgotPassword('lan@truong.vn');
  await settle();
  const link = t.mailer.sent.find((m) => m.kind === 'reset')!.token!;
  await t.accounts.resetPassword(ticket.verificationId, link, 'mat-khau-moi', '203.0.113.50');

  await t.accounts.login('lan@truong.vn', 'mat-khau-moi', ip(700));
});

test('after a reset the attacker cannot lock the owner out again from the address the reset was done from (R2-F2)', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let i = 0; i < CAP + 10; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(i)));
  const ticket = await t.accounts.forgotPassword('lan@truong.vn');
  await settle();
  await t.accounts.resetPassword(ticket.verificationId, t.mailer.sent.find((m) => m.kind === 'reset')!.token!, 'mat-khau-moi', '203.0.113.50');

  for (let i = 0; i < CAP + 10; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(300 + i))); // the cap is full again
  await t.accounts.login('lan@truong.vn', 'mat-khau-moi', '203.0.113.50');
});

test('throttled sign-ins are logged without the email address', async (ctx) => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  const warn = ctx.mock.method(Logger.prototype, 'warn', () => {});

  for (let i = 0; i < 12; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', '10.0.0.1'));
  for (let i = 0; i < 300; i++) await outcome(t.accounts.login(`nguoi${i}@truong.vn`, 'x', '10.0.0.9'));

  const logged = warn.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(logged.some((m) => m.includes('Too many sign-in attempts')), 'the per-account and per-IP blocks are still logged');
  for (const message of logged) assert.doesNotMatch(message, /@|lan|nguoi/, `no address in: ${message}`);
});

test('a successful sign-in clears the failures', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  for (let i = 0; i < 9; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', '10.0.0.1'));
  await t.accounts.login('lan@truong.vn', 'dung-mat-khau', '10.0.0.1');
  for (let i = 0; i < 9; i++) assert.equal(await outcome(t.accounts.login('lan@truong.vn', 'sai', '10.0.0.1')), 'identity.bad_credentials');
});

test('parallel wrong guesses are cut off just like sequential ones', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  const before = t.hasher.verifications;

  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => outcome(t.accounts.login('lan@truong.vn', `sai-${i}`, '10.0.0.1'))));

  assert.equal(results.filter((r) => r === 'identity.bad_credentials').length, 10);
  assert.equal(results.filter((r) => r === 'identity.too_many_attempts').length, 50);
  assert.equal(t.hasher.verifications - before, 10, 'refused attempts never reached the password check');
});

test('one IP trying many different accounts (password spraying) is stopped as well', async () => {
  const t = setup();
  for (let i = 0; i < 300; i++) assert.equal(await outcome(t.accounts.login(`nguoi${i}@truong.vn`, 'x', '10.0.0.9')), 'identity.bad_credentials');
  assert.equal(await kind(t.accounts.login('nguoi999@truong.vn', 'x', '10.0.0.9')), 'rate_limited');
  assert.equal(await outcome(t.accounts.login('nguoi999@truong.vn', 'x', '10.0.0.10')), 'identity.bad_credentials', 'other IPs are untouched');
});

test('a class signing in from one school IP does not run into the limits', async () => {
  const t = setup();
  for (let i = 0; i < 400; i++) await t.addUser(`hs${i}@truong.vn`, `mk-${i}`, `Hoc Sinh ${i}`);
  for (let i = 0; i < 400; i += 20) {
    // 20 students at a time, 400 in total, all behind the same address: successes are not counted
    const results = await Promise.all(Array.from({ length: 20 }, (_, j) => outcome(t.accounts.login(`hs${i + j}@truong.vn`, `mk-${i + j}`, '203.0.113.7'))));
    assert.deepEqual([...new Set(results)], ['ok']);
  }
});

test('an unknown address costs the same password work and gets the same answer as a wrong password', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  const failure = (p: Promise<unknown>) => p.then(() => assert.fail('should have been refused'), (e: DomainError) => e);
  const wrong = await failure(t.accounts.login('lan@truong.vn', 'sai', '10.0.0.1'));
  const before = t.hasher.verifications;
  const unknown = await failure(t.accounts.login('khong-co@truong.vn', 'sai', '10.0.0.1'));

  assert.equal(t.hasher.verifications - before, 1, 'a password comparison happened even though there is no such account');
  assert.equal(unknown.code, wrong.code);
  assert.equal(unknown.message, wrong.message);
});

// ---------------------------------------------------------------- forgot password

test('forgot password answers real and unknown addresses alike, also when asked again', async () => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');

  const real = [await t.accounts.forgotPassword('that@truong.vn'), await t.accounts.forgotPassword('that@truong.vn')];
  const ghost = [await t.accounts.forgotPassword('khong-co@truong.vn'), await t.accounts.forgotPassword('khong-co@truong.vn')];

  for (const pair of [real, ghost]) {
    assert.equal(pair[0].verificationId, pair[1].verificationId, 'the second request within the cooldown gets the same ticket, not an error');
    assert.equal(pair[0].resendAvailableAt, pair[1].resendAvailableAt);
  }
  assert.deepEqual(Object.keys(real[0]).sort(), Object.keys(ghost[0]).sort());
  assert.notEqual(real[0].verificationId, ghost[0].verificationId);
  await settle();
  assert.deepEqual(t.mailer.sent.map((m) => [m.kind, m.to]), [['reset', 'that@truong.vn']], 'one email, to the real address only');
});

/** What a caller can observe: the answer's code and message, or the shape of the ticket. */
const observe = (p: Promise<{ verificationId: string } | unknown>) =>
  p.then((r) => ['ok', Object.keys(r as object).sort().join(',')], (e: DomainError) => [e.code, e.message]);

function cooldownOver(t: ReturnType<typeof setup>, verificationId: string) {
  t.verifications.rows.get(verificationId)!.lastSentAt = new Date(Date.now() - 61_000);
}

test('follow-ups on a forgot-password ticket answer unknown addresses exactly like real ones', async () => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');
  const real = await t.accounts.forgotPassword('that@truong.vn');
  const ghost = await t.accounts.forgotPassword('khong-co@truong.vn');

  // resend within the cooldown
  assert.deepEqual(await observe(t.accounts.resendCode(ghost.verificationId)), await observe(t.accounts.resendCode(real.verificationId)));
  // resend after the cooldown
  cooldownOver(t, real.verificationId);
  cooldownOver(t, ghost.verificationId);
  assert.deepEqual(await observe(t.accounts.resendCode(ghost.verificationId)), await observe(t.accounts.resendCode(real.verificationId)));
  // a wrong code, twice: same error, same attempts left
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      await observe(t.accounts.resetPassword(ghost.verificationId, 'y'.repeat(43), 'mat-khau-moi', '10.0.0.1')),
      await observe(t.accounts.resetPassword(real.verificationId, 'y'.repeat(43), 'mat-khau-moi', '10.0.0.1')),
    );
  }
  await settle();
  assert.equal(t.mailer.sent.length, 2, 'the real account got its code and the resent one');
  assert.ok(t.mailer.sent.every((m) => m.to === 'that@truong.vn'), 'nothing is ever mailed to an address without an account');
});

test('signing up with an address that already has an account looks exactly like a new sign-up', async () => {
  const t = setup();
  const owner = await t.addUser('that@truong.vn', 'mat-khau-1');
  const input = (email: string) => ({ email, displayName: 'Ke La', phone: null, password: 'mat-khau-2' });

  const taken = await observe(t.accounts.requestRegistration(input('that@truong.vn'), null));
  const fresh = await observe(t.accounts.requestRegistration(input('moi@truong.vn'), null));
  assert.deepEqual(taken, fresh);

  const takenTicket = (await t.verifications.findOpen(Email.of('that@truong.vn'), 'REGISTER_STUDENT'))!.id;
  const freshTicket = (await t.verifications.findOpen(Email.of('moi@truong.vn'), 'REGISTER_STUDENT'))!.id;
  // asking again within the cooldown, by sign-up and by resend
  assert.deepEqual(await observe(t.accounts.requestRegistration(input('that@truong.vn'), null)), await observe(t.accounts.requestRegistration(input('moi@truong.vn'), null)));
  assert.deepEqual(await observe(t.accounts.resendCode(takenTicket)), await observe(t.accounts.resendCode(freshTicket)));
  // after the cooldown
  cooldownOver(t, takenTicket);
  cooldownOver(t, freshTicket);
  assert.deepEqual(await observe(t.accounts.resendCode(takenTicket)), await observe(t.accounts.resendCode(freshTicket)));
  // a wrong code
  assert.deepEqual(await observe(t.accounts.completeRegistration(takenTicket, '000000')), await observe(t.accounts.completeRegistration(freshTicket, '000000')));

  // The owner is told someone tried to sign up with their address, and is never sent a code that could open anything.
  const toOwner = t.mailer.sent.filter((m) => m.to === 'that@truong.vn');
  assert.ok(toOwner.length > 0 && toOwner.every((m) => m.kind === 'account-exists' && m.code === ''));
  assert.equal((await t.users.findByEmail(Email.of('that@truong.vn')))?.passwordHash, owner.passwordHash, 'the existing account is untouched');
});

test('parallel resends of one ticket send one new email; the others are told to wait', async () => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');
  const ticket = await t.accounts.forgotPassword('that@truong.vn');
  cooldownOver(t, ticket.verificationId);
  await settle();
  const before = t.mailer.sent.length;

  const results = await Promise.all(Array.from({ length: 5 }, () => outcome(t.accounts.resendCode(ticket.verificationId))));
  await settle();
  assert.deepEqual(results.sort(), ['identity.resend_too_soon', 'identity.resend_too_soon', 'identity.resend_too_soon', 'identity.resend_too_soon', 'ok']);
  assert.equal(t.mailer.sent.length - before, 1);
  assert.equal(t.verifications.rows.get(ticket.verificationId)!.linkHash, `fake$${t.mailer.sent.at(-1)!.token}`, 'the stored link is the one that was sent');
});

test('a resend that loaded the ticket just before its code was used cannot reopen it', async (ctx) => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');
  const ticket = await t.accounts.forgotPassword('that@truong.vn');
  await settle();
  cooldownOver(t, ticket.verificationId);
  const loadedBeforeUse = await t.verifications.findById(ticket.verificationId);

  await t.accounts.resetPassword(ticket.verificationId, t.mailer.sent[0].token!, 'mat-khau-moi', '10.0.0.1');
  ctx.mock.method(t.verifications, 'findById', async () => loadedBeforeUse, { times: 1 });
  assert.equal(await outcome(t.accounts.resendCode(ticket.verificationId)), 'identity.invalid_code');
  await settle();

  assert.ok(t.verifications.rows.get(ticket.verificationId)!.consumedAt, 'the spent ticket stays spent');
  assert.equal(t.mailer.sent.length, 1, 'no new code was sent for it');
});

test('resending a teacher invitation that was accepted meanwhile does not reopen it', async (ctx) => {
  const t = setup();
  const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;
  const team = new TeamService(t.users, t.verifications, new OneTimeCodes(t.hasher, t.verifications), t.hasher, t.tokens, t.mailer, new RecordingEvents(), config, new MemoryOrganizations());
  const invitation = await team.invite({ email: 'gv@truong.vn', displayName: 'Co Mai', phone: null });
  cooldownOver(t, invitation.id);
  const loadedBeforeAccept = await t.verifications.findById(invitation.id);

  await team.acceptInvitation(invitation.id, t.mailer.sent[0].code, 'mat-khau-giao-vien');
  ctx.mock.method(t.verifications, 'findById', async () => loadedBeforeAccept, { times: 1 });
  assert.equal(await kind(team.resendInvitation(invitation.id)), 'validation');

  assert.ok(t.verifications.rows.get(invitation.id)!.consumedAt, 'the accepted invitation stays spent');
  assert.equal(t.mailer.sent.length, 1);
});

// ---------------------------------------------------------------- guessing budgets and secrets in links

test('sign-up codes cannot be guessed by asking for new ones: wrong codes are counted per address across resends (R4-N1)', async () => {
  const t = setup();
  const signUp = () => t.accounts.requestRegistration({ email: 'nan-nhan@truong.vn', displayName: 'Ke La', phone: null, password: 'mat-khau-ke-la' }, null);
  await signUp();
  let ticket = (await t.verifications.findOpen(Email.of('nan-nhan@truong.vn'), 'REGISTER_STUDENT'))!.id;
  let wrong = 0;
  for (let round = 0; round < 4; round++) { // each round: 5 wrong codes, then a fresh code by resend or a new sign-up
    for (let i = 0; i < 5; i++, wrong++) assert.equal(await outcome(t.accounts.completeRegistration(ticket, '000000')), 'identity.wrong_code');
    cooldownOver(t, ticket);
    if (round % 2 === 0) await t.accounts.resendCode(ticket);
    else {
      await signUp();
      ticket = (await t.verifications.findOpen(Email.of('nan-nhan@truong.vn'), 'REGISTER_STUDENT'))!.id;
    }
  }
  assert.equal(wrong, SIGNUP_CODES.limit);
  const right = t.mailer.sent.at(-1)!.code;
  assert.equal(await kind(t.accounts.completeRegistration(ticket, right)), 'rate_limited', 'even the right code waits once the budget is spent');

  await t.accounts.requestRegistration({ email: 'khac@truong.vn', displayName: 'Hoc Sinh', phone: null, password: 'mat-khau-1' }, null);
  const other = (await t.verifications.findOpen(Email.of('khac@truong.vn'), 'REGISTER_STUDENT'))!.id;
  await t.accounts.completeRegistration(other, t.mailer.sent.at(-1)!.code); // other addresses are not affected

  t.clock.now += SIGNUP_CODES.windowMs + 1;
  await t.accounts.completeRegistration(ticket, right); // and the budget comes back
});

test('a correct sign-up code and a spent ticket do not use the budget', async () => {
  const t = setup();
  for (let i = 0; i < SIGNUP_CODES.limit + 5; i++) {
    await t.accounts.requestRegistration({ email: `hs${i}@truong.vn`, displayName: 'Hoc Sinh', phone: null, password: 'mat-khau-1' }, null);
  }
  // one address signing up, finishing, and a stale form re-submitting the spent ticket many times
  await t.accounts.requestRegistration({ email: 'lan@truong.vn', displayName: 'Lan', phone: null, password: 'mat-khau-1' }, null);
  const ticket = (await t.verifications.findOpen(Email.of('lan@truong.vn'), 'REGISTER_STUDENT'))!.id;
  await t.accounts.completeRegistration(ticket, t.mailer.sent.at(-1)!.code);
  for (let i = 0; i < SIGNUP_CODES.limit + 5; i++) assert.equal(await outcome(t.accounts.completeRegistration(ticket, '000000')), 'identity.invalid_code');
});

test('the teacher invitation link keeps its code out of the query string (R4-N3)', async () => {
  const t = setup();
  const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;
  const team = new TeamService(t.users, t.verifications, new OneTimeCodes(t.hasher, t.verifications), t.hasher, t.tokens, t.mailer, new RecordingEvents(), config, new MemoryOrganizations());
  const invitation = await team.invite({ email: 'gv@truong.vn', displayName: 'Co Mai', phone: null });
  const mail = t.mailer.sent[0];
  const url = new URL(mail.url!);
  assert.equal(url.searchParams.get('code'), null, 'no code in the query string, which servers log');
  assert.equal(url.searchParams.get('id'), invitation.id);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('c'), mail.code, 'the code travels in the fragment');
});

// ---------------------------------------------------------------- reset by emailed link only; sign-up by code only

test('a password reset needs the emailed link: the email carries no code, and nothing a guesser can type works (R3-N2)', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'mat-khau-cu');
  const ticket = await t.accounts.forgotPassword('lan@truong.vn');
  await settle();
  const mail = t.mailer.sent.find((m) => m.kind === 'reset')!;
  assert.equal(mail.code, '', 'no code in the reset email');
  assert.match(mail.token!, /^[A-Za-z0-9_-]{43}$/);

  // Every 6-digit code, as if guessed, is refused: the reset is never decided by a code.
  for (const guess of ['000000', '123456', '999999']) {
    assert.equal(await outcome(t.accounts.resetPassword(ticket.verificationId, guess, 'ke-gian', '198.51.100.66')), 'identity.invalid_code');
  }
  // Wrong links spend nothing either: the real link still works afterwards.
  for (let i = 0; i < 10; i++) await outcome(t.accounts.resetPassword(ticket.verificationId, 'y'.repeat(43), 'ke-gian', '198.51.100.66'));
  await t.accounts.resetPassword(ticket.verificationId, mail.token!, 'mat-khau-moi', '10.0.0.1');
  await t.accounts.login('lan@truong.vn', 'mat-khau-moi', '10.0.0.1');
});

test('a sign-up email carries no link, so the mailbox owner cannot be made to confirm a stranger\'s sign-up (R3-N1)', async () => {
  const t = setup();
  await t.accounts.requestRegistration({ email: 'nan-nhan@truong.vn', displayName: 'Ke La', phone: null, password: 'mat-khau-ke-la' }, null);
  const ticket = (await t.verifications.findOpen(Email.of('nan-nhan@truong.vn'), 'REGISTER_STUDENT'))!;
  cooldownOver(t, ticket.id);
  await t.accounts.resendCode(ticket.id);

  for (const mail of t.mailer.sent) assert.equal(mail.token, undefined, `no link in the ${mail.kind} email`);
  assert.equal(t.verifications.rows.get(ticket.id)!.linkHash, null, 'no link secret is stored for a sign-up');
  // the only way in is the code, typed on the screen that asked for it
  const done = await t.accounts.completeRegistration(ticket.id, t.mailer.sent.at(-1)!.code);
  assert.equal(done.user.email, 'nan-nhan@truong.vn');
});

test('the reset link works once; the link of an earlier email does not; wrong links answer real and unknown addresses alike', async () => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');
  const real = await t.accounts.forgotPassword('that@truong.vn');
  const ghost = await t.accounts.forgotPassword('khong-co@truong.vn');
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(
      await observe(t.accounts.resetPassword(ghost.verificationId, 'y'.repeat(43), 'mat-khau-moi', '10.0.0.1')),
      await observe(t.accounts.resetPassword(real.verificationId, 'y'.repeat(43), 'mat-khau-moi', '10.0.0.1')),
    );
  }
  await settle();
  const first = t.mailer.sent.find((m) => m.kind === 'reset')!.token!;
  cooldownOver(t, real.verificationId);
  await t.accounts.resendCode(real.verificationId);
  await settle();
  const second = t.mailer.sent.at(-1)!.token!;
  assert.notEqual(second, first);

  assert.equal(await outcome(t.accounts.resetPassword(real.verificationId, first, 'mat-khau-moi', '10.0.0.1')), 'identity.invalid_code', 'the earlier link stopped working');
  await t.accounts.resetPassword(real.verificationId, second, 'mat-khau-moi', '10.0.0.1');
  assert.equal(await outcome(t.accounts.resetPassword(real.verificationId, second, 'mat-khau-khac', '10.0.0.1')), 'identity.invalid_code', 'used once');
});

test('after the cooldown a real account is sent a fresh link on the same ticket', async () => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');
  const first = await t.accounts.forgotPassword('that@truong.vn');
  const row = t.verifications.rows.get(first.verificationId)!;
  row.lastSentAt = new Date(Date.now() - 61_000);

  const second = await t.accounts.forgotPassword('that@truong.vn');
  assert.equal(second.verificationId, first.verificationId);
  await settle();
  assert.equal(t.mailer.sent.length, 2);
  const stored = t.verifications.rows.get(first.verificationId)!; // saving replaces the stored row
  assert.equal(stored.linkHash, `fake$${t.mailer.sent[1].token}`, 'the ticket now opens with the link of the second email');
});

test('a failing mail server does not change the answer (and cannot reveal whether the account exists)', async () => {
  const t = setup();
  await t.addUser('that@truong.vn', 'mat-khau-1');
  t.mailer.sendPasswordResetLink = async () => { throw DomainError.conflict('mail.send_failed', 'smtp down'); };
  const ticket = await t.accounts.forgotPassword('that@truong.vn');
  assert.ok(ticket.verificationId);
});

// ---------------------------------------------------------------- sessions end with the credentials

test('a token stops working when the password is reset, and the new one works', async () => {
  const t = setup();
  const user = await t.addUser('lan@truong.vn', 'mat-khau-cu');
  const { accessToken: oldToken } = await t.accounts.login('lan@truong.vn', 'mat-khau-cu', '10.0.0.1');
  assert.deepEqual(await t.authenticator.authenticate(oldToken), { id: user.id, role: 'STUDENT', name: 'Lan An', organizations: [] });

  const ticket = await t.accounts.forgotPassword('lan@truong.vn');
  await settle();
  const { accessToken: newToken } = await t.accounts.resetPassword(ticket.verificationId, t.mailer.sent[0].token!, 'mat-khau-moi', '10.0.0.1');

  assert.equal(await t.authenticator.authenticate(oldToken), null, 'a stolen session does not survive a password reset');
  assert.equal((await t.authenticator.authenticate(newToken))?.id, user.id);
});

test('the token of a deleted user stops working', async () => {
  const t = setup();
  const user = await t.addUser('lan@truong.vn', 'mat-khau-cu');
  const { accessToken } = await t.accounts.login('lan@truong.vn', 'mat-khau-cu', '10.0.0.1');
  assert.ok(await t.authenticator.authenticate(accessToken));
  await t.users.delete(user.id);
  assert.equal(await t.authenticator.authenticate(accessToken), null);
});

test('tokens that are forged, expired, or issued before credentials were bound in are refused', async () => {
  const t = setup();
  const user = await t.addUser('lan@truong.vn', 'mat-khau-cu');

  const legacy = await t.jwt.signAsync({ sub: user.id, role: 'ADMIN', name: 'Lan An' }); // old format, no credential claim
  assert.equal(await t.authenticator.authenticate(legacy), null);
  assert.equal(await t.authenticator.authenticate('not.a.token'), null);

  const other = new JwtService({ secret: 'another-secret-'.repeat(4) });
  const forged = await other.signAsync({ sub: user.id, role: 'ADMIN', name: 'x', cv: t.tokens.credentialOf(user) });
  assert.equal(await t.authenticator.authenticate(forged), null);

  const expired = await t.jwt.signAsync({ sub: user.id, role: 'STUDENT', name: 'x', cv: t.tokens.credentialOf(user) }, { expiresIn: '-1s' });
  assert.equal(await t.authenticator.authenticate(expired), null);
});

test('the actor comes from the account, not from what the token claims', async () => {
  const t = setup();
  const user = await t.addUser('lan@truong.vn', 'mat-khau-cu');
  const lying = await t.jwt.signAsync({ sub: user.id, role: 'ADMIN', name: 'Quản trị', cv: t.tokens.credentialOf(user) });
  assert.deepEqual(await t.authenticator.authenticate(lying), { id: user.id, role: 'STUDENT', name: 'Lan An', organizations: [] });
});

// ---------------------------------------------------------------- the administrator account

test('production refuses to create the administrator with a weak or well-known password', async () => {
  for (const weak of ['admin12345', 'password123', 'short-pw']) {
    const t = setup();
    await assert.rejects(t.accounts.ensureAdmin('admin@truong.vn', weak, 'Quản trị', { strict: true }), /Refusing to create the administrator/);
    assert.equal(await t.users.adminExists(), false, 'and nothing was created');
  }
  const t = setup();
  await t.accounts.ensureAdmin('admin@truong.vn', 'a-long-admin-password', 'Quản trị', { strict: true });
  assert.equal(await t.users.adminExists(), true);
});

test('creating the administrator logs no full email address (R2-F5)', async (ctx) => {
  const t = setup();
  const log = ctx.mock.method(Logger.prototype, 'log', () => {});
  ctx.mock.method(Logger.prototype, 'warn', () => {});
  await t.accounts.ensureAdmin('quan.tri@truong.vn', 'a-long-admin-password', 'Quản trị');
  const logged = log.mock.calls.map((c) => String(c.arguments[0]));
  assert.ok(logged.some((m) => m.includes('Created administrator account')));
  for (const m of logged) assert.doesNotMatch(m, /quan\.tri/);
});

test('if the start-up decoy hash fails, unknown addresses still get the same 401 as wrong passwords (R2-F6)', async () => {
  const t = setup();
  let first = true;
  const flaky = Object.assign(Object.create(Object.getPrototypeOf(t.hasher)), t.hasher, {
    hash: async (plain: string) => { if (first) { first = false; throw new Error('scrypt failed'); } return t.hasher.hash(plain); },
  });
  const accounts = new AccountService(t.users, t.verifications, new OneTimeCodes(flaky, t.verifications), flaky, t.tokens, t.mailer, new RecordingEvents(), t.limiter, new MemoryRecentSignIns(() => t.clock.now), new MemoryOrganizations());
  await t.addUser('lan@truong.vn', 'dung-mat-khau');
  assert.equal(await outcome(accounts.login('khong-co@truong.vn', 'x', '10.0.0.1')), 'identity.bad_credentials');
  assert.equal(await outcome(accounts.login('lan@truong.vn', 'x', '10.0.0.1')), 'identity.bad_credentials');
});

test('a password reset ends the exemptions of addresses that signed in before it (R3-N5)', async () => {
  const t = setup();
  await t.addUser('lan@truong.vn', 'mat-khau-cu');
  await t.accounts.login('lan@truong.vn', 'mat-khau-cu', '203.0.113.7'); // say this address was the attacker's
  const ticket = await t.accounts.forgotPassword('lan@truong.vn');
  await settle();
  await t.accounts.resetPassword(ticket.verificationId, t.mailer.sent.find((m) => m.kind === 'reset')!.token!, 'mat-khau-moi', '198.51.100.20');

  for (let i = 0; i < CAP; i++) await outcome(t.accounts.login('lan@truong.vn', 'sai', ip(i)));
  assert.equal(await kind(t.accounts.login('lan@truong.vn', 'mat-khau-moi', '203.0.113.7')), 'rate_limited', 'the old address is no longer exempt');
  await t.accounts.login('lan@truong.vn', 'mat-khau-moi', '198.51.100.20'); // the address the reset came from is
});

test('development still accepts the documented default admin password, and an existing admin is never touched', async () => {
  const t = setup();
  await t.accounts.ensureAdmin('admin@truong.vn', 'admin12345', 'Quản trị');
  assert.equal(await t.users.adminExists(), true);

  // the account exists already: a weak ADMIN_PASSWORD left in the environment no longer matters
  await t.accounts.ensureAdmin('admin@truong.vn', 'admin12345', 'Quản trị', { strict: true });
  assert.equal([...t.users.rows.values()].filter((u) => u.role === 'ADMIN').length, 1);
});
