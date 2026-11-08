import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { OneTimeCodes } from '../src/modules/identity/application/one-time-codes.js';
import { Email } from '../src/modules/identity/domain/user.js';
import { MAX_ATTEMPTS, Verification } from '../src/modules/identity/domain/verification.js';
import { ScryptPasswordHasher } from '../src/modules/identity/infrastructure/security.js';
import { MemoryVerifications } from './support/identity-fakes.js';

/** The real scrypt hasher, counting how many guesses were actually evaluated. */
class CountingHasher extends ScryptPasswordHasher {
  verifications = 0;
  override async verify(plain: string, stored: string) {
    this.verifications++;
    return super.verify(plain, stored);
  }
}

const SECRET = '424242';

async function given() {
  const hasher = new CountingHasher();
  const repo = new MemoryVerifications();
  const codes = new OneTimeCodes(hasher, repo);
  const v = Verification.issue('RESET_PASSWORD', Email.of('admin@oj.local'), {}, await hasher.hash(SECRET));
  await repo.save(v);
  return { hasher, repo, codes, id: v.id };
}

const guessWith = (codes: OneTimeCodes, id: string, code: string) =>
  codes.load(id).then((v) => codes.check(v, code)).then(() => 'accepted' as const, (e: DomainError) => e.code);

const wrongGuesses = (n: number) => Array.from({ length: n }, (_, i) => String(100000 + i));

test('sequentially, the code is locked after the allowed wrong attempts', async () => {
  const { codes, id, hasher } = await given();
  const results: string[] = [];
  for (const guess of [...wrongGuesses(MAX_ATTEMPTS), SECRET]) results.push(await guessWith(codes, id, guess));
  assert.deepEqual(results, [...Array(MAX_ATTEMPTS).fill('identity.wrong_code'), 'identity.invalid_code']);
  assert.equal(hasher.verifications, MAX_ATTEMPTS, 'the refused guess was never even evaluated');
});

test('parallel guesses cannot exceed the attempt budget: the right code sent 300th is refused', async () => {
  const { codes, id, hasher } = await given();
  const guesses = [...wrongGuesses(299), SECRET];

  const results = await Promise.all(guesses.map((g) => guessWith(codes, id, g)));

  assert.equal(results.at(-1), 'identity.invalid_code', 'the right code arrived after the budget was spent');
  assert.ok(!results.includes('accepted'));
  assert.equal(hasher.verifications, MAX_ATTEMPTS, `only ${MAX_ATTEMPTS} guesses may ever be evaluated, got ${hasher.verifications}`);
  assert.equal(results.filter((r) => r === 'identity.wrong_code').length, MAX_ATTEMPTS);
});

test('the right code is still accepted when it is within the budget, even under a parallel burst', async () => {
  const { codes, id } = await given();
  // the right code is the 2nd to be claimed; the other guesses are wrong
  const first = guessWith(codes, id, '000001');
  const right = guessWith(codes, id, SECRET);
  const rest = wrongGuesses(40).map((g) => guessWith(codes, id, g));
  const results = await Promise.all([first, right, ...rest]);
  assert.equal(results.filter((r) => r === 'accepted').length, 1);
});

test('a code can be used once, even when it is sent twice at the same moment', async () => {
  const { codes, id } = await given();
  const results = await Promise.all([guessWith(codes, id, SECRET), guessWith(codes, id, SECRET), guessWith(codes, id, SECRET)]);
  assert.equal(results.filter((r) => r === 'accepted').length, 1, JSON.stringify(results));
});

test('a code reissued while a guess was being checked cannot be spent by that guess', async () => {
  const { codes, id, repo, hasher } = await given();
  const claimed = await repo.claimAttempt(id);
  assert.ok(claimed);
  // The user asked for a new code in the meantime.
  const fresh = (await repo.findById(id))!;
  fresh.reissue(await hasher.hash('999999'), new Date(Date.now() + 61_000));
  await repo.save(fresh);

  claimed.consume();
  assert.equal(await repo.consume(claimed), false, 'the old code no longer opens anything');
  void codes;
});

test('a spent or unknown verification is refused without evaluating the guess', async () => {
  const { codes, id, hasher, repo } = await given();
  assert.equal(await guessWith(codes, id, SECRET), 'accepted');
  const before = hasher.verifications;
  assert.equal(await guessWith(codes, id, SECRET), 'identity.invalid_code');
  assert.equal(hasher.verifications, before);

  repo.rows.clear();
  await assert.rejects(codes.load(id), /Mã xác thực/);
});

test('NEGATIVE CONTROL: the old compare-then-save protocol is beaten by the same burst', async () => {
  // Verbatim shape of the previous implementation: load, compare, then record the attempt and save.
  const { id, repo, hasher } = await given();
  const legacyCheck = async (code: string) => {
    const v = (await repo.findById(id))!;
    const matches = v.isUsable() && (await hasher.verify(code, v.snapshot.codeHash));
    if (matches) {
      v.consume();
    } else {
      try { v.claimAttempt(); } catch { /* locked */ }
    }
    await repo.save(v);
    return matches;
  };

  const outcomes = await Promise.all([...wrongGuesses(299), SECRET].map((g) => legacyCheck(g)));

  assert.equal(outcomes.at(-1), true, 'this is the account takeover: the 300th guess was accepted');
  assert.ok(hasher.verifications > MAX_ATTEMPTS * 10, `and ${hasher.verifications} guesses were evaluated against a budget of ${MAX_ATTEMPTS}`);
});
