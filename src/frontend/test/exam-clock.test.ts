import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionDto } from '@oj/contracts';
import { serverOffsetMs, timerTarget } from '../src/lib/exam';

// OJ-15 F3: a computer whose clock is wrong must not end a student's exam early.

const MIN = 60_000;
const SERVER_NOW = Date.parse('2026-11-12T08:00:00Z');

test('F3 regression: with the computer clock an hour fast, the time left is the server\'s, not zero', () => {
  const localNow = SERVER_NOW + 60 * MIN; // lab PC an hour fast
  const offset = serverOffsetMs(new Date(SERVER_NOW).toISOString(), localNow);
  assert.equal(offset, -60 * MIN);
  const session = { myAttempt: { endsAt: new Date(SERVER_NOW + 45 * MIN).toISOString() } } as unknown as SessionDto;
  const target = timerTarget(session, localNow + offset!)!;
  const left = target.endsAt - (localNow + offset!);
  assert.equal(left, 45 * MIN, 'the student still has the whole 45 minutes');
  assert.ok(target.endsAt - localNow < 0, 'the computer clock alone would have said time is up (the old first check)');
});

test('F3: no offset, so no timer, until a session with a valid server time has loaded', () => {
  assert.equal(serverOffsetMs(undefined, SERVER_NOW), null);
  assert.equal(serverOffsetMs('not a date', SERVER_NOW), null);
  assert.equal(serverOffsetMs(new Date(SERVER_NOW).toISOString(), SERVER_NOW - 5 * MIN), 5 * MIN, 'a slow clock too');
});
