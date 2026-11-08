import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECENT_SIGN_IN_TTL_MS, type RecentSignIns } from '../../src/modules/identity/application/recent-sign-ins.js';

export interface SignInsUnderTest {
  signIns: RecentSignIns;
  clock: { now: number };
}

/** What every RecentSignIns must do, run against each implementation. */
export function recentSignInsContract(name: string, make: () => Promise<SignInsUnderTest> | SignInsUnderTest) {
  const account = () => `a${Math.random().toString(36).slice(2)}@truong.vn`;

  test(`${name}: remembers an address for that account only, for the exemption period`, async () => {
    const { signIns, clock } = await make();
    const [lan, mai] = [account(), account()];
    assert.equal(await signIns.has(lan, '203.0.113.7'), false);
    await signIns.record(lan, '203.0.113.7');
    assert.equal(await signIns.has(lan, '203.0.113.7'), true);
    assert.equal(await signIns.has(lan, '203.0.113.8'), false, 'another address');
    assert.equal(await signIns.has(mai, '203.0.113.7'), false, 'another account');

    clock.now += RECENT_SIGN_IN_TTL_MS - 1;
    assert.equal(await signIns.has(lan, '203.0.113.7'), true);
    clock.now += 1;
    assert.equal(await signIns.has(lan, '203.0.113.7'), false, 'expired');
  });

  test(`${name}: forgetting an account drops all its addresses, and only its own`, async () => {
    const { signIns } = await make();
    const [lan, mai] = [account(), account()];
    await signIns.record(lan, '203.0.113.7');
    await signIns.record(lan, '2001:db8:1:2::/64');
    await signIns.record(mai, '203.0.113.7');
    await signIns.forget(lan);
    assert.equal(await signIns.has(lan, '203.0.113.7'), false);
    assert.equal(await signIns.has(lan, '2001:db8:1:2::/64'), false);
    assert.equal(await signIns.has(mai, '203.0.113.7'), true);
  });

  test(`${name}: signing in again restarts the period`, async () => {
    const { signIns, clock } = await make();
    const lan = account();
    await signIns.record(lan, '203.0.113.7');
    clock.now += RECENT_SIGN_IN_TTL_MS - 10;
    await signIns.record(lan, '203.0.113.7');
    clock.now += 20;
    assert.equal(await signIns.has(lan, '203.0.113.7'), true);
  });
}
