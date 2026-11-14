import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeNext } from '../src/lib/safe-next';

// Review B1 (OJ-14): `?next=` after signing in must never leave the site.

const ORIGIN = 'https://oj.example';

test('B1 regression: tricks that browsers read as another site all fall back to the home page', () => {
  for (const evil of [
    '/\\evil.com', // the reported bypass: new URL turns it into https://evil.com/
    '/\\/evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r\n/evil.com',
    '//evil.com',
    '///evil.com',
    'https://evil.com',
    '/.//evil.com', // dot segments collapse to //evil.com (found by the security-verifier)
    '/..//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    '/%2e%2e//evil.com',
    '/.///evil.com',
    'javascript:alert(1)',
    'evil.com',
    '',
    null,
    undefined,
  ]) {
    assert.equal(safeNext(evil, ORIGIN), '/', JSON.stringify(evil));
    assert.equal(new URL(safeNext(evil, ORIGIN), ORIGIN).origin, ORIGIN);
  }
});

test('B1: a path on this site is kept, with its query and fragment', () => {
  assert.equal(safeNext('/bank', ORIGIN), '/bank');
  assert.equal(safeNext('/bank/sets?tab=sets#top', ORIGIN), '/bank/sets?tab=sets#top');
  assert.equal(safeNext('/sessions/abc/problems/A', ORIGIN), '/sessions/abc/problems/A');
  assert.equal(safeNext('/a/../bank', ORIGIN), '/bank', 'normalised by the URL parser, still on this site');
});
