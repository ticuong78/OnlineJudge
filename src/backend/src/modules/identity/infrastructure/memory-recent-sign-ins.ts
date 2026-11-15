import { RECENT_SIGN_IN_TTL_MS, RecentSignIns } from '../application/recent-sign-ins.js';

/** In-process `RecentSignIns` for tests and tools; bounded, and lost on restart. */
export class MemoryRecentSignIns extends RecentSignIns {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 50_000,
  ) {
    super();
  }

  async record(account: string, client: string): Promise<void> {
    const key = `${account}|${client}`;
    this.seen.delete(key);
    this.seen.set(key, this.now());
    while (this.seen.size > this.maxEntries) this.seen.delete(this.seen.keys().next().value as string);
  }

  async forget(account: string): Promise<void> {
    for (const key of [...this.seen.keys()]) if (key.startsWith(`${account}|`)) this.seen.delete(key);
  }

  async has(account: string, client: string): Promise<boolean> {
    const at = this.seen.get(`${account}|${client}`);
    return at !== undefined && this.now() - at < RECENT_SIGN_IN_TTL_MS;
  }
}
