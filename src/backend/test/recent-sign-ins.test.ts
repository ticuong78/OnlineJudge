import 'reflect-metadata';
import { MemoryRecentSignIns } from '../src/modules/identity/infrastructure/memory-recent-sign-ins.js';
import { recentSignInsContract } from './support/recent-sign-ins-contract.js';

recentSignInsContract('in-memory sign-in memory', () => {
  const clock = { now: 1_800_000_000_000 };
  return { clock, signIns: new MemoryRecentSignIns(() => clock.now) };
});
