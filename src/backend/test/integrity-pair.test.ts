import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { IntegrityFlagKind } from '@oj/contracts';
import { IntegrityService } from '../src/modules/integrity/application/integrity.service.js';
import type { SubmissionInfo } from '../src/modules/integrity/application/ports.js';
import type { IntegrityFlag } from '../src/modules/integrity/domain/integrity-flag.js';
import { IntegrityFlagRepository } from '../src/modules/integrity/domain/integrity-flag.repository.js';

const code = (f: string) => readFileSync(join(__dirname, '../../../samples/code', f), 'utf8');

/** In-memory flags with the same pair rule as the database (one plagiarism flag per pair of submissions). */
class MemoryFlags extends IntegrityFlagRepository {
  readonly rows: IntegrityFlag[] = [];
  private readonly checked = new Set<string>();
  async findById(id: string) { return this.rows.find((f) => f.id === id) ?? null; }
  async list() { return this.rows; }
  async save(flag: IntegrityFlag) { this.rows.push(flag); }
  async addIfNewPair(flag: IntegrityFlag) {
    await new Promise((r) => setTimeout(r, 1)); // let the parallel check interleave, like two database sessions
    if (this.rows.some((f) => f.pairKey !== null && f.pairKey === flag.pairKey)) return false;
    this.rows.push(flag);
    return true;
  }
  async markChecked(id: string, kind: IntegrityFlagKind) { const k = `${id}|${kind}`; if (this.checked.has(k)) return false; this.checked.add(k); return true; }
  async sessionIdsWithFlags() { return [...new Set(this.rows.map((f) => f.snapshot.sessionId))]; }
}

function setup() {
  const at = new Date();
  const subs: SubmissionInfo[] = [
    { id: 'sub-a', userId: 'hs04', userDisplayName: 'Đặng Quốc Dũng', sessionId: 's1', problemKey: 'A', language: 'python', code: code('copy-a.py'), verdict: 'AC', createdAt: at },
    { id: 'sub-b', userId: 'hs05', userDisplayName: 'Bùi Thanh Hà', sessionId: 's1', problemKey: 'A', language: 'python', code: code('copy-b.py'), verdict: 'AC', createdAt: at },
  ];
  const flags = new MemoryFlags();
  const service = new IntegrityService(
    flags,
    { get: async (id: string) => subs.find((s) => s.id === id) ?? null, ofProblem: async () => subs } as never,
    { checkInfo: async () => ({ ownerId: 'gv', checkPlagiarism: true, checkAiUsage: false, sessionTitle: 'UAT', problemTitle: 'A. Tổng', statement: '' }) } as never,
    { available: false } as never,
    { allows: async () => false } as never,
  );
  return { service, flags };
}

test('K-11: a copied pair checked one after the other gives one plagiarism entry', async () => {
  const { service, flags } = setup();
  await service.check('sub-a');
  await service.check('sub-b');
  assert.equal(flags.rows.length, 1);
  assert.equal(flags.rows[0].snapshot.score, 1);
});

test('K-11: a copied pair checked at the same time still gives one plagiarism entry', async () => {
  const { service, flags } = setup();
  await Promise.all([service.check('sub-a'), service.check('sub-b')]);
  assert.equal(flags.rows.length, 1);
  assert.deepEqual(flags.rows[0].pairKey, 'sub-a|sub-b', 'the key does not depend on which submission was checked first');
});
