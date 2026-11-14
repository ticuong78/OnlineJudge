import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  TrialStore,
  type TrialRecord,
  type TrialResult,
  type TrialState,
} from '../../src/modules/judging/application/trial-store.js';

/** Plain in-memory TrialStore for use-case tests (no expiry). */
export class MemoryTrialStore extends TrialStore {
  readonly slots = new Map<string, string>();
  readonly states = new Map<string, TrialState>();
  readonly latest = new Map<string, string>();

  async claimSlot(userId: string, trialId: string) {
    if (this.slots.has(userId)) return false;
    this.slots.set(userId, trialId);
    return true;
  }
  async swapLatest(userId: string, trialId: string) {
    const previous = this.latest.get(userId) ?? null;
    this.latest.set(userId, trialId);
    return previous;
  }
  async releaseSlot(userId: string, trialId: string) {
    if (this.slots.get(userId) === trialId) this.slots.delete(userId);
  }
  async create(record: TrialRecord) {
    this.states.set(record.id, { record, started: false, result: null });
  }
  async remove(trialId: string) {
    this.states.delete(trialId);
  }
  async markStarted(trialId: string) {
    const s = this.states.get(trialId);
    if (s) s.started = true;
  }
  async storeResult(trialId: string, result: TrialResult) {
    const s = this.states.get(trialId);
    if (!s) return null;
    s.result = result;
    return s.record;
  }
  async find(trialId: string) {
    const s = this.states.get(trialId);
    return s ? { ...s } : null;
  }
}

const record = (userId = 'u1'): TrialRecord => ({
  id: randomUUID(),
  userId,
  sessionId: randomUUID(),
  problemKey: 'A',
  language: 'python',
  createdAt: new Date().toISOString(),
  samples: [{ id: 'A-1', input: '1 2', expectedOutput: '3' }],
});
const result: TrialResult = {
  verdict: 'WA',
  compileOutput: null,
  testResults: [{ testCaseId: 'A-1', verdict: 'WA', timeMs: 5, memoryKb: 900, points: 0, isSample: true, output: '4' }],
};

/** Behaviour every TrialStore must have; run against the in-memory and the Redis store. */
export function trialStoreContract(name: string, make: () => TrialStore) {
  test(`${name}: one slot per user, freed only by the trial that holds it`, async () => {
    const store = make();
    const user = randomUUID();
    assert.equal(await store.claimSlot(user, 't1'), true);
    assert.equal(await store.claimSlot(user, 't2'), false, 'a second trial is refused');
    assert.equal(await store.claimSlot(randomUUID(), 't3'), true, 'other users are not affected');
    await store.releaseSlot(user, 't2');
    assert.equal(await store.claimSlot(user, 't4'), false, 'a trial that does not hold the slot cannot free it');
    await store.releaseSlot(user, 't1');
    assert.equal(await store.claimSlot(user, 't5'), true);
  });

  test(`${name}: the latest trial of a user is swapped, returning the one it replaces`, async () => {
    const store = make();
    const user = randomUUID();
    assert.equal(await store.swapLatest(user, 't1'), null);
    assert.equal(await store.swapLatest(user, 't2'), 't1');
    assert.equal(await store.swapLatest(randomUUID(), 't3'), null, 'per user');
  });

  test(`${name}: a trial goes from pending to started to done, and a late "started" does not undo the result`, async () => {
    const store = make();
    const r = record();
    await store.create(r);
    assert.deepEqual(await store.find(r.id), { record: r, started: false, result: null });
    assert.deepEqual(await store.storeResult(r.id, result), r, 'the record comes back, so its slot can be freed');
    await store.markStarted(r.id);
    assert.deepEqual(await store.find(r.id), { record: r, started: true, result });
  });

  test(`${name}: results for an unknown or removed trial are dropped`, async () => {
    const store = make();
    assert.equal(await store.storeResult(randomUUID(), result), null);
    const r = record();
    await store.create(r);
    await store.remove(r.id);
    await store.markStarted(r.id);
    assert.equal(await store.storeResult(r.id, result), null);
    assert.equal(await store.find(r.id), null);
  });
}
