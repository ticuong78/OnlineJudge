import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createProblem, createTeacher, registerStudent, signInAdmin, type Account } from '../support/journeys.js';
import { startBackend, type BackendStack } from '../support/stack.js';

interface SessionDto { id: string; problems: { key: string }[]; state: string }

describe('E2E classroom journey: class, join request, problem, session, submission', () => {
  let stack: BackendStack;
  let teacher: Account;
  let student: Account;
  let outsider: Account;
  let classId: string;
  let session: SessionDto;

  before(async () => {
    stack = await startBackend();
    const admin = await signInAdmin(stack);
    teacher = await createTeacher(stack, admin, 'Trần Văn Minh');
  });
  after(async () => { await stack?.stop(); });

  test('the teacher opens a class; a student signs up with its code and is approved', async () => {
    const cls = await teacher.api.post<{ id: string; code: string }>('/classes', { name: 'Tin học 10A1', code: 'E2E-10A1' });
    classId = cls.id;
    student = await registerStudent(stack, 'Vũ Ngọc Chi', 'E2E-10A1');
    const requests = await teacher.api.get<{ id: string; studentName: string }[]>(`/classes/${classId}/requests`);
    assert.deepEqual(requests.map((r) => r.studentName), ['Vũ Ngọc Chi']);
    await teacher.api.post(`/membership-requests/${requests[0].id}/approve`);
    const roster = await teacher.api.get<{ displayName: string }[]>(`/classes/${classId}/students`);
    assert.deepEqual(roster.map((s) => s.displayName), ['Vũ Ngọc Chi']);
    const mine = await student.api.get<{ id: string; code: string | null }[]>('/classes');
    assert.deepEqual(mine.map((c) => [c.id, c.code]), [[classId, null]], 'students never see the join code');
  });

  test('the teacher gives a problem to the class; the student sees samples, never hidden tests', async () => {
    const problem = await createProblem(teacher);
    session = await teacher.api.post<SessionDto>('/sessions', {
      source: { kind: 'PROBLEM', problemId: problem.id }, classId, opensAt: null, closesAt: null,
      settings: { durationMinutes: null, allowedLanguages: [], maxSubmissionsPerProblem: 2, feedback: 'FULL', checkPlagiarism: false, checkAiUsage: false },
    });
    assert.equal(session.state, 'OPEN');
    const view = await student.api.get<{ samples: { input: string }[] }>(`/sessions/${session.id}/problems/${session.problems[0].key}`);
    assert.deepEqual(view.samples.map((s) => s.input.trim()), ['1 2']);
    assert.ok(!JSON.stringify(view).includes('1000000000'), 'the hidden test does not reach the student');
    assert.equal((await student.api.status('GET', `/problems/${problem.id}`)).status, 403, 'students never open the bank');
  });

  test('a submission is admitted; the per-problem limit holds; others cannot submit or read', async () => {
    const submit = (who: Account) => who.api.status('POST', '/submissions', {
      sessionId: session.id, problemKey: session.problems[0].key, language: 'python', sourceCode: 'a, b = map(int, input().split())\nprint(a + b)\n',
    });
    assert.equal((await submit(student)).status, 200);
    assert.equal((await submit(student)).status, 200);
    const third = await submit(student);
    assert.deepEqual([third.status, third.code], [409, 'judging.submission_limit']);
    const list = await student.api.get<{ items: { status: string }[] }>(`/submissions?sessionId=${session.id}&mine=true`);
    assert.equal(list.items.length, 2);
    outsider = await registerStudent(stack, 'Người Ngoài');
    assert.ok([403, 404].includes((await submit(outsider)).status), 'not a member of the class');
    assert.equal((await outsider.api.status('GET', `/sessions/${session.id}`)).status, 404);
    assert.equal((await teacher.api.get<{ items: unknown[] }>(`/submissions?sessionId=${session.id}`)).items.length, 2, 'the teacher sees them');
  });

  test('archiving makes the class read-only; restoring reopens it', async () => {
    await teacher.api.post(`/classes/${classId}/archive`);
    // The student has no attempts left either, so assert the archive's own refusal (checked before the limit).
    const blocked = await student.api.status('POST', '/submissions', { sessionId: session.id, problemKey: session.problems[0].key, language: 'python', sourceCode: 'print(1)\n' });
    assert.deepEqual([blocked.status, blocked.code], [409, 'assessment.cannot_submit']);
    const add = await teacher.api.status('POST', `/classes/${classId}/students`, { email: outsider.email });
    assert.deepEqual([add.status, add.code], [409, 'classroom.archived']);
    await teacher.api.post(`/classes/${classId}/restore`);
    assert.equal((await teacher.api.status('POST', `/classes/${classId}/students`, { email: outsider.email })).status, 200);
  });
});
