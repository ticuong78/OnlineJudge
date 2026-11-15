/**
 * Real user journeys over the public HTTP API, shared by the HTTP and the browser end-to-end tests to set up
 * accounts the way people get them: an emailed teacher invitation, a student sign-up with an emailed code.
 */
import type { BackendStack } from './stack.js';
import { E2E_ADMIN } from './stack.js';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(`${status} ${code ?? ''} ${message}`);
  }
}

export class Api {
  constructor(private readonly baseUrl: string, readonly token: string | null = null) {}

  as(token: string) {
    return new Api(this.baseUrl, token);
  }

  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json?.code, json?.message ?? text);
    return json as T;
  }

  /** The status of a call that is expected to fail (or 2xx). */
  async status(method: string, path: string, body?: unknown): Promise<{ status: number; code?: string }> {
    try {
      await this.call(method, path, body);
      return { status: 200 };
    } catch (e) {
      if (e instanceof ApiError) return { status: e.status, code: e.code };
      throw e;
    }
  }

  get = <T = unknown>(path: string) => this.call<T>('GET', path);
  post = <T = unknown>(path: string, body?: unknown) => this.call<T>('POST', path, body ?? {});
  put = <T = unknown>(path: string, body?: unknown) => this.call<T>('PUT', path, body ?? {});
  delete = <T = unknown>(path: string) => this.call<T>('DELETE', path);
}

export interface Account {
  id: string;
  email: string;
  password: string;
  displayName: string;
  token: string;
  api: Api;
}

let counter = 0;
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}@e2e.test`;

export async function signIn(stack: BackendStack, email: string, password: string): Promise<Account> {
  const res = await new Api(stack.apiUrl).post<{ accessToken: string; user: { id: string; displayName: string } }>('/auth/login', { email, password });
  return { id: res.user.id, email, password, displayName: res.user.displayName, token: res.accessToken, api: new Api(stack.apiUrl, res.accessToken) };
}

export const signInAdmin = (stack: BackendStack) => signIn(stack, E2E_ADMIN.email, E2E_ADMIN.password);

/** The administrator invites a teacher; the teacher opens the emailed invitation and sets a password. */
export async function createTeacher(stack: BackendStack, admin: Account, displayName: string): Promise<Account> {
  const email = uniqueEmail('gv');
  await admin.api.post('/users/invitations', { email, displayName, phone: null });
  return acceptTeacherInvitation(stack, email);
}

/** Opens the latest teacher invitation emailed to `email` and activates the account. */
export async function acceptTeacherInvitation(stack: BackendStack, email: string, password = 'mat-khau-giao-vien'): Promise<Account> {
  const mail = await stack.waitForMail(email, (m) => !!m.code && m.urls.some((u) => u.includes('/invite?id=')));
  const invitationId = new URL(mail.urls.find((u) => u.includes('/invite?id='))!).searchParams.get('id')!;
  const res = await new Api(stack.apiUrl).post<{ accessToken: string; user: { id: string; displayName: string } }>(
    '/auth/invitations/accept',
    { invitationId, code: mail.code, password },
  );
  return { id: res.user.id, email, password, displayName: res.user.displayName, token: res.accessToken, api: new Api(stack.apiUrl, res.accessToken) };
}

/** A student signs up with the emailed code; an optional class code sends a join request. */
export async function registerStudent(stack: BackendStack, displayName: string, classCode?: string): Promise<Account> {
  const email = uniqueEmail('hs');
  const password = 'mat-khau-hoc-sinh';
  const api = new Api(stack.apiUrl);
  const ticket = await api.post<{ verificationId: string }>('/auth/register', { email, password, displayName, phone: null, ...(classCode ? { classCode } : {}) });
  const mail = await stack.waitForMail(email, (m) => !!m.code);
  const res = await api.post<{ accessToken: string; user: { id: string; displayName: string } }>('/auth/register/verify', { verificationId: ticket.verificationId, code: mail.code });
  return { id: res.user.id, email, password, displayName: res.user.displayName, token: res.accessToken, api: new Api(stack.apiUrl, res.accessToken) };
}

/** A problem with a sample and hidden tests, in the teacher's bank. */
export async function createProblem(teacher: Account, title = 'Tổng hai số') {
  return teacher.api.post<{ id: string; code: string }>('/problems', {
    title,
    difficulty: 'EASY',
    tags: ['e2e'],
    statement: 'Cho hai số nguyên a và b. In ra a + b.',
    inputFormat: 'Hai số nguyên a, b.',
    outputFormat: 'Tổng a + b.',
    constraints: '|a|, |b| <= 10^9',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    testCases: [
      { input: '1 2\n', expectedOutput: '3\n', isSample: true, points: 1 },
      { input: '1000000000 1000000000\n', expectedOutput: '2000000000\n', isSample: false, points: 2 },
    ],
  });
}
