import type {
  Difficulty,
  Language,
  ProblemSetType,
  Role,
  SubmissionStatus,
  Verdict,
} from './enums';
import type { TestCaseResult } from './judge-messages';

// ---------- AI usage (OJ-21) ----------
/** What counts against a monthly allowance: one successful request each. */
export const AiFeatures = ['IMPORT', 'IMAGE_IMPORT', 'SECTION', 'TESTS', 'AI_USAGE_CHECK'] as const;
export type AiFeature = (typeof AiFeatures)[number];
/** NONE: students. FREE: teachers without VIP. PLUS: VIP teachers and organizations with AI. UNLIMITED: administrators. */
export type AiPlan = 'NONE' | 'FREE' | 'PLUS' | 'UNLIMITED';

export interface AiFeatureUsageDto {
  feature: AiFeature;
  /** Uses allowed this month; null = no limit. */
  limit: number | null;
  used: number;
}

export interface AiUsageDto {
  plan: AiPlan;
  /** The month the counts belong to, Vietnam time ("2026-11"). */
  period: string;
  /** When the allowances start again (ISO, the 1st of next month 00:00 Vietnam time). */
  resetsAt: string;
  /** False when the server has no AI key: nothing is counted and AI features are off. */
  aiAvailable: boolean;
  features: AiFeatureUsageDto[];
}

// ---------- Identity ----------
export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  phone: string | null;
  createdAt: string;
  /** VIP teacher: may use the AI features. Only meaningful for teachers. */
  vip: boolean;
  /** Full AI access (administrators, VIP teachers, members of an active organization with AI): needed for the AI-usage check. */
  canUseAi: boolean;
  /** How much AI this account may use (OJ-21): NONE for students, FREE (monthly allowance) for other teachers. */
  aiPlan: AiPlan;
  /** Teachers: the organizations they belong to (OJ-8). Empty for students and administrators. */
  organizations: OrganizationMembershipDto[];
}

export interface SetVipRequest {
  vip: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Step 1 of student sign-up: an OTP is emailed; the account is created only after verification. */
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  phone: string | null;
  /** Optional: with a class code the new account also asks to join that class (the teacher approves). */
  classCode?: string | null;
}

/** Handle for a pending email verification (sign-up or password reset). */
export interface VerificationTicketDto {
  verificationId: string;
  email: string;
  expiresAt: string;
  /** The "send again" button stays disabled until this time. */
  resendAvailableAt: string;
}

export interface VerifyCodeRequest {
  verificationId: string;
  code: string;
}

export interface ResendCodeRequest {
  verificationId: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

/** `verificationId` and `token` come from the link in the reset email; a password reset has no typed code. */
export interface ResetPasswordRequest {
  verificationId: string;
  token: string;
  newPassword: string;
}

// Teacher invitations (admin -> teacher email -> teacher sets own password)
export interface InviteTeacherRequest {
  email: string;
  displayName: string;
  phone: string | null;
}

export interface InvitationDto {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Public view of an invitation, shown on the accept page. */
export interface InvitationPreviewDto {
  email: string;
  displayName: string;
  expiresAt: string;
}

export interface AcceptInvitationRequest {
  invitationId: string;
  code: string;
  password: string;
}

// ---------- Organizations (OJ-8: centers and schools) ----------
/** ADMIN = org admin (manages the organization's members and classes); TEACHER = member. */
export type OrganizationRole = 'ADMIN' | 'TEACHER';

/** One of the signed-in teacher's organizations. */
export interface OrganizationMembershipDto {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  /** Today is on or before `activeUntil`. */
  active: boolean;
  aiIncluded: boolean;
}

export interface OrganizationDto {
  id: string;
  name: string;
  /** Teacher seats: members plus pending invitations may not exceed this. */
  seats: number;
  seatsUsed: number;
  memberCount: number;
  /** Last day of the plan (YYYY-MM-DD, Vietnam time), inclusive. */
  activeUntil: string;
  active: boolean;
  /** Members get the AI features while the organization is active. */
  aiIncluded: boolean;
  createdAt: string;
  /** The viewer's role in this organization; null for the system administrator. */
  myRole: OrganizationRole | null;
}

export interface OrganizationMemberDto {
  userId: string;
  displayName: string;
  email: string;
  role: OrganizationRole;
  joinedAt: string;
}

export type OrganizationInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export interface OrganizationInvitationDto {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  displayName: string;
  /** true = sent to a teacher who already has an account (they accept on their home page). */
  forExistingAccount: boolean;
  status: OrganizationInvitationStatus;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

export interface OrganizationDetailDto extends OrganizationDto {
  members: OrganizationMemberDto[];
  /** Pending invitations (each holds a seat until accepted, declined, cancelled or expired). */
  invitations: OrganizationInvitationDto[];
}

export interface UpsertOrganizationRequest {
  name: string;
  seats: number;
  /** YYYY-MM-DD */
  activeUntil: string;
  aiIncluded: boolean;
}

export interface CreateOrganizationRequest extends UpsertOrganizationRequest {
  /** The first org admin: an existing teacher account. */
  adminUserId: string;
}

export interface InviteToOrganizationRequest {
  email: string;
  /** Used when the email has no account yet. */
  displayName: string;
}

/** Administrator only: put an existing teacher into the organization directly. */
export interface AddOrganizationMemberRequest {
  userId: string;
  role: OrganizationRole;
}

export interface SetOrganizationRoleRequest {
  role: OrganizationRole;
}

// ---------- Classrooms ----------
export type ClassStatus = 'ACTIVE' | 'ARCHIVED';

/**
 * A class: one teacher, many students, sessions of its own. A student may belong to several classes.
 * Students ask to join with `code` (or to leave) and the teacher approves; teachers add/remove students directly.
 * ARCHIVED = course finished: read-only, no new students or submissions; can be restored
 * until it is deleted for good (`purgeAt`).
 */
export interface ClassroomDto {
  id: string;
  name: string;
  /** Join code, e.g. 22DTHC5. Only sent to the class teacher and the admin. */
  code: string | null;
  status: ClassStatus;
  teacherId: string;
  teacherName: string;
  /** Students currently in the class (not those who moved away). */
  studentCount: number;
  archivedAt: string | null;
  /** When an archived class will be deleted for good; null = not scheduled. */
  purgeAt: string | null;
  createdAt: string;
  /** Student view only: false once the student left the class (kept as history). */
  isCurrent?: boolean;
  /** Teacher/admin view only: join and leave requests waiting for a decision. */
  pendingRequestCount?: number;
  /** The organization the class belongs to; null = the teacher's personal class (OJ-8). */
  organization: { id: string; name: string } | null;
}

export interface UpsertClassroomRequest {
  name: string;
  code: string;
  /**
   * The teacher in charge. Admin: any teacher. Org admin (organization classes only): a member of the class's
   * organization. Teachers create classes for themselves.
   */
  teacherId?: string | null;
  /** On create only: one of the creator's organizations, or null/absent for a personal class. */
  organizationId?: string | null;
}

/** Moves a personal class into one of the teacher's organizations (one way in the pilot). */
export interface MoveClassToOrganizationRequest {
  organizationId: string;
}

export interface ScheduleClassDeletionRequest {
  /** 1..365 days from now. */
  days: number;
}

export interface DeleteClassNowRequest {
  /** Must equal the class name, as a confirmation. */
  confirmName: string;
}

export interface ClassStudentDto {
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  /** null for students not yet in any class (unassigned list). */
  classId: string | null;
  enrolledAt: string | null;
}

/** Admin: put a student (e.g. from the "no class" list) into a class. Other classes are not affected. */
export interface MoveStudentRequest {
  classId: string;
}

/** Teacher/admin: add a registered student to the class by email, no request needed. */
export interface AddStudentRequest {
  email: string;
}

export const MembershipRequestKinds = ['JOIN', 'LEAVE'] as const;
export type MembershipRequestKind = (typeof MembershipRequestKinds)[number];
export type MembershipRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** A student's request to join or leave a class; the class teacher (or admin) decides. */
export interface MembershipRequestDto {
  id: string;
  kind: MembershipRequestKind;
  status: MembershipRequestStatus;
  classId: string;
  className: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  /** Optional note from the student, e.g. why they want to leave. */
  message: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface JoinClassRequest {
  classCode: string;
  message?: string | null;
}

export interface LeaveClassRequest {
  message?: string | null;
}

// ---------- Catalog (each teacher's problem bank = blueprints) ----------
/**
 * What other teachers (and students, through public sessions) may see of a blueprint.
 * `publicTests` and `publicSolution` require `isPublic`.
 * `organizationIds`: organizations of the owner whose teachers see the whole problem (statement, tests, solution).
 */
export interface SharingDto {
  isPublic: boolean;
  publicTests: boolean;
  publicSolution: boolean;
  organizationIds: string[];
}

/** Where a copied blueprint came from. */
export interface SourceRefDto {
  id: string;
  code: string;
  ownerName: string;
}

export interface TestCaseDto {
  id: string;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
  order: number;
}

export interface SolutionDto {
  explanation: string;
  language: Language | null;
  code: string;
}

export interface ProblemSummaryDto {
  id: string;
  code: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  testCaseCount: number;
  hasSolution: boolean;
  ownerId: string;
  ownerName: string;
  sharing: SharingDto;
  copiedFrom: SourceRefDto | null;
  createdAt: string;
}

export interface ProblemDetailDto extends ProblemSummaryDto {
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  /** Owner/admin: all tests. Other teachers: samples, plus hidden tests if `sharing.publicTests`. */
  testCases: TestCaseDto[];
  /** Owner/admin, or anyone if `sharing.publicSolution`; otherwise absent. */
  solution?: SolutionDto | null;
  /** Viewer may edit (owner or admin). */
  canEdit: boolean;
}

// ---------- Learning paths (OJ-24) ----------
export interface UpsertLearningPathRequest {
  title: string;
  description: string;
  /** A standard topic id or a free tag (normalised); null = no topic. */
  topic: string | null;
  isPublic: boolean;
  /** 1–30 steps, each an open public PRACTICE or HOMEWORK session, in order. */
  steps: { sessionId: string; title: string; note: string }[];
}

/** `GET /paths` pages (OJ-27): `limit` defaults to PATHS_PAGE_SIZE and may be at most PATHS_MAX_PAGE. */
export const PATHS_PAGE_SIZE = 24;
export const PATHS_MAX_PAGE = 100;

/** Query of `GET /paths`. `before` is the `next` cursor of the previous page (OJ-28). */
export interface ListPathsQuery {
  scope?: 'public' | 'mine';
  limit?: number;
  before?: string;
}

/**
 * One page of `GET /paths`, newest first by creation (OJ-28). `next` is an opaque cursor for `?before=`, or null on
 * the last page. Editing or removing a path between pages never makes another one skipped or repeated.
 */
export interface LearningPathPageDto {
  items: LearningPathSummaryDto[];
  next: string | null;
}

export interface LearningPathSummaryDto {
  id: string;
  title: string;
  description: string;
  topic: string | null;
  ownerId: string;
  ownerName: string;
  isPublic: boolean;
  stepCount: number;
  /** The caller's own progress over the path's problems. */
  solved: number;
  total: number;
  updatedAt: string;
}

export interface PathStepDto {
  sessionId: string;
  title: string;
  note: string;
  /** The session hides topics while it runs: a mixed review step. */
  review: boolean;
  sessionTitle: string;
  state: SessionState;
  /** False when the session is gone; the step is shown but cannot be opened. */
  available: boolean;
  problems: { key: string; title: string; difficulty: Difficulty; tags: string[]; solved: boolean }[];
  solved: number;
  total: number;
}

export interface LearningPathDto extends LearningPathSummaryDto {
  canEdit: boolean;
  steps: PathStepDto[];
  /** The first unsolved problem of the first unfinished open step; null when everything is solved. */
  next: { sessionId: string; key: string; title: string; stepIndex: number } | null;
}

/** A tag and how many problems in the chosen bank scope carry it (OJ-20). */
export interface ProblemTagDto {
  tag: string;
  count: number;
}

/** A problem of an open public practice session, found by topic (OJ-20). */
export interface PracticeProblemDto {
  sessionId: string;
  sessionTitle: string;
  key: string;
  code: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  tags: string[];
  /** The viewer has solved it in this session. */
  solved: boolean;
}

/** mine = own bank; public = shared by anyone; all = everything (admin only). */
/** organization = shared with one of the viewer's organizations (problems only). */
export type BankScope = 'mine' | 'public' | 'organization' | 'all';

export interface UpsertProblemRequest {
  title: string;
  difficulty: Difficulty;
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface UpsertTestCaseRequest {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
}

/** Ask the AI for test cases that the bank's existing tests do not cover yet. */
export interface SuggestTestCasesRequest {
  /** 1–10, default 5. */
  count?: number;
  /** What to focus on, e.g. "biên lớn", "n = 1". */
  focus?: string | null;
}

export interface TestCaseSuggestionDto {
  input: string;
  expectedOutput: string;
  /** Short Vietnamese note on what this test checks. */
  purpose: string;
  /** The output was computed by running a solution, not worked out by the model alone. */
  outputVerified: boolean;
}

/** Suggestions are not saved; the teacher picks which ones to add. */
export interface TestCaseSuggestionsDto {
  suggestions: TestCaseSuggestionDto[];
  /** Things the teacher should check (ambiguous statement, tests too large to generate...). */
  notes: string[];
  /**
   * Parts of the teacher's `focus` the AI did not follow because they contradict the statement
   * (the statement, input/output and constraints always win), each with the AI's explanation.
   */
  focusRejections?: string[];
}

/** The problem as currently typed (it may not be saved yet): context for a section suggestion. */
export interface ProblemDraftContent {
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  /** The examples shown in the statement. */
  samples?: { input: string; expectedOutput: string }[];
}

/** What the AI can rewrite: the four text sections, and the title (OJ-22; a title has no input or output). */
export const SuggestableSections = ['title', 'statement', 'inputFormat', 'outputFormat', 'constraints'] as const;
export type SuggestableSection = (typeof SuggestableSections)[number];

/** Ask the AI to (re)write one section of a problem being written. */
export interface SuggestProblemSectionRequest {
  section: SuggestableSection;
  problem: ProblemDraftContent;
}

export interface ProblemSectionSuggestionDto {
  text: string;
  /** What the teacher should check. */
  notes: string[];
}

/** AI test suggestions for a problem that is not saved yet (creating, importing). */
export interface SuggestDraftTestsRequest extends SuggestTestCasesRequest {
  problem: ProblemDraftContent & { timeLimitMs?: number; memoryLimitMb?: number };
  /** The tests the editor already has. */
  tests: { input: string; expectedOutput: string }[];
}

/** A new problem may come with its whole test list (examples are tests with `isSample`). */
export interface CreateProblemRequest extends UpsertProblemRequest {
  testCases?: UpsertTestCaseRequest[];
}

export interface UpsertSolutionRequest {
  explanation: string;
  language: Language | null;
  code: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- Importing (into the importer's own bank) ----------
export interface ProblemDraftDto {
  title: string;
  difficulty: Difficulty;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Examples read from the document come as tests with `isSample`; the editor adds more before confirming. */
  tests: UpsertTestCaseRequest[];
  /** Parser hints the teacher should double-check (e.g. "no sample found"). */
  warnings: string[];
}

export interface ParsedExamDto {
  fileName: string;
  /** AI = read by Claude; BASIC = rule-based reader (no API key, the AI reader failed, or no AI uses left). */
  parser: 'AI' | 'BASIC';
  drafts: ProblemDraftDto[];
  rawText: string;
  /** The basic reader was used because this month's AI readings are used up (OJ-21). */
  aiQuotaExhausted?: true;
}

export interface ImportProblemsRequest {
  drafts: ProblemDraftDto[];
}

export interface ImportProblemsResponse {
  problemIds: string[];
}

// ---------- Problem set blueprints (each teacher's set bank) ----------
export interface ProblemSetItemDto {
  problemId: string;
  problemCode: string;
  problemTitle: string;
  difficulty: Difficulty;
  points: number;
  order: number;
}

export interface ProblemSetDto {
  id: string;
  title: string;
  description: string;
  type: ProblemSetType;
  ownerId: string;
  ownerName: string;
  isPublic: boolean;
  copiedFrom: SourceRefDto | null;
  totalPoints: number;
  items: ProblemSetItemDto[];
  canEdit: boolean;
  createdAt: string;
}

/** Items must be problems in the owner's own bank. */
export interface UpsertProblemSetRequest {
  title: string;
  description: string;
  type: ProblemSetType;
  items: { problemId: string; points: number }[];
}

export interface ProblemSetSharingRequest {
  /** Making a set public requires every problem in it to be public. */
  isPublic: boolean;
}

/** Printable paper / answer key of a blueprint (owner or admin). */
export interface AnswerKeyDto {
  problemSet: ProblemSetDto;
  problems: (ProblemDetailDto & { points: number })[];
}

// ---------- Sessions (an instance of a blueprint, given to a class or to everyone) ----------
export type SessionAudience = 'CLASS' | 'PUBLIC';
/** Derived from opensAt/closesAt and the class status. */
export type SessionState = 'UPCOMING' | 'OPEN' | 'CLOSED';

export interface SessionProblemSummaryDto {
  /** Stable key of the problem inside this session (used in URLs and submissions). */
  key: string;
  code: string;
  title: string;
  difficulty: Difficulty;
  points: number;
  order: number;
  /**
   * Topics (OJ-20): standard topic ids or free tags. Empty for students while a TEST or EXAM is not closed (a topic gives
   * away the method), and for sessions created before topics were copied into sessions.
   */
  tags: string[];
}

/**
 * What students see of their own results before the session closes.
 * FULL = verdict, score and every test; SCORE_ONLY = verdict and score; HIDDEN_UNTIL_CLOSED = only "submitted".
 * Managers always see everything; everyone sees everything once the session is closed.
 */
export type FeedbackMode = 'FULL' | 'SCORE_ONLY' | 'HIDDEN_UNTIL_CLOSED';

export interface SessionSettingsDto {
  /** Exam mode: each participant gets this many minutes from the moment they press "start". null = no timer. */
  durationMinutes: number | null;
  /** Empty = every language. */
  allowedLanguages: Language[];
  /** Per participant and problem. null = unlimited. */
  maxSubmissionsPerProblem: number | null;
  feedback: FeedbackMode;
  /** Compare submissions of the same problem between participants (code fingerprints). */
  checkPlagiarism: boolean;
  /** Ask Claude whether submissions look AI-generated. Needs ANTHROPIC_API_KEY on the server. */
  checkAiUsage: boolean;
  /** Students do not see the problems' topics until the session closes (a mixed review, OJ-24). Optional in requests. */
  hideTopics?: boolean;
}

/** A participant's personal time window in a timed session. */
export interface AttemptDto {
  startedAt: string;
  /** min(startedAt + duration, closesAt) */
  endsAt: string;
}

export interface MySessionProgressDto {
  solvedKeys: string[];
  /** key -> best score 0..100 */
  bestScores: Record<string, number>;
  earnedPoints: number;
  /** Every problem of the session solved (AC) in this session. */
  completed: boolean;
  /** key -> submissions made (for the submission limit). */
  submissionCounts: Record<string, number>;
  /** true while results are hidden by the session's feedback mode (scores above are then empty). */
  resultsHidden: boolean;
}

export interface SessionDto {
  id: string;
  title: string;
  description: string;
  type: ProblemSetType;
  audience: SessionAudience;
  classId: string | null;
  className: string | null;
  classStatus: ClassStatus | null;
  opensAt: string | null;
  closesAt: string | null;
  state: SessionState;
  sourceSetId: string | null;
  createdById: string;
  createdByName: string;
  totalPoints: number;
  problems: SessionProblemSummaryDto[];
  /** Viewer may manage it (class teacher, creator of a public session, or admin). */
  canManage: boolean;
  /** Viewer may submit right now. */
  canSubmit: boolean;
  myProgress: MySessionProgressDto;
  settings: SessionSettingsDto;
  /** The viewer's timer in a timed session; null until they press "start". */
  myAttempt: AttemptDto | null;
  /** Timed session the viewer must start before seeing statements or submitting. */
  needsStart: boolean;
  /** Server clock, so clients can correct their countdown for clock skew. */
  serverNow: string;
  createdAt: string;
}

/** A problem as frozen in a session: statement, samples and limits (never hidden tests or solution). */
export interface SessionProblemDto extends SessionProblemSummaryDto {
  sessionId: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  samples: { input: string; expectedOutput: string }[];
}

export type SessionSource = { kind: 'SET'; setId: string } | { kind: 'PROBLEM'; problemId: string };

export interface CreateSessionRequest {
  source: SessionSource;
  /** null = public session (anyone signed in may take part). Otherwise a class the creator manages. */
  classId: string | null;
  /** Defaults to the blueprint's title. */
  title?: string;
  description?: string;
  opensAt: string | null;
  closesAt: string | null;
  /** Defaults: no timer, every language, unlimited submissions, FULL feedback. */
  settings?: SessionSettingsDto;
}

export interface UpdateSessionRequest {
  title: string;
  description: string;
  opensAt: string | null;
  closesAt: string | null;
  settings: SessionSettingsDto;
}

/** Rejudge every submission of a session, or only of one problem. */
export interface RejudgeRequest {
  problemKey?: string;
}

/** What "Đồng bộ với đề gốc" would change in a session given from a set (or what it changed). */
export interface SessionSyncPreviewDto {
  setId: string;
  setTitle: string;
  added: { code: string; title: string; points: number }[];
  /** `studentsWithSubmissions`: their submissions stay in their history but no longer count. */
  removed: { key: string; code: string; title: string; studentsWithSubmissions: number }[];
  pointsChanged: { key: string; title: string; from: number; to: number }[];
  /** Statement, limits or tests changed in the bank: these problems are rejudged. */
  contentChanged: { key: string; title: string }[];
  reordered: boolean;
  hasChanges: boolean;
}

export interface SessionSyncResultDto {
  session: SessionDto;
  changes: SessionSyncPreviewDto;
}

export interface RejudgeResponse {
  /** Submissions put back into the judge queue. */
  queued: number;
}

export interface SessionResultsDto {
  sessionId: string;
  problems: { key: string; code: string; title: string; points: number }[];
  rows: {
    userId: string;
    displayName: string;
    /** Earned points: best score% * problem points, summed. */
    total: number;
    solvedCount: number;
    completed: boolean;
    /** key -> earned points */
    scores: Record<string, number>;
    lastSubmissionAt: string | null;
  }[];
}

// ---------- Judging ----------
export interface SubmitRequest {
  sessionId: string;
  problemKey: string;
  language: Language;
  sourceCode: string;
}

/** Run code on a problem's sample tests without submitting it (OJ-18). */
export interface CreateTrialRunRequest {
  language: Language;
  sourceCode: string;
}

/** PENDING: queued; JUDGING: an engine took it; DONE: `verdict` is set. */
export type TrialRunStatus = 'PENDING' | 'JUDGING' | 'DONE';

export interface TrialRunTestDto {
  input: string;
  expectedOutput: string;
  /** What the program printed (cut to 4,000 characters); null when it did not run on this test. */
  output: string | null;
  verdict: Verdict | null;
  timeMs: number | null;
  memoryKb: number | null;
  /** Short diagnostic, e.g. the runtime error. */
  message: string | null;
}

/** A trial run lives 15 minutes and is visible only to the user who started it. Nothing is recorded. */
export interface TrialRunDto {
  id: string;
  sessionId: string;
  problemKey: string;
  language: Language;
  status: TrialRunStatus;
  verdict: Verdict | null;
  compileOutput: string | null;
  tests: TrialRunTestDto[];
  createdAt: string;
}

export interface SubmissionDto {
  id: string;
  sessionId: string;
  sessionTitle: string;
  problemKey: string;
  problemTitle: string;
  userId: string;
  userDisplayName: string;
  language: Language;
  status: SubmissionStatus;
  verdict: Verdict | null;
  /** 0..100 */
  score: number;
  maxTimeMs: number | null;
  maxMemoryKb: number | null;
  createdAt: string;
  judgedAt: string | null;
  /** Verdict/score/tests withheld by the session's feedback mode (verdict null, score 0). */
  resultsHidden: boolean;
  /** Only verdict and score are shown (no per-test results). */
  testsHidden: boolean;
}

export interface SubmissionDetailDto extends SubmissionDto {
  sourceCode: string;
  compileOutput: string | null;
  testResults: TestCaseResult[];
}

// ---------- Learning record ("học bạ") ----------
/**
 * Survives archiving and deleting classes. `available` = the session can still be opened
 * (false once its class was deleted for good: only titles and results remain).
 */
export interface LearningRecordDto {
  totals: { solvedProblems: number; completedSessions: number; startedSessions: number };
  /**
   * Per topic (OJ-20): problems the student attempted and solved, over sessions whose topics they may see. A problem in
   * two sessions counts twice. Sorted by attempted, most first.
   */
  topics: { tag: string; attempted: number; solved: number }[];
  groups: {
    /** null = public practice */
    classId: string | null;
    className: string | null;
    /** DELETED = class deleted for good. null for public practice. */
    classStatus: ClassStatus | 'DELETED' | null;
    sessions: {
      sessionId: string;
      title: string;
      type: ProblemSetType;
      available: boolean;
      totalProblems: number;
      solvedProblems: number;
      earnedPoints: number;
      totalPoints: number;
      completed: boolean;
      completedAt: string | null;
      /** Results withheld until the session closes (feedback mode); counts above are then 0. */
      resultsHidden: boolean;
      problems: { key: string; title: string; solved: boolean; bestScore: number; solvedAt: string | null }[];
    }[];
  }[];
}

// ---------- Academic integrity (teacher-only review hints) ----------
export type IntegrityFlagKind = 'PLAGIARISM' | 'AI_USAGE';
export type IntegrityFlagStatus = 'OPEN' | 'ACKNOWLEDGED';

/**
 * "Gợi ý cần xem lại": never shown to students and never changes scores.
 * The teacher may mark it as reviewed ("Đã xem"), nothing more.
 */
export interface IntegrityFlagDto {
  id: string;
  kind: IntegrityFlagKind;
  status: IntegrityFlagStatus;
  level: 'MEDIUM' | 'HIGH';
  /** Plagiarism: similarity 0..1. AI usage: 0.5 (medium) or 0.9 (high). */
  score: number;
  /** One-line explanation, Vietnamese. */
  summary: string;
  sessionId: string;
  sessionTitle: string;
  problemKey: string;
  problemTitle: string;
  submissionId: string;
  userId: string;
  userDisplayName: string;
  /** Plagiarism only: the most similar other submission. */
  matchedSubmissionId: string | null;
  matchedUserId: string | null;
  matchedUserDisplayName: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

export interface IntegrityFlagDetailDto extends IntegrityFlagDto {
  language: Language;
  code: string;
  matchedLanguage: Language | null;
  matchedCode: string | null;
  /** Line ranges of `code` worth a look (1-based, inclusive). */
  segments: { startLine: number; endLine: number; reason: string }[];
  reasons: string[];
}

// ---------- Class community (announcements and Q&A) ----------
export type ThreadKind = 'ANNOUNCEMENT' | 'QUESTION';

export interface ThreadReplyDto {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

/** `GET /threads/awaiting` returns at most this many questions, newest first (OJ-26). */
export const AWAITING_QUESTIONS_LIMIT = 50;

export interface ThreadSummaryDto {
  id: string;
  classId: string;
  kind: ThreadKind;
  title: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  pinned: boolean;
  /** A question can be about one problem of one session. */
  sessionId: string | null;
  sessionTitle: string | null;
  problemKey: string | null;
  replyCount: number;
  /** A student's question with no reply from a teacher or administrator yet (false for announcements and staff questions). */
  awaitingAnswer: boolean;
  lastActivityAt: string;
  createdAt: string;
}

export interface ThreadDto extends ThreadSummaryDto {
  /** Markdown */
  body: string;
  replies: ThreadReplyDto[];
  canReply: boolean;
  canDelete: boolean;
  canPin: boolean;
}

/** Announcements: class teacher/admin only. Questions: current students and staff. */
export interface CreateThreadRequest {
  kind: ThreadKind;
  title: string;
  body: string;
  sessionId?: string | null;
  problemKey?: string | null;
}

export interface CreateReplyRequest {
  body: string;
}

export interface PinThreadRequest {
  pinned: boolean;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /**
   * Stable English identifier on every error: domain codes (`identity.wrong_code`, `organization.no_seats`, …), codes
   * for framework errors (`request.invalid`, `request.not_found`, `request.too_large`, `auth.required`, …) and
   * `server.error` for unexpected failures. Branch on this, never on `message`.
   */
  code: string;
  /** Extra data for the client, e.g. `sessionId` of the session that already exists. */
  details?: Record<string, string>;
}

/** What the server can do right now, for staff screens (OJ-13). */
export interface FeaturesDto {
  /** A Claude key is configured. Without it AI controls are shown disabled with the reason. */
  ai: boolean;
}
