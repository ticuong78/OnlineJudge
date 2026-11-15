import {
  Languages,
  type Difficulty,
  type FeedbackMode,
  type Language,
  type ProblemSetType,
  type SessionAudience,
  type SessionState,
} from '@oj/contracts';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';

export class TimeWindow {
  private constructor(
    readonly opensAt: Date | null,
    readonly closesAt: Date | null,
  ) {}

  static of(opensAt: Date | null, closesAt: Date | null): TimeWindow {
    if (opensAt && closesAt) {
      assert(closesAt > opensAt, 'assessment.invalid_window', 'Thời gian đóng phải sau thời gian mở.');
    }
    return new TimeWindow(opensAt, closesAt);
  }

  stateAt(now: Date): SessionState {
    if (this.opensAt && now < this.opensAt) return 'UPCOMING';
    if (this.closesAt && now >= this.closesAt) return 'CLOSED';
    return 'OPEN';
  }
}

const FEEDBACK_MODES: FeedbackMode[] = ['FULL', 'SCORE_ONLY', 'HIDDEN_UNTIL_CLOSED'];

/** How a session is run: exam timer, languages, submission limit, what students see before it closes. */
export class SessionSettings {
  private constructor(
    readonly durationMinutes: number | null,
    readonly allowedLanguages: Language[],
    readonly maxSubmissionsPerProblem: number | null,
    readonly feedback: FeedbackMode,
    readonly checkPlagiarism: boolean,
    readonly checkAiUsage: boolean,
    /** Students do not see the problems' topics while the session runs (a mixed review step, OJ-24). */
    readonly hideTopics: boolean = false,
  ) {}

  static of(input: {
    durationMinutes: number | null;
    allowedLanguages: Language[];
    maxSubmissionsPerProblem: number | null;
    feedback: FeedbackMode;
    checkPlagiarism?: boolean;
    checkAiUsage?: boolean;
    hideTopics?: boolean;
  }): SessionSettings {
    const { durationMinutes: d, maxSubmissionsPerProblem: m } = input;
    assert(d === null || (Number.isInteger(d) && d >= 1 && d <= 24 * 60),
      'assessment.invalid_duration', 'Thời gian làm bài phải từ 1 phút đến 24 giờ.');
    assert(m === null || (Number.isInteger(m) && m >= 1 && m <= 1000),
      'assessment.invalid_max_submissions', 'Số lần nộp tối đa phải từ 1 đến 1000.');
    assert(input.allowedLanguages.every((l) => Languages.includes(l)), 'assessment.invalid_language', 'Ngôn ngữ không hợp lệ.');
    assert(FEEDBACK_MODES.includes(input.feedback), 'assessment.invalid_feedback', 'Chế độ hiển thị kết quả không hợp lệ.');
    return new SessionSettings(d, [...new Set(input.allowedLanguages)], m, input.feedback,
      input.checkPlagiarism ?? false, input.checkAiUsage ?? false, input.hideTopics ?? false);
  }

  static readonly defaults = new SessionSettings(null, [], null, 'FULL', false, false, false);

  get isTimed(): boolean {
    return this.durationMinutes !== null;
  }

  allows(language: Language): boolean {
    return this.allowedLanguages.length === 0 || this.allowedLanguages.includes(language);
  }
}

/** What a viewer may see of their own results right now. */
export type ResultVisibility = 'FULL' | 'SCORE_ONLY' | 'HIDDEN';

/** A problem frozen into a session (content and tests copied from the bank at creation time). */
export interface SessionProblem {
  /** "A", "B", ... stable within the session. */
  key: string;
  sourceProblemId: string;
  code: string;
  title: string;
  difficulty: Difficulty;
  /** Topics copied from the bank (OJ-20); empty for sessions created before they were copied. */
  tags: string[];
  points: number;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: { input: string; expectedOutput: string; isSample: boolean; points: number }[];
}

export type FrozenContent = Omit<SessionProblem, 'key' | 'points'>;

export interface SessionData {
  title: string;
  description: string;
  type: ProblemSetType;
  /** null = public session. */
  classId: string | null;
  sourceSetId: string | null;
  /** The bank item and audience this session was assigned from (see `assignmentKeyOf`); null for old sessions. */
  assignmentKey: string | null;
  window: TimeWindow;
  settings: SessionSettings;
  createdBy: { id: string; name: string };
  problems: SessionProblem[];
  /**
   * Keys of problems removed from the session (by syncing with its set). Their submissions still carry the key,
   * so a key is never given to another problem.
   */
  retiredKeys: string[];
  createdAt: Date;
}

/** One problem of the source set, in set order, as it is in the bank now. */
export interface SetItemSnapshot {
  content: FrozenContent;
  points: number;
}

/** What syncing a session with its source set changes (a preview, or what was applied). */
export interface SessionSyncPlan {
  added: { code: string; title: string; points: number }[];
  removed: { key: string; code: string; title: string }[];
  pointsChanged: { key: string; title: string; from: number; to: number }[];
  /** Statement, limits or tests differ from the bank: these problems need a rejudge. */
  contentChanged: { key: string; title: string }[];
  reordered: boolean;
}

/**
 * A problem or a set is assigned at most once to the same audience (one class, or everyone): giving it again
 * (e.g. clicking "Giao bài" twice) would only show students the same work twice. Sessions with the same content
 * but from different bank items are fine.
 */
export const assignmentKeyOf = (source: { kind: 'PROBLEM' | 'SET'; id: string }, classId: string | null): string =>
  `${source.kind}:${source.id}:${classId ?? 'PUBLIC'}`;

export type NewSession = Omit<SessionData, 'problems' | 'retiredKeys' | 'createdAt'> & { problems: Omit<SessionProblem, 'key'>[] };

/**
 * Session ("phiên"): an instance of a blueprint given to one class or to everyone.
 * Problems are frozen at creation so editing the bank never changes running work
 * (until the manager explicitly refreshes the session from the bank).
 * Submissions, scores and "solved" status belong to a session.
 */
export class Session extends AggregateRoot {
  private constructor(id: string, private state: SessionData) {
    super(id);
  }

  static create(input: NewSession): Session {
    const title = input.title.trim();
    assert(title.length >= 1 && title.length <= 200, 'assessment.invalid_title', 'Tên phiên phải từ 1 đến 200 ký tự.');
    assert(input.problems.length > 0, 'assessment.empty', 'Phiên cần có ít nhất một bài.');
    return new Session(newId(), {
      ...input,
      title,
      problems: input.problems.map((p, i) => ({ ...p, key: keyFor(i) })),
      retiredKeys: [],
      createdAt: new Date(),
    });
  }

  static rehydrate(id: string, state: SessionData): Session {
    return new Session(id, state);
  }

  get snapshot(): Readonly<SessionData> {
    return this.state;
  }

  get audience(): SessionAudience {
    return this.state.classId ? 'CLASS' : 'PUBLIC';
  }

  get totalPoints(): number {
    return this.state.problems.reduce((sum, p) => sum + p.points, 0);
  }

  /** `classActive` = false closes a class session (archived class is read-only). */
  stateAt(now: Date, classActive: boolean): SessionState {
    const state = this.state.window.stateAt(now);
    return state === 'OPEN' && !classActive ? 'CLOSED' : state;
  }

  /**
   * Topics give away the method, so students see them in a test or exam only once it is closed (OJ-20). Managers always
   * see them; practice and homework show them throughout.
   */
  topicsVisibleTo(isManager: boolean, state: SessionState): boolean {
    if (isManager || state === 'CLOSED') return true;
    // A practice session can hide them too: a mixed review step, where recognising the technique is the exercise (OJ-24).
    if (this.state.settings.hideTopics) return false;
    return this.state.type !== 'TEST' && this.state.type !== 'EXAM';
  }

  /** Managers and everyone after closing see everything; otherwise the feedback setting decides. */
  visibilityFor(isManager: boolean, state: SessionState): ResultVisibility {
    if (isManager || state === 'CLOSED') return 'FULL';
    const mode = this.state.settings.feedback;
    return mode === 'FULL' ? 'FULL' : mode === 'SCORE_ONLY' ? 'SCORE_ONLY' : 'HIDDEN';
  }

  problem(key: string): SessionProblem {
    const problem = this.findProblem(key);
    if (!problem) throw DomainError.notFound('assessment.problem_not_in_session', 'Không tìm thấy bài trong phiên.');
    return problem;
  }

  /** undefined for a key the session never had or no longer has (removed by a sync). */
  findProblem(key: string): SessionProblem | undefined {
    return this.state.problems.find((p) => p.key === key.toUpperCase());
  }

  revise(title: string, description: string, window: TimeWindow, settings: SessionSettings): void {
    const t = title.trim();
    assert(t.length >= 1 && t.length <= 200, 'assessment.invalid_title', 'Tên phiên phải từ 1 đến 200 ký tự.');
    this.state = { ...this.state, title: t, description, window, settings };
  }

  /**
   * Re-freezes problems from their current bank version (keys and points stay).
   * `fresh` maps sourceProblemId -> content; problems missing from it keep their old frozen copy.
   * Returns the keys that changed.
   */
  refresh(fresh: Map<string, FrozenContent>): string[] {
    const changed: string[] = [];
    this.state.problems = this.state.problems.map((p) => {
      const content = fresh.get(p.sourceProblemId);
      if (!content) return p;
      changed.push(p.key);
      return { ...content, key: p.key, points: p.points };
    });
    return changed;
  }

  /**
   * What `syncWith(items)` would change. Problems are matched by their bank problem; `items` is the set in order.
   */
  planSync(items: SetItemSnapshot[]): SessionSyncPlan {
    return this.sync(items).plan;
  }

  /**
   * Makes the session match its source set: problems added or removed, set order, points per problem, and the
   * current bank content of every problem. Kept problems keep their key (submissions refer to it); new problems
   * get keys never used in this session. Returns what changed; `contentChanged` problems need a rejudge.
   */
  syncWith(items: SetItemSnapshot[]): SessionSyncPlan {
    const { plan, problems, retired } = this.sync(items);
    this.state.problems = problems;
    this.state.retiredKeys = [...this.state.retiredKeys, ...retired];
    return plan;
  }

  private sync(items: SetItemSnapshot[]) {
    assert(items.length > 0, 'assessment.empty', 'Phiên cần có ít nhất một bài.');
    const current = new Map(this.state.problems.map((p) => [p.sourceProblemId, p]));
    const wanted = new Set(items.map((i) => i.content.sourceProblemId));
    const used = new Set([...this.state.problems.map((p) => p.key), ...this.state.retiredKeys]);
    const nextKey = () => {
      let i = 0;
      while (used.has(keyFor(i))) i++;
      used.add(keyFor(i));
      return keyFor(i);
    };

    const plan: SessionSyncPlan = { added: [], removed: [], pointsChanged: [], contentChanged: [], reordered: false };
    const removed = this.state.problems.filter((p) => !wanted.has(p.sourceProblemId));
    plan.removed = removed.map((p) => ({ key: p.key, code: p.code, title: p.title }));

    const problems: SessionProblem[] = items.map(({ content, points }) => {
      const old = current.get(content.sourceProblemId);
      if (!old) {
        plan.added.push({ code: content.code, title: content.title, points });
        return { ...content, key: nextKey(), points };
      }
      if (old.points !== points) plan.pointsChanged.push({ key: old.key, title: content.title, from: old.points, to: points });
      if (!sameContent(old, content)) plan.contentChanged.push({ key: old.key, title: content.title });
      return { ...content, key: old.key, points };
    });

    const keptBefore = this.state.problems.filter((p) => wanted.has(p.sourceProblemId)).map((p) => p.key);
    const keptAfter = problems.filter((p) => current.has(p.sourceProblemId)).map((p) => p.key);
    plan.reordered = keptBefore.join() !== keptAfter.join();
    return { plan, problems, retired: removed.map((p) => p.key) };
  }
}

/** Whether a frozen problem still matches the bank (everything the judge or a student sees). */
function sameContent(a: FrozenContent, b: FrozenContent): boolean {
  const pick = (c: FrozenContent) => [c.title, c.difficulty, c.statement, c.inputFormat, c.outputFormat, c.constraints,
    c.timeLimitMs, c.memoryLimitMb, c.testCases.map((t) => [t.input, t.expectedOutput, t.isSample, t.points])];
  return JSON.stringify(pick(a)) === JSON.stringify(pick(b));
}

/** True when syncing would change nothing. */
export const isEmptySync = (plan: SessionSyncPlan): boolean =>
  !plan.added.length && !plan.removed.length && !plan.pointsChanged.length && !plan.contentChanged.length && !plan.reordered;

/**
 * A participant's personal time window in a timed session ("Bắt đầu làm bài").
 * Ends after the session duration, or when the session closes, whichever comes first.
 */
export class Attempt {
  private constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly startedAt: Date,
    readonly endsAt: Date,
  ) {}

  static start(session: Session, userId: string, now = new Date()): Attempt {
    const { settings, window } = session.snapshot;
    assert(settings.isTimed, 'assessment.not_timed', 'Phiên này không tính giờ.');
    const byDuration = new Date(now.getTime() + settings.durationMinutes! * 60_000);
    const endsAt = window.closesAt && window.closesAt < byDuration ? window.closesAt : byDuration;
    return new Attempt(session.id, userId, now, endsAt);
  }

  static rehydrate(sessionId: string, userId: string, startedAt: Date, endsAt: Date): Attempt {
    return new Attempt(sessionId, userId, startedAt, endsAt);
  }

  isRunning(now = new Date()): boolean {
    return now < this.endsAt;
  }
}

/** A, B, ..., Z, AA, AB, ... */
function keyFor(index: number): string {
  let key = '';
  let n = index;
  do {
    key = String.fromCharCode(65 + (n % 26)) + key;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return key;
}
