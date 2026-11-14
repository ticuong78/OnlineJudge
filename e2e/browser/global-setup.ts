import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createProblem, createTeacher, registerStudent, signInAdmin, uniqueEmail } from '../support/journeys.js';
import { E2E_ADMIN, startBackend } from '../support/stack.js';
import { STATE_FILE, type BrowserState } from './state.js';

/** Starts the isolated backend and creates the people and data the browser tests act on, through the real API. */
export default async function globalSetup() {
  // Redis database 5 here, 1 for the HTTP suite: the two suites never flush each other's data.
  const stack = await startBackend({ frontendUrl: process.env.E2E_WEB_URL ?? 'http://localhost:3100', redisUrl: process.env.E2E_BROWSER_REDIS_URL ?? 'redis://127.0.0.1:56379/5' });
  try {
    const admin = await signInAdmin(stack);
    const lan = await createTeacher(stack, admin, 'Nguyễn Thị Lan');
    const minh = await createTeacher(stack, admin, 'Trần Văn Minh');

    await lan.api.post('/classes', { name: 'Tin học 10A1', code: 'PW-10A1' });
    const student = await registerStudent(stack, 'Phạm Minh Anh', 'PW-10A1');
    const cls = (await lan.api.get<{ id: string }[]>('/classes'))[0];
    const [request] = await lan.api.get<{ id: string }[]>(`/classes/${cls.id}/requests`);
    await lan.api.post(`/membership-requests/${request.id}/approve`);
    const problem = await createProblem(lan);
    const session = await lan.api.post<{ id: string; problems: { key: string }[] }>('/sessions', {
      source: { kind: 'PROBLEM', problemId: problem.id }, classId: cls.id, opensAt: null, closesAt: null,
    });

    const org = await admin.api.post<{ id: string }>('/organizations', {
      name: 'Trung tâm Tin học Sao Mai', seats: 5, activeUntil: '2099-12-31', aiIncluded: true, adminUserId: lan.id,
    });
    const newEmail = uniqueEmail('gv-moi');
    await lan.api.post(`/organizations/${org.id}/invitations`, { email: newEmail, displayName: 'Lê Thu Hoa' });
    const mail = await stack.waitForMail(newEmail, (m) => !!m.code);

    const state: BrowserState = {
      admin: { email: E2E_ADMIN.email, password: E2E_ADMIN.password, name: 'Quản trị viên E2E' },
      lan: { email: lan.email, password: lan.password, name: lan.displayName },
      minh: { email: minh.email, password: minh.password, name: minh.displayName },
      student: { email: student.email, password: student.password, name: student.displayName },
      sessionId: session.id,
      problemKey: session.problems[0].key,
      organizationId: org.id,
      newTeacher: { name: 'Lê Thu Hoa', inviteUrl: mail.urls.find((u) => u.includes('/invite?id='))! },
    };
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    await stack.stop();
    throw error;
  }
  return async () => stack.stop();
}
