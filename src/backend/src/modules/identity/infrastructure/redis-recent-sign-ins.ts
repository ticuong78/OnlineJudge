import type { Redis } from 'ioredis';
import { RECENT_SIGN_IN_TTL_MS, RecentSignIns } from '../application/recent-sign-ins.js';

/** An account keeps at most this many remembered addresses; older ones are dropped first. */
const MAX_ADDRESSES = 50;

/**
 * `RecentSignIns` in Redis: one hash per account, address -> time of its last sign-in, so all of an account's
 * addresses can be forgotten at once. The key expires with the newest exemption; older entries are judged by their
 * time. Survives restarts and is never evicted to make room for other accounts.
 */
export class RedisRecentSignIns extends RecentSignIns {
  constructor(
    private readonly redis: Redis,
    private readonly now: () => number = Date.now,
    private readonly prefix = 'oj:signin:',
  ) {
    super();
  }

  async record(account: string, client: string): Promise<void> {
    const key = this.prefix + account;
    const [, , [, size]] = (await this.redis.multi().hset(key, client, String(this.now())).pexpire(key, RECENT_SIGN_IN_TTL_MS).hlen(key).exec())!;
    if ((size as number) > MAX_ADDRESSES) await this.trim(key);
  }

  async has(account: string, client: string): Promise<boolean> {
    const at = await this.redis.hget(this.prefix + account, client);
    return at !== null && this.now() - Number(at) < RECENT_SIGN_IN_TTL_MS;
  }

  async forget(account: string): Promise<void> {
    await this.redis.del(this.prefix + account);
  }

  /** Drops expired addresses, then the oldest, until the account is back to MAX_ADDRESSES. */
  private async trim(key: string) {
    const entries = Object.entries(await this.redis.hgetall(key)).map(([client, at]) => [client, Number(at)] as const);
    const now = this.now();
    const doomed = entries
      .sort((a, b) => a[1] - b[1])
      .filter(([, at], i) => now - at >= RECENT_SIGN_IN_TTL_MS || i < entries.length - MAX_ADDRESSES)
      .map(([client]) => client);
    if (doomed.length) await this.redis.hdel(key, ...doomed);
  }
}
