import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignEntry } from '../src/lib/home-actions';

const active = (id: string) => ({ id, status: 'ACTIVE' });
const archived = (id: string) => ({ id, status: 'ARCHIVED' });

test('a teacher with no active class is offered to create one (OJ-33)', () => {
  assert.deepEqual(assignEntry([], false), { kind: 'firstClass' });
  assert.deepEqual(assignEntry([archived('a')], false), { kind: 'firstClass' });
});

test('one active class goes straight to assigning in that class (OJ-33)', () => {
  assert.deepEqual(assignEntry([archived('old'), active('c1')], false), { kind: 'class', classId: 'c1' });
});

test('several active classes ask which class first (OJ-33)', () => {
  assert.deepEqual(assignEntry([active('c1'), active('c2')], false), { kind: 'pickClass' });
});

test('admins, and a class list that failed to load, keep the link to the bank (OJ-33)', () => {
  assert.deepEqual(assignEntry([active('c1')], true), { kind: 'bank' });
  assert.deepEqual(assignEntry([], true), { kind: 'bank' });
  assert.deepEqual(assignEntry(undefined, false), { kind: 'bank' });
});
