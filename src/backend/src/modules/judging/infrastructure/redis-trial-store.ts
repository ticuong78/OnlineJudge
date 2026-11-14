import type { Redis } from 'ioredis';
import { TRIAL_SLOT_MS, TRIAL_TTL_MS, TrialStore, type TrialRecord, type TrialResult, type TrialState } from '../application/trial-store.js';

/** Deletes the slot only when it still names this trial, so a newer trial's slot is never freed by an old result. */
const RELEASE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`;

/**
 * `TrialStore` in Redis. The record, the "started" mark and the result are separate keys with the same lifetime:
 * result messages are handled several at a time, so a late "started" must not be able to overwrite a stored result.
 */
export class RedisTrialStore extends TrialStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'oj:trial:',
  ) {
    super();
  }

  async claimSlot(userId: string, trialId: string): Promise<boolean> {
    return (await this.redis.set(this.slotKey(userId), trialId, 'PX', TRIAL_SLOT_MS, 'NX')) === 'OK';
  }

  async swapLatest(userId: string, trialId: string): Promise<string | null> {
    return this.redis.set(`${this.prefix}latest:${userId}`, trialId, 'PX', TRIAL_TTL_MS, 'GET');
  }

  async releaseSlot(userId: string, trialId: string): Promise<void> {
    await this.redis.eval(RELEASE_IF_OWNER, 1, this.slotKey(userId), trialId);
  }

  async create(record: TrialRecord): Promise<void> {
    await this.redis.set(this.prefix + record.id, JSON.stringify(record), 'PX', TRIAL_TTL_MS);
  }

  async remove(trialId: string): Promise<void> {
    const key = this.prefix + trialId;
    await this.redis.del(key, `${key}:started`, `${key}:result`);
  }

  async markStarted(trialId: string): Promise<void> {
    const ttl = await this.redis.pttl(this.prefix + trialId);
    if (ttl > 0) await this.redis.set(`${this.prefix}${trialId}:started`, '1', 'PX', ttl);
  }

  async storeResult(trialId: string, result: TrialResult): Promise<TrialRecord | null> {
    const key = this.prefix + trialId;
    const [[, raw], [, ttl]] = (await this.redis.multi().get(key).pttl(key).exec())! as [[unknown, string | null], [unknown, number]];
    if (!raw || ttl <= 0) return null;
    await this.redis.set(`${key}:result`, JSON.stringify(result), 'PX', ttl);
    return JSON.parse(raw) as TrialRecord;
  }

  async find(trialId: string): Promise<TrialState | null> {
    const key = this.prefix + trialId;
    const [raw, started, result] = await this.redis.mget(key, `${key}:started`, `${key}:result`);
    if (!raw) return null;
    return { record: JSON.parse(raw) as TrialRecord, started: started === '1', result: result ? (JSON.parse(result) as TrialResult) : null };
  }

  private slotKey(userId: string) {
    return `${this.prefix}slot:${userId}`;
  }
}
