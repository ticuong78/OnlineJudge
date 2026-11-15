import { RateLimiter, type RateLimitDecision, type RateLimitPolicy } from '../application/rate-limiter.js';

interface Entry {
  /** Timestamps (ms) of the accepted hits still inside the window, oldest first. */
  hits: number[];
  windowMs: number;
}

/**
 * Sliding-window limiter kept in process memory, for tests and tools. The running app uses `RedisRateLimiter`:
 * this table evicts its oldest keys when full, so flooding it with new keys resets other clients' counters
 * (audit R2-F1), and it forgets everything on restart.
 *
 * Memory is bounded: expired entries are swept regularly and the table never grows past `maxKeys`.
 */
export class InMemoryRateLimiter extends RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private operations = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 50_000,
  ) {
    super();
  }

  async hit(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    const now = this.now();
    this.maybeSweep(now);

    const entry = this.entries.get(key) ?? { hits: [], windowMs: policy.windowMs };
    entry.windowMs = policy.windowMs;
    prune(entry, now);

    if (entry.hits.length >= policy.limit) {
      this.touch(key, entry);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, entry.hits[0] + policy.windowMs - now) };
    }
    entry.hits.push(now);
    this.touch(key, entry);
    return { allowed: true, remaining: policy.limit - entry.hits.length, retryAfterMs: 0 };
  }

  async refund(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.hits.pop();
    if (!entry.hits.length) this.entries.delete(key);
  }

  async reset(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Number of keys currently tracked (for tests and diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  private touch(key: string, entry: Entry) {
    // Re-insert so the Map keeps recently used keys last; the oldest are evicted first.
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  private maybeSweep(now: number) {
    if (++this.operations % 1000 !== 0) return;
    for (const [key, entry] of this.entries) {
      prune(entry, now);
      if (!entry.hits.length) this.entries.delete(key);
    }
  }
}

function prune(entry: Entry, now: number) {
  const cutoff = now - entry.windowMs;
  let drop = 0;
  while (drop < entry.hits.length && entry.hits[drop] <= cutoff) drop++;
  if (drop) entry.hits.splice(0, drop);
}
