import { Languages, type Language, type SubmissionStatus, type TestCaseResult, type Verdict } from '@oj/contracts';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert } from '../../../shared/domain/domain-error.js';
import { SUBMISSION_JUDGED, type SubmissionJudgedEvent } from '../judging.events.js';

const MAX_SOURCE_BYTES = 64 * 1024;

/** The backend could not hand the job to the judge (the queue was down). */
export const ENQUEUE_FAILED_MESSAGE = 'Không gửi được bài tới máy chấm. Vui lòng thử lại sau.';
/** The judge never returned a result (lost job, dead engine); written by the watchdog. */
export const LOST_RESULT_MESSAGE =
  'Hệ thống chấm bài không trả kết quả cho bài nộp này (không phải lỗi của bạn). Bạn có thể nộp lại, hoặc nhờ giáo viên chấm lại.';
/** The result could not be stored (e.g. text the database refuses); the program produced it, so it is attributed. */
export const RESULT_NOT_STORED_MESSAGE =
  'Không lưu được kết quả chấm của bài này (kết quả chứa dữ liệu không hợp lệ). Hãy kiểm tra những gì chương trình in ra.';

/**
 * Where a system error (IE) came from. `infrastructure`: before any of the submitted program ran (queue down, container
 * start, compiler missing, result lost by the system), never the submission's doing, so never an attempt. `program`:
 * after a test had started, so the program may have caused it (a program can sometimes make the sandbox fail on purpose,
 * e.g. only for certain hidden inputs, to probe the hidden tests without spending attempts).
 */
export type FaultSource = 'infrastructure' | 'program';

/**
 * `program` system errors are free up to this many per student and problem; every later one counts as an attempt, for
 * good (decided by what is stored, not by a time window that would let probing start again the next day). Two leave
 * room for a genuine failure during a run, which a teacher can also undo by rejudging.
 */
export const FREE_PROGRAM_ERRORS = 2;

/** What a program controls in a result, made storable: PostgreSQL text and jsonb refuse NUL (audit F-2). */
function storable(text: string): string;
function storable(text: string | null): string | null;
function storable(text: string | null): string | null {
  return text === null ? null : text.replace(/\u0000/g, '').replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd');
}

export class SourceCode {
  private constructor(
    readonly language: Language,
    readonly text: string,
  ) {}

  static of(language: Language, text: string): SourceCode {
    assert(Languages.includes(language), 'judging.invalid_language', 'Ngôn ngữ không được hỗ trợ.');
    assert(text.trim().length > 0, 'judging.empty_source', 'Mã nguồn không được để trống.');
    assert(Buffer.byteLength(text) <= MAX_SOURCE_BYTES, 'judging.source_too_large', 'Mã nguồn tối đa 64KB.');
    return new SourceCode(language, text);
  }
}

export interface SubmissionState {
  userId: string;
  userDisplayName: string;
  sessionId: string;
  sessionTitle: string;
  problemKey: string;
  problemTitle: string;
  source: SourceCode;
  /** Sum of test points of the current judge run; used to compute the 0..100 score. */
  totalPoints: number;
  /** 1 for the first judging, +1 per rejudge. Results of older runs are ignored. */
  judgeRun: number;
  status: SubmissionStatus;
  verdict: Verdict | null;
  score: number;
  compileOutput: string | null;
  /** Set for verdict IE only; null for other verdicts and for rows from before it existed. */
  faultSource: FaultSource | null;
  testResults: TestCaseResult[];
  createdAt: Date;
  /** When the current judge run was handed to the queue (submission, or the latest rejudge). A result overdue from here is lost. */
  queuedAt: Date;
  judgedAt: Date | null;
}

export type NewSubmission = Pick<
  SubmissionState,
  'userId' | 'userDisplayName' | 'sessionId' | 'sessionTitle' | 'problemKey' | 'problemTitle' | 'source' | 'totalPoints'
>;

/**
 * Submission aggregate: one attempt at a problem of a session. Lifecycle: PENDING -> JUDGING -> DONE.
 * Titles and the user name are snapshotted so history stays readable after sessions or classes are gone.
 */
export class Submission extends AggregateRoot {
  private constructor(id: string, private state: SubmissionState) {
    super(id);
  }

  static submit(input: NewSubmission): Submission {
    const now = new Date();
    return new Submission(newId(), {
      ...input,
      judgeRun: 1,
      status: 'PENDING',
      verdict: null,
      score: 0,
      compileOutput: null,
      faultSource: null,
      testResults: [],
      createdAt: now,
      queuedAt: now,
      judgedAt: null,
    });
  }

  static rehydrate(id: string, state: SubmissionState): Submission {
    return new Submission(id, state);
  }

  get snapshot(): Readonly<SubmissionState> {
    return this.state;
  }

  get maxTimeMs(): number | null {
    return this.state.testResults.length ? Math.max(...this.state.testResults.map((t) => t.timeMs)) : null;
  }

  get maxMemoryKb(): number | null {
    return this.state.testResults.length ? Math.max(...this.state.testResults.map((t) => t.memoryKb)) : null;
  }

  /** Results from an older judge run (before a rejudge) must be ignored. */
  isCurrentRun(judgeRun: number): boolean {
    return judgeRun === this.state.judgeRun;
  }

  /** Idempotent: late or duplicated "started" messages are ignored. */
  startJudging(): void {
    if (this.state.status === 'PENDING') this.state.status = 'JUDGING';
  }

  /** Back to the queue with (possibly new) test data; returns the new run number. */
  rejudge(totalPoints: number): number {
    this.state = {
      ...this.state,
      totalPoints,
      judgeRun: this.state.judgeRun + 1,
      status: 'PENDING',
      verdict: null,
      score: 0,
      compileOutput: null,
      faultSource: null,
      testResults: [],
      queuedAt: new Date(),
      judgedAt: null,
    };
    return this.state.judgeRun;
  }

  /** `faultSource` matters for IE only; an IE without one is attributed to the program (the cautious side). */
  complete(verdict: Verdict, testResults: TestCaseResult[], compileOutput: string | null, faultSource: FaultSource | null = null): void {
    if (this.state.status === 'DONE') return;
    testResults = testResults.map((t) => (t.message === undefined ? t : { ...t, message: storable(t.message) }));
    compileOutput = storable(compileOutput);
    const earned = testResults.reduce((sum, t) => sum + t.points, 0);
    const total = this.state.totalPoints;
    this.state = {
      ...this.state,
      status: 'DONE',
      verdict,
      testResults,
      compileOutput,
      faultSource: verdict === 'IE' ? faultSource ?? 'program' : null,
      score: verdict === 'AC' ? 100 : total > 0 ? Math.round((earned / total) * 10000) / 100 : 0,
      judgedAt: new Date(),
    };
    const s = this.state;
    const event: SubmissionJudgedEvent = {
      name: SUBMISSION_JUDGED,
      occurredAt: new Date(),
      submissionId: this.id,
      userId: s.userId,
      userDisplayName: s.userDisplayName,
      sessionId: s.sessionId,
      problemKey: s.problemKey,
      verdict,
      score: s.score,
      submittedAt: s.createdAt,
    };
    this.record(event);
  }
}
