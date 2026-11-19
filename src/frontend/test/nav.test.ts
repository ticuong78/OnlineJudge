import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UserDto } from '@oj/contracts';
import { classTab, classTabHref } from '../src/lib/class-tabs';
import { accountItems, navItems, refreshDue } from '../src/lib/nav';
import { badgeText, nextTabIndex } from '../src/lib/tabs';
import { awaitingQuestions } from '../src/lib/threads';

const org = [{ organizationId: 'o', organizationName: 'Trung tâm', role: 'MEMBER' }] as unknown as UserDto['organizations'];
const user = (role: UserDto['role'], organizations: UserDto['organizations'] = []) => ({ role, organizations });
const labels = (items: { label: string }[]) => items.map((i) => i.label);

test('a teacher gets four menu items; import, organizations and submissions are not among them (OJ-32)', () => {
  assert.deepEqual(labels(navItems(user('TEACHER', org))), ['home', 'classes', 'bank', 'integrity']);
});

test('an admin also gets users (OJ-32)', () => {
  assert.deepEqual(labels(navItems(user('ADMIN'))), ['home', 'classes', 'bank', 'integrity', 'users']);
});

test('the student menu is unchanged (OJ-32)', () => {
  assert.deepEqual(labels(navItems(user('STUDENT'))), ['home', 'myClass', 'practice', 'progress', 'submissions']);
  assert.deepEqual(accountItems(user('STUDENT')), []);
});

test('organizations sit in the account menu only for an admin or an organization member (OJ-32)', () => {
  assert.deepEqual(labels(accountItems(user('TEACHER'))), ['submissions']);
  assert.deepEqual(labels(accountItems(user('TEACHER', org))), ['organizations', 'submissions']);
  assert.deepEqual(labels(accountItems(user('ADMIN'))), ['organizations', 'submissions']);
});

test('badges show nothing at 0 and cap at 99+ (OJ-32)', () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(undefined), null);
  assert.equal(badgeText(3), '3');
  assert.equal(badgeText(120), '99+');
});

test('the class tab comes from the URL, with sessions as the fallback (OJ-32)', () => {
  assert.equal(classTab('gradebook'), 'gradebook');
  assert.equal(classTab('students'), 'students');
  assert.equal(classTab(null), 'sessions');
  assert.equal(classTab('nope'), 'sessions');
  assert.equal(classTabHref('c1', 'sessions'), '/classes/c1');
  assert.equal(classTabHref('c1', 'board'), '/classes/c1?tab=board');
});

test('only questions awaiting an answer count on the board badge (OJ-32)', () => {
  assert.equal(awaitingQuestions([{ awaitingAnswer: true }, { awaitingAnswer: false }, { awaitingAnswer: true }]), 2);
  assert.equal(awaitingQuestions(null), 0);
});

test('arrow keys wrap around, Home and End jump to the ends, other keys are ignored (OJ-32)', () => {
  assert.equal(nextTabIndex({ key: 'ArrowRight' }, 0, 4), 1);
  assert.equal(nextTabIndex({ key: 'ArrowRight' }, 3, 4), 0);
  assert.equal(nextTabIndex({ key: 'ArrowLeft' }, 0, 4), 3);
  assert.equal(nextTabIndex({ key: 'Home' }, 2, 4), 0);
  assert.equal(nextTabIndex({ key: 'End' }, 0, 4), 3);
  assert.equal(nextTabIndex({ key: 'Enter' }, 0, 4), -1);
  assert.equal(nextTabIndex({ key: 'ArrowRight' }, 0, 0), -1);
});

test('a key held with a modifier is left to the browser, so Alt+Left still goes Back (OJ-32 review)', () => {
  assert.equal(nextTabIndex({ key: 'ArrowLeft', altKey: true }, 1, 4), -1);
  assert.equal(nextTabIndex({ key: 'ArrowRight', metaKey: true }, 1, 4), -1);
  assert.equal(nextTabIndex({ key: 'ArrowRight', ctrlKey: true }, 1, 4), -1);
});

test('window focus refreshes the flag count at most once a minute (OJ-32 review)', () => {
  assert.equal(refreshDue(0, 1_000, 60_000), false);
  assert.equal(refreshDue(1_000, 61_000, 60_000), true);
  assert.equal(refreshDue(1_000, 30_000, 60_000), false);
});
