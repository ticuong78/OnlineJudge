import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createProblem, createTeacher, registerStudent, signInAdmin, type Account } from '../support/journeys.js';
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

  test("one student's submissions: only the session's manager, never another student or teacher (OJ-30)", async () => {
    const admin = await signInAdmin(stack);
    const other = await createTeacher(stack, admin, 'Giáo Viên Lớp Khác');
    await teacher.api.post('/classes', { name: 'Lớp OJ-30', code: 'E2E-OJ30' });
    const owner = await registerStudent(stack, 'Học Sinh Một', 'E2E-OJ30');
    const classmate = await registerStudent(stack, 'Học Sinh Hai', 'E2E-OJ30');
    const cls = (await teacher.api.get<{ id: string; code: string }[]>('/classes')).find((c) => c.code === 'E2E-OJ30')!;
    for (const r of await teacher.api.get<{ id: string }[]>(`/classes/${cls.id}/requests`)) {
      await teacher.api.post(`/membership-requests/${r.id}/approve`);
    }
    const problem = await createProblem(teacher);
    const session = await teacher.api.post<{ id: string }>('/sessions', {
      source: { kind: 'PROBLEM', problemId: problem.id }, classId: cls.id, opensAt: null, closesAt: null,
    });
    const path = (userId: string, sessionId: string | null = session.id) =>
      `/submissions?${sessionId ? `sessionId=${sessionId}&` : ''}userId=${userId}`;

    assert.equal((await teacher.api.status('GET', path(owner.id))).status, 200, 'the manager may');
    assert.equal((await owner.api.status('GET', path(owner.id))).status, 200, 'the student may see their own');
    const refused = [
      [classmate, path(owner.id), 'judging.not_owner'],
      [other, path(owner.id), 'judging.not_session_manager'],
      [teacher, path(owner.id, null), 'judging.not_session_manager'],
    ] as const;
    for (const [who, url, code] of refused) {
      const res = await who.api.status('GET', url);
      assert.deepEqual([res.status, res.code], [403, code], `${who.displayName} GET ${url}`);
    }
    assert.equal((await teacher.api.status('GET', path('not-a-uuid'))).status, 400, 'userId must be a UUID');
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
