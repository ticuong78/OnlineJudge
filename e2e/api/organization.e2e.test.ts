import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { acceptTeacherInvitation, createProblem, createTeacher, registerStudent, signIn, signInAdmin, uniqueEmail, type Account } from '../support/journeys.js';
import { startBackend, type BackendStack } from '../support/stack.js';

interface Org { id: string; seatsUsed: number; seats: number; members: { userId: string; role: string }[] }

describe('E2E organization plan (OJ-8)', () => {
  let stack: BackendStack;
  let admin: Account;
  let lan: Account; // org admin
  let minh: Account; // existing teacher, invited
  let outsider: Account;
  let org: Org;
  let classId: string;
  let problemId: string;

  before(async () => {
    stack = await startBackend();
    admin = await signInAdmin(stack);
    lan = await createTeacher(stack, admin, 'Nguyễn Thị Lan');
    minh = await createTeacher(stack, admin, 'Trần Văn Minh');
    outsider = await createTeacher(stack, admin, 'Lê Thu Hoa');
  });
  after(async () => { await stack?.stop(); });

  const refresh = async (a: Account) => signIn(stack, a.email, a.password);

  test('the administrator creates an organization with Lan as its org admin', async () => {
    org = await admin.api.post<Org>('/organizations', { name: 'Trung tâm E2E', seats: 3, activeUntil: '2099-12-31', aiIncluded: true, adminUserId: lan.id });
    assert.deepEqual([org.seatsUsed, org.members.map((m) => m.role)], [1, ['ADMIN']]);
    assert.equal((await lan.api.status('POST', '/organizations', { name: 'Không được', seats: 1, activeUntil: '2099-12-31', aiIncluded: false, adminUserId: lan.id })).status, 403);
  });

  test('an existing teacher accepts on their home page and gets AI through the organization', async () => {
    const inv = await lan.api.post<{ id: string; forExistingAccount: boolean }>(`/organizations/${org.id}/invitations`, { email: minh.email, displayName: 'x x' });
    assert.equal(inv.forExistingAccount, true);
    const mail = await stack.waitForMail(minh.email, (m) => m.subject.includes('tổ chức'));
    assert.equal(mail.code, null, 'the notice carries no code');
    assert.equal((await minh.api.get<unknown[]>('/organization-invitations/mine')).length, 1);
    await minh.api.post(`/organization-invitations/${inv.id}/accept`);
    minh = await refresh(minh);
    const me = await minh.api.get<{ canUseAi: boolean; vip: boolean; organizations: { role: string }[] }>('/auth/me');
    assert.deepEqual([me.vip, me.canUseAi, me.organizations.map((o) => o.role)], [false, true, ['TEACHER']]);
  });

  test('a new email gets the account invitation; accepting it joins; then the seats are full', async () => {
    const email = uniqueEmail('gv-moi');
    await lan.api.post(`/organizations/${org.id}/invitations`, { email, displayName: 'Giáo Viên Mới' });
    const fresh = await acceptTeacherInvitation(stack, email);
    assert.equal((await fresh.api.get<{ organizations: unknown[] }>('/auth/me')).organizations.length, 1);
    const full = await lan.api.status('POST', `/organizations/${org.id}/invitations`, { email: uniqueEmail('x'), displayName: 'x x' });
    assert.deepEqual([full.status, full.code], [409, 'organization.no_seats']);
  });

  test("the org admin manages a member's organization class; outsiders see nothing", async () => {
    const cls = await minh.api.post<{ id: string; organization: { id: string } }>('/classes', { name: 'Đội tuyển E2E', code: 'E2E-ORG1', organizationId: org.id });
    classId = cls.id;
    assert.equal(cls.organization.id, org.id);
    const student = await registerStudent(stack, 'Học Sinh Tổ Chức');
    await lan.api.post(`/classes/${classId}/students`, { email: student.email });
    assert.equal((await lan.api.get<unknown[]>(`/classes/${classId}/students`)).length, 1);
    assert.equal((await lan.api.get<unknown[]>(`/organizations/${org.id}/classes`)).length, 1);
    assert.equal((await outsider.api.status('GET', `/organizations/${org.id}`)).status, 404);
    assert.equal((await outsider.api.status('GET', `/classes/${classId}/students`)).status, 403);
    assert.equal((await student.api.status('GET', '/organizations')).status, 403);
    await lan.api.post(`/classes/${classId}/archive`);
    const del = await lan.api.status('POST', `/classes/${classId}/delete-now`, { confirmName: 'Đội tuyển E2E' });
    assert.deepEqual([del.status, del.code], [403, 'classroom.only_teacher_deletes'], 'org admins archive, never delete');
    await lan.api.post(`/classes/${classId}/restore`);
  });

  test('problems shared with the organization are seen in full by colleagues only', async () => {
    const p = await createProblem(minh, 'Bài của tổ chức');
    problemId = p.id;
    await minh.api.put(`/problems/${p.id}/sharing`, { isPublic: false, publicTests: false, publicSolution: false, organizationIds: [org.id] });
    const seen = await lan.api.get<{ testCases: { isSample: boolean }[] }>(`/problems/${p.id}`);
    assert.ok(seen.testCases.some((t) => !t.isSample), 'hidden tests visible to colleagues');
    const listed = await lan.api.get<{ items: { id: string }[] }>('/problems?scope=organization');
    assert.deepEqual(listed.items.map((i) => i.id), [p.id]);
    assert.equal((await outsider.api.status('GET', `/problems/${p.id}`)).status, 404);
    const wrongOrg = await outsider.api.status('PUT', `/problems/${(await createProblem(outsider)).id}/sharing`, { isPublic: false, publicTests: false, publicSolution: false, organizationIds: [org.id] });
    assert.equal(wrongOrg.status, 403);
  });

  test('leaving: the class stays with the organization, problems are copied, AI and access end', async () => {
    await minh.api.delete(`/organizations/${org.id}/members/${minh.id}`);
    // The class and problem handovers run as event handlers: wait until they are visible (up to 10 s).
    const handedOver = async () => (await admin.api.get<{ teacherId: string }>(`/classes/${classId}`)).teacherId === lan.id;
    for (let i = 0; i < 50 && !(await handedOver()); i++) await new Promise((r) => setTimeout(r, 200));
    const cls = await admin.api.get<{ teacherId: string; organization: { id: string } }>(`/classes/${classId}`);
    assert.deepEqual([cls.teacherId, cls.organization.id], [lan.id, org.id]);
    const copies = (await lan.api.get<{ items: { copiedFrom: { id: string } | null }[] }>('/problems?scope=mine')).items.filter((i) => i.copiedFrom?.id === problemId);
    assert.equal(copies.length, 1);
    minh = await refresh(minh);
    assert.equal((await minh.api.get<{ canUseAi: boolean }>('/auth/me')).canUseAi, false);
    assert.equal((await minh.api.status('GET', `/classes/${classId}/students`)).status, 403);
    assert.equal((await minh.api.get<{ sharing: { organizationIds: string[] } }>(`/problems/${problemId}`)).sharing.organizationIds.length, 0);
  });
});
