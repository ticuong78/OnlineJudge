import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { DataSource } from 'typeorm';
import { IntegrityFlag, type SubmissionRef } from '../src/modules/integrity/domain/integrity-flag.js';
import { IntegrityCheckOrmEntity, IntegrityFlagOrmEntity, TypeOrmIntegrityFlagRepository } from '../src/modules/integrity/infrastructure/persistence.js';
import { throwaway } from './support/throwaway.js';

/** K-11 on real PostgreSQL: the unique pair key keeps one plagiarism flag per pair, even under parallel inserts. */
const { url, skip } = throwaway('TEST_DATABASE_URL');

describe('PostgreSQL: one plagiarism flag per pair (K-11)', { skip }, () => {
  const schema = `oj_test_${randomBytes(4).toString('hex')}`;
  let admin: DataSource;
  let ds: DataSource;
  let flags: TypeOrmIntegrityFlagRepository;

  before(async () => {
    admin = new DataSource({ type: 'postgres', url });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({ type: 'postgres', url, schema, entities: [IntegrityFlagOrmEntity, IntegrityCheckOrmEntity], synchronize: true, extra: { max: 20 } });
    await ds.initialize();
    flags = new TypeOrmIntegrityFlagRepository(ds);
  });

  after(async () => {
    await ds?.destroy();
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.destroy();
  });

  const ctx = { sessionId: randomUUID(), sessionTitle: 'UAT', problemKey: 'A', problemTitle: 'A. Tổng' };
  const ref = (submissionId: string, user: string): SubmissionRef => ({ submissionId, userId: randomUUID(), userDisplayName: user });

  test('10 parallel inserts of the same pair, in both orders, keep exactly one flag', async () => {
    const a = ref(randomUUID(), 'Dũng');
    const b = ref(randomUUID(), 'Hà');
    const attempts = Array.from({ length: 10 }, (_, i) => IntegrityFlag.plagiarism(ctx, i % 2 ? a : b, i % 2 ? b : a, 1)!);
    const inserted = await Promise.all(attempts.map((f) => flags.addIfNewPair(f)));
    assert.equal(inserted.filter(Boolean).length, 1, 'exactly one caller inserted');
    assert.equal((await flags.list({ sessionIds: [ctx.sessionId] })).length, 1);
  });

  test('different pairs and AI-usage flags are not affected', async () => {
    const [a, b, c] = [ref(randomUUID(), 'A'), ref(randomUUID(), 'B'), ref(randomUUID(), 'C')];
    assert.equal(await flags.addIfNewPair(IntegrityFlag.plagiarism({ ...ctx, sessionId: randomUUID() }, a, b, 1)!), true);
    assert.equal(await flags.addIfNewPair(IntegrityFlag.plagiarism({ ...ctx, sessionId: randomUUID() }, a, c, 1)!), true);
    const review = { risk: 'HIGH' as const, summary: 'Có dấu hiệu', reasons: ['x'], segments: [] };
    const ai1 = IntegrityFlag.aiUsage(ctx, a, review)!;
    const ai2 = IntegrityFlag.aiUsage(ctx, b, review)!;
    await flags.save(ai1);
    await flags.save(ai2);
    assert.equal(ai1.pairKey, null);
    assert.equal((await flags.list({ sessionIds: [ctx.sessionId] })).filter((f) => f.snapshot.kind === 'AI_USAGE').length, 2);
  });
});
