import type {
  AddOrganizationMemberRequest,
  CreateOrganizationRequest,
  InviteToOrganizationRequest,
  OrganizationDetailDto,
  OrganizationDto,
  OrganizationInvitationDto,
  OrganizationRole,
  UpsertOrganizationRequest,
  CreateProblemRequest,
  AcceptInvitationRequest,
  AddStudentRequest,
  AnswerKeyDto,
  ApiErrorBody,
  AuthResponse,
  BankScope,
  ClassroomDto,
  ClassStudentDto,
  CreateReplyRequest,
  CreateSessionRequest,
  CreateThreadRequest,
  DeleteClassNowRequest,
  Difficulty,
  ForgotPasswordRequest,
  ImportProblemsRequest,
  ImportProblemsResponse,
  IntegrityFlagDetailDto,
  IntegrityFlagDto,
  IntegrityFlagStatus,
  InvitationDto,
  InvitationPreviewDto,
  InviteTeacherRequest,
  JoinClassRequest,
  LeaveClassRequest,
  LearningRecordDto,
  LoginRequest,
  MembershipRequestDto,
  Paginated,
  ParsedExamDto,
  ProblemDetailDto,
  ProblemSetDto,
  ProblemSummaryDto,
  RejudgeRequest,
  RejudgeResponse,
  RegisterRequest,
  ResendCodeRequest,
  ResetPasswordRequest,
  SessionAudience,
  SessionSyncPreviewDto,
  SessionSyncResultDto,
  SessionDto,
  SessionProblemDto,
  SessionResultsDto,
  SharingDto,
  SolutionDto,
  SubmissionDetailDto,
  SubmissionDto,
  SubmitRequest,
  ProblemSectionSuggestionDto,
  SuggestDraftTestsRequest,
  SuggestProblemSectionRequest,
  SuggestTestCasesRequest,
  TestCaseDto,
  TestCaseSuggestionsDto,
  ThreadDto,
  ThreadReplyDto,
  ThreadSummaryDto,
  UpdateSessionRequest,
  UpsertClassroomRequest,
  UpsertProblemRequest,
  UpsertProblemSetRequest,
  UpsertSolutionRequest,
  UpsertTestCaseRequest,
  UserDto,
  VerificationTicketDto,
  VerifyCodeRequest,
} from '@oj/contracts';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');

const TOKEN_KEY = 'oj:token';
export const UNAUTHORIZED_EVENT = 'oj:unauthorized';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    /** Extra data from the API, e.g. `sessionId` of the session that already exists. */
    public details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  const url = `${API_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Query } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại; nếu vẫn lỗi, báo giáo viên.', 0);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = (data && typeof data === 'object' ? data : {}) as Partial<ApiErrorBody>;
    let message = Array.isArray(err.message) ? err.message.join('; ') : err.message;
    if (!message) message = typeof data === 'string' && data ? data : `Lỗi ${res.status}`;
    if (res.status === 401 && token && typeof window !== 'undefined') {
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(message, res.status, err.code, err.details);
  }
  return data as T;
}

export interface ProblemQuery {
  scope?: BankScope;
  search?: string;
  difficulty?: Difficulty | '';
  tag?: string;
  /** `organization` scope: one of the viewer's organizations (all of them when absent). */
  organizationId?: string;
  page?: number;
  pageSize?: number;
}

export interface SubmissionQuery {
  sessionId?: string;
  problemKey?: string;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SessionQuery {
  classId?: string;
  audience?: SessionAudience;
}

export const api = {
  // Auth
  login: (body: LoginRequest) => request<AuthResponse>('POST', '/auth/login', { body }),
  me: () => request<UserDto>('GET', '/auth/me'),
  register: (body: RegisterRequest) => request<VerificationTicketDto>('POST', '/auth/register', { body }),
  verifyRegistration: (body: VerifyCodeRequest) => request<AuthResponse>('POST', '/auth/register/verify', { body }),
  resendCode: (body: ResendCodeRequest) =>
    request<VerificationTicketDto>('POST', '/auth/verification/resend', { body }),
  forgotPassword: (body: ForgotPasswordRequest) =>
    request<VerificationTicketDto>('POST', '/auth/password/forgot', { body }),
  resetPassword: (body: ResetPasswordRequest) => request<AuthResponse>('POST', '/auth/password/reset', { body }),
  getInvitation: (id: string) => request<InvitationPreviewDto>('GET', `/auth/invitations/${encodeURIComponent(id)}`),
  acceptInvitation: (body: AcceptInvitationRequest) =>
    request<AuthResponse>('POST', '/auth/invitations/accept', { body }),

  // Users (admin)
  listUsers: () => request<UserDto[]>('GET', '/users'),
  deleteUser: (id: string) => request<void>('DELETE', `/users/${id}`),
  setUserVip: (id: string, vip: boolean) => request<UserDto>('PUT', `/users/${id}/vip`, { body: { vip } }),
  listInvitations: () => request<InvitationDto[]>('GET', '/users/invitations'),
  inviteTeacher: (body: InviteTeacherRequest) => request<InvitationDto>('POST', '/users/invitations', { body }),
  resendInvitation: (id: string) => request<InvitationDto>('POST', `/users/invitations/${id}/resend`),
  cancelInvitation: (id: string) => request<void>('DELETE', `/users/invitations/${id}`),

  // Organizations (OJ-8)
  listOrganizations: () => request<OrganizationDto[]>('GET', '/organizations'),
  getOrganization: (id: string) => request<OrganizationDetailDto>('GET', `/organizations/${id}`),
  createOrganization: (body: CreateOrganizationRequest) => request<OrganizationDetailDto>('POST', '/organizations', { body }),
  updateOrganization: (id: string, body: UpsertOrganizationRequest) =>
    request<OrganizationDetailDto>('PUT', `/organizations/${id}`, { body }),
  addOrganizationMember: (id: string, body: AddOrganizationMemberRequest) =>
    request<OrganizationDetailDto>('POST', `/organizations/${id}/members`, { body }),
  setOrganizationRole: (id: string, userId: string, role: OrganizationRole) =>
    request<OrganizationDetailDto>('PUT', `/organizations/${id}/members/${userId}/role`, { body: { role } }),
  /** Removes a teacher; with the caller's own id it means leaving the organization. */
  removeOrganizationMember: (id: string, userId: string) => request<void>('DELETE', `/organizations/${id}/members/${userId}`),
  inviteToOrganization: (id: string, body: InviteToOrganizationRequest) =>
    request<OrganizationInvitationDto>('POST', `/organizations/${id}/invitations`, { body }),
  cancelOrganizationInvitation: (id: string, invitationId: string) =>
    request<void>('DELETE', `/organizations/${id}/invitations/${invitationId}`),
  organizationClasses: (id: string) => request<ClassroomDto[]>('GET', `/organizations/${id}/classes`),
  myOrganizationInvitations: () => request<OrganizationInvitationDto[]>('GET', '/organization-invitations/mine'),
  acceptOrganizationInvitation: (id: string) =>
    request<OrganizationDto>('POST', `/organization-invitations/${id}/accept`),
  declineOrganizationInvitation: (id: string) => request<void>('POST', `/organization-invitations/${id}/decline`),

  // Classes
  listClasses: () => request<ClassroomDto[]>('GET', '/classes'),
  /** A personal class joins one of the teacher's organizations (one way). */
  moveClassToOrganization: (id: string, organizationId: string) =>
    request<ClassroomDto>('PUT', `/classes/${id}/organization`, { body: { organizationId } }),
  getClass: (id: string) => request<ClassroomDto>('GET', `/classes/${id}`),
  createClass: (body: UpsertClassroomRequest) => request<ClassroomDto>('POST', '/classes', { body }),
  updateClass: (id: string, body: UpsertClassroomRequest) => request<ClassroomDto>('PUT', `/classes/${id}`, { body }),
  archiveClass: (id: string) => request<ClassroomDto>('POST', `/classes/${id}/archive`),
  restoreClass: (id: string) => request<ClassroomDto>('POST', `/classes/${id}/restore`),
  scheduleClassDeletion: (id: string, days: number) =>
    request<ClassroomDto>('POST', `/classes/${id}/schedule-deletion`, { body: { days } }),
  cancelClassDeletion: (id: string) => request<ClassroomDto>('POST', `/classes/${id}/cancel-deletion`),
  deleteClassNow: (id: string, body: DeleteClassNowRequest) =>
    request<void>('POST', `/classes/${id}/delete-now`, { body }),
  listClassStudents: (id: string) => request<ClassStudentDto[]>('GET', `/classes/${id}/students`),
  listUnassignedStudents: () => request<ClassStudentDto[]>('GET', '/classes/unassigned-students'),
  /** Admin: adds the student to `classId`; other classes the student is in are kept. */
  moveStudent: (studentId: string, classId: string) =>
    request<ClassStudentDto>('PUT', `/classes/students/${studentId}`, { body: { classId } }),
  addStudent: (classId: string, body: AddStudentRequest) =>
    request<ClassStudentDto>('POST', `/classes/${classId}/students`, { body }),
  removeStudent: (classId: string, studentId: string) =>
    request<void>('DELETE', `/classes/${classId}/students/${studentId}`),

  // Join / leave requests (student asks, class teacher or admin decides)
  joinClass: (body: JoinClassRequest) => request<MembershipRequestDto>('POST', '/classes/join', { body }),
  leaveClass: (classId: string, body: LeaveClassRequest = {}) =>
    request<MembershipRequestDto>('POST', `/classes/${classId}/leave`, { body }),
  myMembershipRequests: () => request<MembershipRequestDto[]>('GET', '/membership-requests/mine'),
  cancelMembershipRequest: (id: string) =>
    request<MembershipRequestDto>('POST', `/membership-requests/${id}/cancel`),
  listClassRequests: (classId: string) => request<MembershipRequestDto[]>('GET', `/classes/${classId}/requests`),
  approveMembershipRequest: (id: string) =>
    request<MembershipRequestDto>('POST', `/membership-requests/${id}/approve`),
  rejectMembershipRequest: (id: string) =>
    request<MembershipRequestDto>('POST', `/membership-requests/${id}/reject`),
  approveAllJoinRequests: (classId: string) =>
    request<{ approved: number }>('POST', `/classes/${classId}/requests/approve-all`),

  // Problem bank
  listProblems: (q: ProblemQuery = {}) =>
    request<Paginated<ProblemSummaryDto>>('GET', '/problems', { query: { ...q } }),
  getProblem: (id: string) => request<ProblemDetailDto>('GET', `/problems/${id}`),
  createProblem: (body: CreateProblemRequest) => request<ProblemDetailDto>('POST', '/problems', { body }),
  updateProblem: (id: string, body: UpsertProblemRequest) =>
    request<ProblemDetailDto>('PUT', `/problems/${id}`, { body }),
  deleteProblem: (id: string) => request<void>('DELETE', `/problems/${id}`),
  updateProblemSharing: (id: string, body: SharingDto) =>
    request<ProblemDetailDto>('PUT', `/problems/${id}/sharing`, { body }),
  copyProblem: (id: string) => request<ProblemDetailDto>('POST', `/problems/${id}/copy`),
  createTestCase: (problemId: string, body: UpsertTestCaseRequest) =>
    request<TestCaseDto>('POST', `/problems/${problemId}/test-cases`, { body }),
  updateTestCase: (problemId: string, testCaseId: string, body: UpsertTestCaseRequest) =>
    request<TestCaseDto>('PUT', `/problems/${problemId}/test-cases/${testCaseId}`, { body }),
  suggestDraftTests: (body: SuggestDraftTestsRequest) =>
    request<TestCaseSuggestionsDto>('POST', '/problems/suggest-tests', { body }),
  suggestProblemSection: (body: SuggestProblemSectionRequest) =>
    request<ProblemSectionSuggestionDto>('POST', '/problems/suggest-section', { body }),
  suggestTestCases: (problemId: string, body: SuggestTestCasesRequest) =>
    request<TestCaseSuggestionsDto>('POST', `/problems/${problemId}/test-cases/suggest`, { body }),
  deleteTestCase: (problemId: string, testCaseId: string) =>
    request<void>('DELETE', `/problems/${problemId}/test-cases/${testCaseId}`),
  saveSolution: (problemId: string, body: UpsertSolutionRequest) =>
    request<SolutionDto>('PUT', `/problems/${problemId}/solution`, { body }),
  deleteSolution: (problemId: string) => request<void>('DELETE', `/problems/${problemId}/solution`),

  // Imports (into the caller's bank)
  parseExam: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<ParsedExamDto>('POST', '/imports/parse', { body: fd });
  },
  parseExamText: (text: string) => request<ParsedExamDto>('POST', '/imports/parse-text', { body: { text } }),
  confirmImport: (body: ImportProblemsRequest) =>
    request<ImportProblemsResponse>('POST', '/imports/confirm', { body }),

  // Problem set bank
  listProblemSets: (scope: BankScope = 'mine') => request<ProblemSetDto[]>('GET', '/problem-sets', { query: { scope } }),
  getProblemSet: (id: string) => request<ProblemSetDto>('GET', `/problem-sets/${id}`),
  createProblemSet: (body: UpsertProblemSetRequest) => request<ProblemSetDto>('POST', '/problem-sets', { body }),
  updateProblemSet: (id: string, body: UpsertProblemSetRequest) =>
    request<ProblemSetDto>('PUT', `/problem-sets/${id}`, { body }),
  deleteProblemSet: (id: string) => request<void>('DELETE', `/problem-sets/${id}`),
  updateProblemSetSharing: (id: string, isPublic: boolean) =>
    request<ProblemSetDto>('PUT', `/problem-sets/${id}/sharing`, { body: { isPublic } }),
  copyProblemSet: (id: string) => request<ProblemSetDto>('POST', `/problem-sets/${id}/copy`),
  getAnswerKey: (id: string) => request<AnswerKeyDto>('GET', `/problem-sets/${id}/answer-key`),

  // Sessions
  listSessions: (q: SessionQuery = {}) => request<SessionDto[]>('GET', '/sessions', { query: { ...q } }),
  getSession: (id: string) => request<SessionDto>('GET', `/sessions/${id}`),
  getSessionProblem: (id: string, key: string) =>
    request<SessionProblemDto>('GET', `/sessions/${id}/problems/${encodeURIComponent(key)}`),
  createSession: (body: CreateSessionRequest) => request<SessionDto>('POST', '/sessions', { body }),
  updateSession: (id: string, body: UpdateSessionRequest) => request<SessionDto>('PUT', `/sessions/${id}`, { body }),
  deleteSession: (id: string) => request<void>('DELETE', `/sessions/${id}`),
  getSessionResults: (id: string) => request<SessionResultsDto>('GET', `/sessions/${id}/results`),
  startSession: (id: string) => request<SessionDto>('POST', `/sessions/${id}/start`),
  refreshSession: (id: string) => request<SessionDto>('POST', `/sessions/${id}/refresh`),
  previewSessionSync: (id: string) => request<SessionSyncPreviewDto>('GET', `/sessions/${id}/sync`),
  syncSession: (id: string) => request<SessionSyncResultDto>('POST', `/sessions/${id}/sync`),
  rejudgeSession: (id: string, body: RejudgeRequest = {}) =>
    request<RejudgeResponse>('POST', `/sessions/${id}/rejudge`, { body }),

  // Submissions
  submit: (body: SubmitRequest) => request<SubmissionDto>('POST', '/submissions', { body }),
  listSubmissions: (q: SubmissionQuery = {}) =>
    request<Paginated<SubmissionDto>>('GET', '/submissions', {
      query: { ...q, mine: q.mine ? 'true' : undefined },
    }),
  getSubmission: (id: string) => request<SubmissionDetailDto>('GET', `/submissions/${id}`),

  // Integrity checks (staff only)
  listIntegrityFlags: (q: { status?: IntegrityFlagStatus; sessionId?: string } = {}) =>
    request<IntegrityFlagDto[]>('GET', '/integrity-flags', { query: { ...q } }),
  getIntegrityFlag: (id: string) => request<IntegrityFlagDetailDto>('GET', `/integrity-flags/${id}`),
  acknowledgeIntegrityFlag: (id: string) => request<IntegrityFlagDto>('POST', `/integrity-flags/${id}/acknowledge`),

  // Class community
  listThreads: (classId: string, q: { sessionId?: string; problemKey?: string } = {}) =>
    request<ThreadSummaryDto[]>('GET', `/classes/${classId}/threads`, { query: { ...q } }),
  createThread: (classId: string, body: CreateThreadRequest) =>
    request<ThreadDto>('POST', `/classes/${classId}/threads`, { body }),
  getThread: (id: string) => request<ThreadDto>('GET', `/threads/${id}`),
  replyThread: (id: string, body: CreateReplyRequest) => request<ThreadReplyDto>('POST', `/threads/${id}/replies`, { body }),
  deleteThread: (id: string) => request<void>('DELETE', `/threads/${id}`),
  deleteReply: (id: string, replyId: string) => request<void>('DELETE', `/threads/${id}/replies/${replyId}`),
  pinThread: (id: string, pinned: boolean) => request<ThreadDto>('POST', `/threads/${id}/pin`, { body: { pinned } }),

  // Learning record
  myProgress: () => request<LearningRecordDto>('GET', '/progress/me'),
};

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Đã có lỗi xảy ra';
}
