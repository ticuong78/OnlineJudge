import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Api, acceptTeacherInvitation, registerStudent, signIn, signInAdmin, uniqueEmail } from '../support/journeys.js';
import { startBackend, type BackendStack } from '../support/stack.js';

describe('E2E accounts: sign-in, invitations, sign-up, password reset', () => {
  let stack: BackendStack;
  before(async () => { stack = await startBackend(); });
  after(async () => { await stack?.stop(); });

  test('the administrator signs in; wrong passwords and missing tokens are refused', async () => {
    const admin = await signInAdmin(stack);
    assert.equal((await admin.api.get<{ role: string }>('/auth/me')).role, 'ADMIN');
    const anon = new Api(stack.apiUrl);
    assert.equal((await anon.status('POST', '/auth/login', { email: admin.email, password: 'sai-mat-khau' })).status, 401);
    assert.equal((await anon.status('GET', '/auth/me')).status, 401);
    assert.equal((await new Api(stack.apiUrl, 'not-a-token').status('GET', '/classes')).status, 401);
  });

  test('a teacher accepts the emailed invitation and signs in with their own password', async () => {
    const admin = await signInAdmin(stack);
    const email = uniqueEmail('gv');
    await admin.api.post('/users/invitations', { email, displayName: 'Nguyễn Thị Lan', phone: null });
    const mail = await stack.waitForMail(email);
    assert.ok(mail.urls.some((u) => /\/invite\?id=[\w-]+#c=\d{6}$/.test(u)), 'the code travels in the fragment, not the query');
    const teacher = await acceptTeacherInvitation(stack, email);
    const me = await teacher.api.get<{ role: string; displayName: string; organizations: unknown[] }>('/auth/me');
    assert.deepEqual([me.role, me.displayName, me.organizations], ['TEACHER', 'Nguyễn Thị Lan', []]);
    assert.ok((await signIn(stack, email, teacher.password)).token);
  });

  test('a student signs up with the emailed code; a wrong code is refused', async () => {
    const email = uniqueEmail('hs');
    const api = new Api(stack.apiUrl);
    const ticket = await api.post<{ verificationId: string }>('/auth/register', { email, password: 'mat-khau-hs', displayName: 'Phạm Minh Anh', phone: null });
    const mail = await stack.waitForMail(email, (m) => !!m.code);
    const wrong = mail.code === '000000' ? '111111' : '000000';
    const wrongTry = await api.status('POST', '/auth/register/verify', { verificationId: ticket.verificationId, code: wrong });
    assert.deepEqual([wrongTry.status, wrongTry.code], [400, 'identity.wrong_code']);
    const res = await api.post<{ user: { role: string } }>('/auth/register/verify', { verificationId: ticket.verificationId, code: mail.code });
    assert.equal(res.user.role, 'STUDENT');
    const reuse = await api.status('POST', '/auth/register/verify', { verificationId: ticket.verificationId, code: mail.code });
    assert.ok(reuse.status >= 400 && reuse.status < 500 && !!reuse.code, `a code works once (got ${reuse.status} ${reuse.code})`);
  });

  test('password reset by emailed link: the new password works, the old one and old sessions do not', async () => {
    const student = await registerStudent(stack, 'Hoàng Gia Bảo');
    const api = new Api(stack.apiUrl);
    await api.post('/auth/password/forgot', { email: student.email });
    const mail = await stack.waitForMail(student.email, (m) => m.urls.some((u) => u.includes('/forgot-password?v=')));
    const link = new URL(mail.urls.find((u) => u.includes('/forgot-password?v='))!);
    const verificationId = link.searchParams.get('v')!;
    const token = new URLSearchParams(link.hash.slice(1)).get('t')!;
    assert.ok(token, 'the reset token travels in the fragment');
    await api.post('/auth/password/reset', { verificationId, token, newPassword: 'mat-khau-moi-123' });
    assert.ok((await signIn(stack, student.email, 'mat-khau-moi-123')).token);
    assert.equal((await api.status('POST', '/auth/login', { email: student.email, password: student.password })).status, 401);
    assert.equal((await student.api.status('GET', '/auth/me')).status, 401, 'the session from before the reset ended');
  });
});
