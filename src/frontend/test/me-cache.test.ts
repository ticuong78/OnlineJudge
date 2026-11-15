import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UserDto } from '@oj/contracts';
import { clearCachedUser, readCachedUser, writeCachedUser } from '../src/lib/me-cache';

// OJ-16 P1-1: the shell is drawn from a cached account before /auth/me answers.

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const user = (id: string) => ({ id, displayName: `HS ${id}`, role: 'STUDENT', email: `${id}@x.vn`, organizations: [] }) as unknown as UserDto;
const TOKEN_A = 'header.payload.signature-of-account-A-0123456789';
const TOKEN_B = 'header.payload.signature-of-account-B-9876543210';

test('the cached account is returned only for the token it was saved with', () => {
  const store = memory();
  writeCachedUser(TOKEN_A, user('a'), store);
  assert.equal(readCachedUser(TOKEN_A, store)?.id, 'a');
  assert.equal(readCachedUser(TOKEN_B, store), null, 'another account signed in: never show the previous name');
  assert.equal(readCachedUser(null, store), null, 'signed out: nothing');
});

test('sign-out clears it, and damaged or foreign values are ignored', () => {
  const store = memory();
  writeCachedUser(TOKEN_A, user('a'), store);
  clearCachedUser(store);
  assert.equal(readCachedUser(TOKEN_A, store), null);
  store.setItem('oj:me', '{not json');
  assert.equal(readCachedUser(TOKEN_A, store), null);
  store.setItem('oj:me', JSON.stringify({ for: TOKEN_A.slice(-16), user: { displayName: 'no id' } }));
  assert.equal(readCachedUser(TOKEN_A, store), null, 'a value without an account id is not an account');
});

test('the token itself is not stored again: only a short fingerprint of it', () => {
  const store = memory();
  writeCachedUser(TOKEN_A, user('a'), store);
  const raw = store.data.get('oj:me')!;
  assert.ok(!raw.includes('header.payload'), raw);
});
