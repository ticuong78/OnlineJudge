import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createTeacher, registerStudent, signInAdmin, type Account } from '../support/journeys.js';
import { startBackend, type BackendStack } from '../support/stack.js';

/** Role boundaries over HTTP: every role gets refused where it does not belong (the guard, not the UI). */
describe('E2E access control', () => {
  let stack: BackendStack;
  let teacher: Account;
  let student: Account;

  before(async () => {
    stack = await startBackend();
    const admin = await signInAdmin(stack);
    teacher = await createTeacher(stack, admin, 'Giáo Viên Kiểm Tra');
    student = await registerStudent(stack, 'Học Sinh Kiểm Tra');
  });
  after(async () => { await stack?.stop(); });

  const ID = '00000000-0000-4000-8000-000000000000';
  const adminOnly: [string, string, unknown?][] = [
    ['GET', '/users'],
    ['POST', '/users/invitations', { email: 'x@e2e.test', displayName: 'x x', phone: null }],
    ['PUT', `/users/${ID}/vip`, { vip: true }],
    ['POST', '/organizations', { name: 'X Y', seats: 1, activeUntil: '2099-12-31', aiIncluded: false, adminUserId: ID }],
    ['GET', '/problems?scope=all'],
  ];
  const staffOnly: [string, string, unknown?][] = [
    ['GET', '/problems'],
    ['GET', '/problem-sets'],
    ['POST', '/classes', { name: 'X', code: 'XXXX-1' }],
    ['GET', '/integrity-flags'],
    ['GET', '/organizations'],
  ];

  test('teachers are refused on administrator routes', async () => {
    for (const [method, path, body] of adminOnly) {
      assert.equal((await teacher.api.status(method, path, body)).status, 403, `${method} ${path}`);
    }
  });

  test('students are refused on staff and administrator routes', async () => {
    for (const [method, path, body] of [...adminOnly, ...staffOnly]) {
      assert.equal((await student.api.status(method, path, body)).status, 403, `${method} ${path}`);
    }
  });

  test('unknown fields are stripped, invalid bodies are refused with the reasons in Vietnamese', async () => {
    const res = await fetch(`${stack.apiUrl}/classes`, {
      method: 'POST', headers: { authorization: `Bearer ${teacher.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: '', code: 'x' }),
    });
    const bad = (await res.json()) as { statusCode: number; message: string; code: string };
    assert.equal(res.status, 400);
    assert.match(bad.message, /Tên lớp phải từ 1 đến 100 ký tự/);
    assert.match(bad.message, /Mã lớp gồm 4–20 ký tự/);
    assert.equal(bad.code, 'request.invalid', 'validation errors carry a stable code like domain errors (K-13)');
    const cls = await teacher.api.post<{ teacherId: string; status: string }>('/classes', { name: 'Lớp kiểm tra', code: 'E2E-ACL1', teacherId: ID, status: 'ARCHIVED' });
    assert.equal(cls.teacherId, teacher.id, 'a teacher cannot create a class for someone else');
    assert.equal(cls.status, 'ACTIVE', 'an unknown field cannot set the status');
  });
});
