import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { DataSource } from 'typeorm';
import { throwaway } from './support/throwaway.js';
import { DomainError } from '../src/shared/domain/domain-error.js';
import { DisplayName, Email, User } from '../src/modules/identity/domain/user.js';
import { MAX_ATTEMPTS, Verification } from '../src/modules/identity/domain/verification.js';
import { TypeOrmUserRepository, TypeOrmVerificationRepository } from '../src/modules/identity/infrastructure/typeorm-user.repository.js';
import { UserOrmEntity, VerificationOrmEntity } from '../src/modules/identity/infrastructure/user.orm-entity.js';
import { LOST_RESULT_MESSAGE, SourceCode, Submission } from '../src/modules/judging/domain/submission.js';
import { SubmissionOrmEntity } from '../src/modules/judging/infrastructure/submission.orm-entity.js';
import { TypeOrmSubmissionRepository } from '../src/modules/judging/infrastructure/typeorm-submission.repository.js';

/**
 * Proves the atomic statements are atomic in PostgreSQL itself (the in-memory fakes only model it).
 * Runs in a throwaway schema of TEST_DATABASE_URL on the throwaway stack (see test/support/throwaway.ts):
 *   pnpm infra:test:up   then   pnpm test:integration
 */
const { url, skip } = throwaway('TEST_DATABASE_URL');

describe('PostgreSQL', { skip }, () => {
  const schema = `oj_test_${randomBytes(4).toString('hex')}`;
  let admin: DataSource;
  let ds: DataSource;
  let verifications: TypeOrmVerificationRepository;
  let submissions: TypeOrmSubmissionRepository;

  before(async () => {
    admin = new DataSource({ type: 'postgres', url });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({ type: 'postgres', url, schema, entities: [UserOrmEntity, VerificationOrmEntity, SubmissionOrmEntity], synchronize: true });
    await ds.initialize();
    verifications = new TypeOrmVerificationRepository(ds.getRepository(VerificationOrmEntity));
    submissions = new TypeOrmSubmissionRepository(ds.getRepository(SubmissionOrmEntity));
  });

  after(async () => {
    await ds?.destroy();
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.destroy();
  });

  // ---------------------------------------------------------------- one-time codes

  const issue = async (hash = 'hash') => {
    const v = Verification.issue('RESET_PASSWORD', Email.of(`u${Math.random()}@truong.vn`), {}, hash);
    await verifications.save(v);
    return v;
  };

  test('claimAttempt: 60 parallel claims succeed exactly MAX_ATTEMPTS times', async () => {
    const v = await issue();
    const claims = await Promise.all(Array.from({ length: 60 }, () => verifications.claimAttempt(v.id)));
    const won = claims.filter((c) => c !== null);
    assert.equal(won.length, MAX_ATTEMPTS);
    assert.deepEqual(won.map((c) => c!.snapshot.attempts).sort(), [1, 2, 3, 4, 5], 'each caller got its own attempt number');
    assert.equal((await verifications.findById(v.id))!.snapshot.attempts, MAX_ATTEMPTS);
    assert.equal(await verifications.claimAttempt(v.id), null);
  });

  test('claimAttempt refuses unknown, expired and spent verifications', async () => {
    assert.equal(await verifications.claimAttempt('00000000-0000-4000-8000-000000000000'), null);

    const expired = await issue();
    assert.equal(await verifications.claimAttempt(expired.id, new Date(Date.now() + 11 * 60_000)), null);

    const spent = await issue();
    const claimed = (await verifications.claimAttempt(spent.id))!;
    claimed.consume();
    assert.equal(await verifications.consume(claimed), true);
    assert.equal(await verifications.claimAttempt(spent.id), null);
  });

  test('consume: of several parallel correct codes exactly one wins', async () => {
    const v = await issue();
    const claims = (await Promise.all(Array.from({ length: 4 }, () => verifications.claimAttempt(v.id)))).filter((c) => c !== null);
    claims.forEach((c) => c!.consume());
    const wins = await Promise.all(claims.map((c) => verifications.consume(c!)));
    assert.equal(wins.filter(Boolean).length, 1);
  });

  test('saveReissued: of several parallel resends exactly one is stored', async () => {
    const v = await issue('first');
    const loaded = await Promise.all(Array.from({ length: 5 }, () => verifications.findById(v.id)));
    const later = new Date(Date.now() + 61_000);
    const wins = await Promise.all(loaded.map((copy, i) => {
      const sentBefore = copy!.snapshot.lastSentAt;
      copy!.reissue(`hash-${i}`, later);
      return verifications.saveReissued(copy!, sentBefore);
    }));
    assert.equal(wins.filter(Boolean).length, 1);
    const stored = (await verifications.findById(v.id))!;
    assert.equal(stored.snapshot.codeHash, `hash-${wins.indexOf(true)}`, 'the stored code is the winner\'s');
  });

  test('saveReissued: a ticket spent after it was loaded is not reopened', async () => {
    const v = await issue();
    const loaded = (await verifications.findById(v.id))!;
    const claimed = (await verifications.claimAttempt(v.id))!;
    claimed.consume();
    assert.equal(await verifications.consume(claimed), true);

    const sentBefore = loaded.snapshot.lastSentAt;
    loaded.reissue('new-hash', new Date(Date.now() + 61_000));
    assert.equal(await verifications.saveReissued(loaded, sentBefore), false);
    assert.ok((await verifications.findById(v.id))!.snapshot.consumedAt, 'still spent');
  });

  test('deleteExpired removes only the given purposes past the cutoff', async () => {
    const longAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    const make = async (purpose: 'RESET_PASSWORD' | 'REGISTER_STUDENT' | 'INVITE_TEACHER', at: Date) => {
      const v = Verification.issue(purpose, Email.of(`d${Math.random()}@truong.vn`), {}, 'h', at);
      await verifications.save(v);
      return v.id;
    };
    const oldReset = await make('RESET_PASSWORD', longAgo);
    const oldInvite = await make('INVITE_TEACHER', longAgo);
    const fresh = await make('RESET_PASSWORD', new Date());

    const removed = await verifications.deleteExpired(['RESET_PASSWORD', 'REGISTER_STUDENT'], new Date(Date.now() - 24 * 60 * 60_000));
    assert.ok(removed >= 1);
    assert.equal(await verifications.findById(oldReset), null);
    assert.ok(await verifications.findById(oldInvite), 'invitations are kept');
    assert.ok(await verifications.findById(fresh), 'live tickets are kept');
  });

  test('a second account with the same email is refused as 409 email_taken, not a raw database error', async () => {
    const users = new TypeOrmUserRepository(ds.getRepository(UserOrmEntity));
    const make = () => User.registerStudent({ email: Email.of('trung@truong.vn'), displayName: DisplayName.of('Trung'), phone: null, passwordHash: 'x' });
    await users.save(make());
    await assert.rejects(users.save(make()), (e: DomainError) => e instanceof DomainError && e.code === 'identity.email_taken');
  });

  test('consume: a code reissued after the claim can no longer be spent', async () => {
    const v = await issue('old-hash');
    const claimed = (await verifications.claimAttempt(v.id))!;
    const fresh = (await verifications.findById(v.id))!;
    fresh.reissue('new-hash', new Date(Date.now() + 61_000));
    await verifications.save(fresh);
    claimed.consume();
    assert.equal(await verifications.consume(claimed), false);
  });

  // ---------------------------------------------------------------- submissions

  const SESSION = '4f9c1a52-0000-4000-8000-000000000001';
  const aSubmission = (userId: string, key = 'A') =>
    Submission.submit({ userId, userDisplayName: 'HS', sessionId: SESSION, sessionTitle: 'KT', problemKey: key, problemTitle: 'Tổng', source: SourceCode.of('python', 'print(3)'), totalPoints: 10 });
  const tally = (r: string[]) => r.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
  const userId = () => `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;

  test('admit: 30 parallel submissions against MAX_PENDING=3 store exactly 3', async () => {
    const user = userId();
    const results = await Promise.all(Array.from({ length: 30 }, () => submissions.admit(aSubmission(user), { maxPending: 3, maxForProblem: null })));
    assert.deepEqual(tally(results), { ADMITTED: 3, TOO_MANY_PENDING: 27 });
    assert.equal(await ds.getRepository(SubmissionOrmEntity).countBy({ userId: user }), 3);
  });

  test('admit: 20 parallel against a per-problem limit of 1 store exactly 1; other users and problems are unaffected', async () => {
    const user = userId();
    const results = await Promise.all(Array.from({ length: 20 }, () => submissions.admit(aSubmission(user), { maxPending: 100, maxForProblem: 1 })));
    assert.deepEqual(tally(results), { ADMITTED: 1, PROBLEM_LIMIT_REACHED: 19 });
    assert.equal(await submissions.admit(aSubmission(user, 'B'), { maxPending: 100, maxForProblem: 1 }), 'ADMITTED');
    assert.equal(await submissions.admit(aSubmission(userId()), { maxPending: 100, maxForProblem: 1 }), 'ADMITTED');
  });

  test('admit: a system error (IE) is not an attempt, finished attempts are, and finished ones are not "pending"', async () => {
    const user = userId();
    const first = aSubmission(user);
    assert.equal(await submissions.admit(first, { maxPending: 1, maxForProblem: 1 }), 'ADMITTED');
    assert.equal(await submissions.admit(aSubmission(user), { maxPending: 1, maxForProblem: 1 }), 'TOO_MANY_PENDING');

    assert.equal(await submissions.failIfUnfinished(first.id, 1, 'queue lost it'), true);
    assert.equal(await submissions.admit(aSubmission(user), { maxPending: 1, maxForProblem: 1 }), 'ADMITTED', 'the IE did not use up the attempt');

    const second = (await ds.getRepository(SubmissionOrmEntity).findOneByOrFail({ userId: user, status: 'PENDING' }));
    const done = Submission.rehydrate(second.id, { ...(await submissions.findById(second.id))!.snapshot });
    done.complete('WA', [], null);
    await submissions.save(done);
    assert.equal(await submissions.admit(aSubmission(user), { maxPending: 5, maxForProblem: 1 }), 'PROBLEM_LIMIT_REACHED', 'a judged attempt counts');
  });

  test('admit: system errors attributed to the program count beyond two, for good; infrastructure ones never (F-3)', async () => {
    const user = userId();
    const limits = { maxPending: 10, maxForProblem: 1 };
    // the system's own failures: lost results (watchdog) are stored as infrastructure faults
    for (let i = 0; i < 3; i++) {
      const s = aSubmission(user);
      assert.equal(await submissions.admit(s, limits), 'ADMITTED');
      assert.equal(await submissions.failIfUnfinished(s.id, 1, LOST_RESULT_MESSAGE), true);
      assert.equal((await submissions.findById(s.id))!.snapshot.faultSource, 'infrastructure');
    }
    // errors attributed to the program: two are free, the third counts
    for (let i = 0; i < 3; i++) {
      const s = aSubmission(user);
      assert.equal(await submissions.admit(s, limits), 'ADMITTED', `program error ${i + 1}`);
      const stored = (await submissions.findById(s.id))!;
      stored.complete('IE', [], 'Hệ thống chấm bài gặp lỗi', 'program');
      await submissions.save(stored);
    }
    // a counted one stays counted however old it gets
    await ds.getRepository(SubmissionOrmEntity).update({ userId: user }, { createdAt: new Date(Date.now() - 30 * 86_400_000) });
    assert.equal(await submissions.admit(aSubmission(user), limits), 'PROBLEM_LIMIT_REACHED');
  });

  test('failIfUnfinished is compare-and-set: finished, other-run and unknown submissions are untouched', async () => {
    const s = aSubmission(userId());
    await submissions.save(s);

    const finished = (await submissions.findById(s.id))!;
    finished.complete('AC', [], null);
    await submissions.save(finished);
    assert.equal(await submissions.failIfUnfinished(s.id, 1, 'x'), false, 'an AC that arrived first stays');
    assert.equal((await submissions.findById(s.id))!.snapshot.verdict, 'AC');

    const t = aSubmission(userId());
    await submissions.save(t);
    assert.equal(await submissions.failIfUnfinished(t.id, 2, 'x'), false, 'a result of another run is not this call\'s business');
    assert.equal(await submissions.failIfUnfinished('00000000-0000-4000-8000-000000000000', 1, 'x'), false);
    assert.equal(await submissions.failIfUnfinished(t.id, 1, 'queue lost it'), true);
    assert.equal(await submissions.failIfUnfinished(t.id, 1, 'again'), false, 'ended once');
    const ended = (await submissions.findById(t.id))!.snapshot;
    assert.deepEqual([ended.status, ended.verdict, ended.score, ended.compileOutput], ['DONE', 'IE', 0, 'queue lost it']);
    assert.ok(ended.judgedAt);
  });

  test('findStale finds unfinished submissions queued before the cutoff - including old rows without queuedAt', async () => {
    const user = userId();
    const fresh = aSubmission(user);
    const old = aSubmission(user);
    const legacy = aSubmission(user);
    const finished = aSubmission(user);
    await Promise.all([fresh, old, legacy, finished].map((s) => submissions.save(s)));

    const repo = ds.getRepository(SubmissionOrmEntity);
    const longAgo = new Date(Date.now() - 3600_000);
    await repo.update({ id: old.id }, { queuedAt: longAgo });
    await repo.update({ id: legacy.id }, { queuedAt: null, createdAt: longAgo });
    await repo.update({ id: finished.id }, { queuedAt: longAgo, status: 'DONE' });

    const stale = await submissions.findStale(new Date(Date.now() - 600_000), 100);
    const ids = stale.filter((s) => s.snapshot.userId === user).map((s) => s.id).sort();
    assert.deepEqual(ids, [old.id, legacy.id].sort());
    assert.equal((await submissions.findById(legacy.id))!.snapshot.queuedAt.getTime(), longAgo.getTime(), 'a missing queuedAt reads as the submission time');
  });

  test('findStale pages through submissions with the same queue time without skipping or repeating any (S2)', async () => {
    const user = userId();
    const all = Array.from({ length: 7 }, () => aSubmission(user));
    await Promise.all(all.map((s) => submissions.save(s)));
    const sameMoment = new Date(Date.now() - 7200_000); // a burst queued in the same millisecond: the tie is broken by id
    await ds.getRepository(SubmissionOrmEntity).update(all.map((s) => s.id), { queuedAt: sameMoment });

    const seen: string[] = [];
    let cursor: { queuedAt: Date; id: string } | undefined;
    for (;;) {
      const page = (await submissions.findStale(new Date(Date.now() - 600_000), 3, cursor)).filter((s) => s.snapshot.userId === user);
      if (!page.length) break;
      seen.push(...page.map((s) => s.id));
      const last = page[page.length - 1];
      cursor = { queuedAt: last.snapshot.queuedAt, id: last.id };
    }
    assert.deepEqual(seen, all.map((s) => s.id).sort(), 'every one exactly once, in id order');
  });

  test('the rejudged submission round-trips with its new queue time', async () => {
    const s = aSubmission(userId());
    await submissions.save(s);
    const loaded = (await submissions.findById(s.id))!;
    loaded.rejudge(10);
    await submissions.save(loaded);
    const again = (await submissions.findById(s.id))!.snapshot;
    assert.equal(again.judgeRun, 2);
    assert.equal(again.queuedAt.getTime(), loaded.snapshot.queuedAt.getTime());
  });
});
