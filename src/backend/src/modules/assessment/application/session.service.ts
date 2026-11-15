import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { normalizeTag } from '@oj/contracts';
import type {
  CreateSessionRequest,
  Language,
  LearningRecordDto,
  MySessionProgressDto,
  PracticeProblemDto,
  ProblemSetType,
  ProblemTagDto,
  SessionAudience,
  SessionDto,
  SessionProblemDto,
  SessionResultsDto,
  SessionSettingsDto,
  SessionState,
  SessionSyncPreviewDto,
  SessionSyncResultDto,
  UpdateSessionRequest,
} from '@oj/contracts';
import { isStaff, type Actor } from '../../../shared/application/actor.js';
import { AiAccess } from '../../../shared/application/ai-access.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { CLASS_PURGED, type ClassPurgedEvent } from '../../classroom/classroom.events.js';
import {
  REJUDGE_STARTED,
  SUBMISSION_JUDGED,
  type RejudgeStartedEvent,
  type SubmissionJudgedEvent,
} from '../../judging/judging.events.js';
import { AttemptRepository, SessionRepository } from '../domain/repositories.js';
import {
  assignmentKeyOf,
  Attempt,
  isEmptySync,
  Session,
  SessionSettings,
  TimeWindow,
  type ResultVisibility,
  type SessionSyncPlan,
  type SetItemSnapshot,
} from '../domain/session.js';
import { ClassAccess, LearningRecordStore, ProblemCatalog, type ClassInfo, type RecordProgress, type RecordSession } from './ports.js';
import { ProblemSetService } from './problem-set.service.js';

export interface ListSessionsQuery {
  classId?: string;
  audience?: SessionAudience;
}

/** What one actor may do with one session right now. */
interface Access {
  canView: boolean;
  canManage: boolean;
  /** Session open and the actor is a participant (ignores the exam timer). */
  isParticipantNow: boolean;
  state: SessionState;
  classInfo: ClassInfo | null;
}

/** Problem data the judge needs for one submission, plus the rules that apply to it. */
export interface JudgeTarget {
  sessionTitle: string;
  problemTitle: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: { id: string; input: string; expectedOutput: string; points: number; isSample: boolean }[];
  allowedLanguages: Language[];
  maxSubmissions: number | null;
}

export interface IntegrityContext {
  /** The teacher who gave the session: the AI-usage check runs only while their account may use AI. */
  ownerId: string;
  checkPlagiarism: boolean;
  checkAiUsage: boolean;
  sessionTitle: string;
  problemTitle: string;
  statement: string;
}

/** The practice-by-topic list is a browsing aid, not an export. */
export const PRACTICE_PROBLEMS_MAX = 300;
/** Session types listed by practice by topic: self-study, whose topics are never hidden. */
const PRACTICE_TYPES: ProblemSetType[] = ['PRACTICE', 'HOMEWORK'];

@Injectable()
export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly attempts: AttemptRepository,
    private readonly sets: ProblemSetService,
    private readonly problems: ProblemCatalog,
    private readonly classes: ClassAccess,
    private readonly record: LearningRecordStore,
    private readonly ai: AiAccess,
  ) {}

  // ---------- Queries ----------

  /** Students: sessions of every class they belong(ed) to + public. Teachers: their classes + public. Admin: all. */
  async list(actor: Actor, query: ListSessionsQuery): Promise<SessionDto[]> {
    let classIds: string[] | 'ALL';
    if (actor.role === 'STUDENT') classIds = await this.classes.classIdsOfStudent(actor.id);
    else classIds = await this.classes.managedClassIds(actor);
    if (query.classId) {
      if (classIds !== 'ALL' && !classIds.includes(query.classId)) return [];
      classIds = [query.classId];
    }
    const sessions = await this.sessions.list({
      classIds,
      includeClass: query.audience !== 'PUBLIC',
      includePublic: query.audience !== 'CLASS' && !query.classId,
    });
    return this.dtos(actor, sessions);
  }

  async get(actor: Actor, id: string): Promise<SessionDto> {
    const session = await this.load(id);
    await this.ensureView(actor, session);
    return (await this.dtos(actor, [session]))[0];
  }

  async getProblem(actor: Actor, id: string, key: string): Promise<SessionProblemDto> {
    const session = await this.load(id);
    const access = await this.ensureView(actor, session);
    if (await this.mustStartFirst(actor, session, access)) {
      throw DomainError.forbidden('assessment.not_started', 'Đây là bài thi có tính giờ. Hãy bấm "Bắt đầu làm bài" để xem đề.');
    }
    const p = session.problem(key);
    return {
      sessionId: session.id,
      key: p.key,
      code: p.code,
      title: p.title,
      difficulty: p.difficulty,
      points: p.points,
      order: session.snapshot.problems.indexOf(p) + 1,
      tags: session.topicsVisibleTo(access.canManage, access.state) ? p.tags : [],
      statement: p.statement,
      inputFormat: p.inputFormat,
      outputFormat: p.outputFormat,
      constraints: p.constraints,
      timeLimitMs: p.timeLimitMs,
      memoryLimitMb: p.memoryLimitMb,
      samples: p.testCases.filter((t) => t.isSample).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput })),
    };
  }

  /** Scoreboard (always full results): class sessions list every current student, plus anyone who submitted. */
  async results(actor: Actor, id: string): Promise<SessionResultsDto> {
    const session = await this.load(id);
    await this.ensureManage(actor, session);
    const problems = session.snapshot.problems;
    const [rows, roster] = await Promise.all([
      this.record.progressOfSession(id),
      session.snapshot.classId ? this.classes.currentStudents(session.snapshot.classId) : Promise.resolve([]),
    ]);

    type Row = SessionResultsDto['rows'][number];
    const byUser = new Map<string, Row>();
    const row = (userId: string, displayName: string) => {
      let r = byUser.get(userId);
      if (!r) {
        r = { userId, displayName, total: 0, solvedCount: 0, completed: false, scores: {}, lastSubmissionAt: null };
        byUser.set(userId, r);
      }
      return r;
    };
    roster.forEach((s) => row(s.id, s.displayName));
    for (const p of rows) {
      const problem = problems.find((x) => x.key === p.problemKey);
      if (!problem) continue;
      const r = row(p.userId, p.userDisplayName);
      const earned = Math.round(problem.points * p.bestScore) / 100;
      r.scores[p.problemKey] = earned;
      r.total = Math.round((r.total + earned) * 100) / 100;
      if (p.solvedAt) r.solvedCount++;
      const last = p.lastSubmittedAt.toISOString();
      if (!r.lastSubmissionAt || last > r.lastSubmissionAt) r.lastSubmissionAt = last;
    }
    byUser.forEach((r) => (r.completed = r.solvedCount === problems.length));

    return {
      sessionId: id,
      problems: problems.map((p) => ({ key: p.key, code: p.code, title: p.title, points: p.points })),
      rows: [...byUser.values()].sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName, 'vi')),
    };
  }

  /** The learning record ("học bạ") of the actor: survives archived and deleted classes. */
  async learningRecord(actor: Actor): Promise<LearningRecordDto> {
    const rows = await this.record.progressOfUser(actor.id);
    const sessionIds = [...new Set(rows.map((r) => r.sessionId))];
    const sessions = await this.record.getSessions(sessionIds);
    const classes = await this.classes.getClasses(
      [...sessions.values()].map((s) => s.classId).filter((c): c is string => !!c),
    );
    const hidden = await this.hiddenSessions(actor, [...sessions.values()].filter((s) => s.available).map((s) => s.sessionId));
    const topicsHidden = await this.topicsHiddenIn(actor, [...sessions.values()]);
    const topics = new Map<string, { attempted: number; solved: number }>();

    type Group = LearningRecordDto['groups'][number];
    const groups = new Map<string, Group>();
    let solvedProblems = 0;
    let completedSessions = 0;

    for (const s of sessions.values()) {
      const isHidden = hidden.has(s.sessionId);
      const mine = isHidden ? [] : rows.filter((r) => r.sessionId === s.sessionId);
      const problems = s.problems.map((p) => {
        const r = mine.find((x) => x.problemKey === p.key);
        return { key: p.key, title: p.title, solved: !!r?.solvedAt, bestScore: r?.bestScore ?? 0, solvedAt: r?.solvedAt?.toISOString() ?? null };
      });
      const solved = problems.filter((p) => p.solved).length;
      const completed = solved === problems.length && problems.length > 0;
      if (!isHidden && !topicsHidden.has(s.sessionId)) {
        for (const p of s.problems) {
          const r = mine.find((x) => x.problemKey === p.key);
          if (!r) continue;
          for (const tag of p.tags ?? []) {
            const t = topics.get(tag) ?? { attempted: 0, solved: 0 };
            t.attempted++;
            if (r.solvedAt) t.solved++;
            topics.set(tag, t);
          }
        }
      }
      solvedProblems += solved;
      if (completed) completedSessions++;

      const cls = s.classId ? classes.get(s.classId) : undefined;
      const groupKey = s.classId ?? 'public';
      const group = groups.get(groupKey) ?? {
        classId: s.classId,
        className: cls?.name ?? s.className,
        classStatus: s.classId ? (cls ? cls.status : 'DELETED') : null,
        sessions: [],
      };
      group.sessions.push({
        sessionId: s.sessionId,
        title: s.title,
        type: s.type,
        available: s.available,
        totalProblems: problems.length,
        solvedProblems: solved,
        earnedPoints: Math.round(s.problems.reduce((sum, p, i) => sum + (p.points * problems[i].bestScore) / 100, 0) * 100) / 100,
        totalPoints: s.problems.reduce((sum, p) => sum + p.points, 0),
        completed,
        completedAt: completed ? problems.map((p) => p.solvedAt!).sort().at(-1)! : null,
        resultsHidden: isHidden,
        problems,
      });
      groups.set(groupKey, group);
    }

    const order = { ACTIVE: 0, ARCHIVED: 1, DELETED: 2 } as const;
    return {
      totals: { solvedProblems, completedSessions, startedSessions: sessions.size },
      topics: [...topics].map(([tag, t]) => ({ tag, ...t })).sort((a, b) => b.attempted - a.attempted || a.tag.localeCompare(b.tag)),
      groups: [...groups.values()].sort((a, b) =>
        (a.classStatus ? order[a.classStatus] : 3) - (b.classStatus ? order[b.classStatus] : 3)),
    };
  }

  /**
   * Problems of open public practice sessions (types PRACTICE and HOMEWORK, whose topics are always shown), optionally of
   * one topic (OJ-20): "practice by topic". Newest sessions first, at most PRACTICE_PROBLEMS_MAX. Tests and exams are
   * never listed, also not for their manager or an administrator.
   */
  async practiceProblems(actor: Actor, topic?: string): Promise<PracticeProblemDto[]> {
    const wanted = topic ? normalizeTag(topic) : null;
    const { sessions, solved } = await this.openPractice(actor);
    const result: PracticeProblemDto[] = [];
    for (const session of sessions) {
      for (const p of session.snapshot.problems) {
        if (wanted && !p.tags.includes(wanted)) continue;
        result.push({
          sessionId: session.id, sessionTitle: session.snapshot.title, key: p.key, code: p.code, title: p.title,
          difficulty: p.difficulty, points: p.points, tags: p.tags, solved: solved.has(`${session.id}/${p.key}`),
        });
        if (result.length >= PRACTICE_PROBLEMS_MAX) return result;
      }
    }
    return result;
  }

  /** Every topic of the open practice problems with how many carry it, uncapped (the list above is capped). */
  async practiceTopics(actor: Actor): Promise<ProblemTagDto[]> {
    const counts = new Map<string, number>();
    for (const session of (await this.openPractice(actor)).sessions) {
      for (const p of session.snapshot.problems) for (const tag of p.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  /** Open public practice sessions (the window is filtered in SQL) and the problems the actor solved in them. */
  private async openPractice(actor: Actor): Promise<{ sessions: Session[]; solved: Set<string> }> {
    // A session that hides its topics (a mixed review, OJ-24) is never found by topic: that would give the topics away.
    const sessions = (await this.sessions.list({
      classIds: [], includeClass: false, includePublic: true, types: PRACTICE_TYPES, openAt: new Date(),
    })).filter((s) => !s.snapshot.settings.hideTopics);
    const solved = new Set(
      (await this.record.progressOfUser(actor.id, sessions.map((s) => s.id)))
        .filter((r) => r.solvedAt)
        .map((r) => `${r.sessionId}/${r.problemKey}`),
    );
    return { sessions, solved };
  }

  // ---------- Commands ----------

  async create(actor: Actor, input: CreateSessionRequest): Promise<SessionDto> {
    if (!isStaff(actor)) throw DomainError.forbidden('assessment.not_staff', 'Chỉ giáo viên mới được giao bài.');
    if (input.classId) {
      const cls = (await this.classes.getClasses([input.classId])).get(input.classId);
      if (!cls || !(await this.classes.canManage(actor, input.classId))) {
        throw DomainError.forbidden('assessment.not_class_teacher', 'Bạn chỉ được giao bài cho lớp mình phụ trách.');
      }
      if (cls.status !== 'ACTIVE') {
        throw DomainError.conflict('assessment.class_archived', 'Lớp đã được lưu trữ, không thể giao bài mới.');
      }
    }

    let title: string;
    let description = '';
    let type: SessionDto['type'];
    let sourceSetId: string | null = null;
    let items: { problemId: string; points: number }[];
    if (input.source.kind === 'SET') {
      const set = await this.sets.loadForSession(actor, input.source.setId);
      const s = set.snapshot;
      ({ title, description, type } = s);
      sourceSetId = set.id;
      items = s.items;
    } else {
      items = [{ problemId: input.source.problemId, points: 100 }];
      title = '';
      type = 'PRACTICE';
    }
    const assignmentKey = assignmentKeyOf(
      input.source.kind === 'SET' ? { kind: 'SET', id: input.source.setId } : { kind: 'PROBLEM', id: input.source.problemId },
      input.classId,
    );
    const existing = await this.sessions.findByAssignmentKey(assignmentKey);
    if (existing) throw await this.alreadyAssigned(existing);

    if (input.settings?.checkAiUsage) await this.ai.ensureAllowed(actor);
    const snapshots = await this.problems.snapshot(actor, items.map((i) => i.problemId));
    if (input.source.kind === 'PROBLEM') title = snapshots[0].title;

    const session = Session.create({
      title: input.title?.trim() || title,
      description: input.description ?? description,
      type,
      classId: input.classId,
      sourceSetId,
      assignmentKey,
      window: windowOf(input.opensAt, input.closesAt),
      settings: input.settings ? SessionSettings.of(input.settings) : SessionSettings.defaults,
      createdBy: { id: actor.id, name: actor.name },
      problems: snapshots.map((snap, i) => ({ ...snap, points: items[i].points })),
    });
    try {
      await this.sessions.save(session);
    } catch (error) {
      // Two requests at once (a double click) both passed the check above; the unique key let only one in.
      const winner = await this.sessions.findByAssignmentKey(assignmentKey);
      if (winner) throw await this.alreadyAssigned(winner);
      throw error;
    }
    await this.putRecordSession(session);
    return (await this.dtos(actor, [session]))[0];
  }

  private async alreadyAssigned(session: Session): Promise<DomainError> {
    const s = session.snapshot;
    const where = s.classId
      ? `lớp ${(await this.classes.getClasses([s.classId])).get(s.classId)?.name ?? ''}`.trim()
      : 'mọi người (công khai)';
    return DomainError.conflict(
      'assessment.already_assigned',
      `${s.sourceSetId ? 'Đề' : 'Bài'} này đã được giao cho ${where} trong phiên "${s.title}" (do ${s.createdBy.name} giao). `
        + 'Mỗi bài hoặc đề chỉ giao một lần cho cùng một nơi: hãy mở phiên đó để đổi thời gian hoặc cài đặt.',
      { sessionId: session.id },
    );
  }

  async update(actor: Actor, id: string, input: UpdateSessionRequest): Promise<SessionDto> {
    const session = await this.load(id);
    await this.ensureManage(actor, session);
    // Turning the AI-usage check on needs AI; a check already on may stay (it only runs while the owner may use AI).
    if (input.settings.checkAiUsage && !session.snapshot.settings.checkAiUsage) await this.ai.ensureAllowed(actor);
    session.revise(input.title, input.description, windowOf(input.opensAt, input.closesAt), SessionSettings.of(input.settings));
    await this.sessions.save(session);
    await this.putRecordSession(session);
    return (await this.dtos(actor, [session]))[0];
  }

  /** The session's content goes away; students keep their results in the learning record. */
  async delete(actor: Actor, id: string): Promise<void> {
    const session = await this.load(id);
    await this.ensureManage(actor, session);
    await this.record.markUnavailable([id], false);
    await this.attempts.deleteBySession(id);
    await this.sessions.delete(id);
  }

  /** "Bắt đầu làm bài" in a timed session. Idempotent: the timer starts only once. */
  async start(actor: Actor, id: string): Promise<SessionDto> {
    const session = await this.load(id);
    const access = await this.ensureView(actor, session);
    if (!session.snapshot.settings.isTimed) {
      throw DomainError.validation('assessment.not_timed', 'Phiên này không tính giờ, có thể làm bài ngay.');
    }
    if (!access.isParticipantNow) throw this.cannotSubmit(access);
    if (!(await this.attempts.find(id, actor.id))) await this.attempts.save(Attempt.start(session, actor.id));
    return (await this.dtos(actor, [session]))[0];
  }

  /** What syncing a session given from a set with that set (as it is in the bank now) would change. */
  async previewSync(actor: Actor, id: string): Promise<SessionSyncPreviewDto> {
    const session = await this.load(id);
    await this.ensureManage(actor, session);
    const { setId, setTitle, items } = await this.currentSetItems(actor, session);
    return this.syncDto(session, setId, setTitle, session.planSync(items));
  }

  /**
   * Makes the session match its source set (problems, order, points, content). Problems removed keep their
   * submissions in students' history but no longer count. The caller rejudges `changes.contentChanged`.
   */
  async sync(actor: Actor, id: string): Promise<SessionSyncResultDto> {
    const session = await this.load(id);
    await this.ensureManage(actor, session);
    const { setId, setTitle, items } = await this.currentSetItems(actor, session);
    const before = session.planSync(items);
    if (isEmptySync(before)) {
      throw DomainError.conflict('assessment.nothing_to_sync', 'Phiên đã giống đề gốc, không có gì để đồng bộ.');
    }
    // Counted before the sync, while the removed problems are still in the session.
    const changes = await this.syncDto(session, setId, setTitle, before);
    session.syncWith(items);
    await this.sessions.save(session);
    await this.putRecordSession(session);
    return { session: (await this.dtos(actor, [session]))[0], changes };
  }

  private async currentSetItems(actor: Actor, session: Session): Promise<{ setId: string; setTitle: string; items: SetItemSnapshot[] }> {
    const setId = session.snapshot.sourceSetId;
    if (!setId) {
      throw DomainError.validation('assessment.not_from_set', 'Phiên này được giao từ một bài lẻ, không có đề gốc để đồng bộ.');
    }
    let set;
    try {
      set = await this.sets.loadForSession(actor, setId);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'assessment.set_not_found') {
        throw DomainError.notFound('assessment.set_gone', 'Đề gốc của phiên đã bị xóa hoặc không thuộc ngân hàng của bạn nên không đồng bộ được.');
      }
      throw error;
    }
    const s = set.snapshot;
    const snapshots = await this.problems.snapshot(actor, s.items.map((i) => i.problemId));
    return { setId, setTitle: s.title, items: snapshots.map((content, i) => ({ content, points: s.items[i].points })) };
  }

  private async syncDto(session: Session, setId: string, setTitle: string, plan: SessionSyncPlan): Promise<SessionSyncPreviewDto> {
    const progress = plan.removed.length ? await this.record.progressOfSession(session.id) : [];
    return {
      setId,
      setTitle,
      ...plan,
      removed: plan.removed.map((r) => ({
        ...r,
        studentsWithSubmissions: new Set(progress.filter((p) => p.problemKey === r.key).map((p) => p.userId)).size,
      })),
      hasChanges: !isEmptySync(plan),
    };
  }

  /** Re-freezes the session's problems from their current bank version (the caller then rejudges). */
  async refresh(actor: Actor, id: string): Promise<SessionDto> {
    const session = await this.load(id);
    await this.ensureManage(actor, session);
    const sourceIds = session.snapshot.problems.map((p) => p.sourceProblemId);
    const existing = await this.problems.getDetails(sourceIds, null);
    const snapshots = await this.problems.snapshot(actor, sourceIds.filter((sid) => existing.has(sid)));
    const changed = session.refresh(new Map(snapshots.map((s) => [s.sourceProblemId, s])));
    if (!changed.length) {
      throw DomainError.conflict('assessment.nothing_to_refresh', 'Các bài gốc đã bị xóa khỏi ngân hàng, không có gì để cập nhật.');
    }
    await this.sessions.save(session);
    await this.putRecordSession(session);
    return (await this.dtos(actor, [session]))[0];
  }

  // ---------- For the Judging context ----------

  async prepareSubmission(actor: Actor, sessionId: string, key: string): Promise<JudgeTarget> {
    const session = await this.load(sessionId);
    const access = await this.ensureView(actor, session);
    if (!access.isParticipantNow) throw this.cannotSubmit(access);
    if (session.snapshot.settings.isTimed && !access.canManage) {
      const attempt = await this.attempts.find(sessionId, actor.id);
      if (!attempt) throw DomainError.conflict('assessment.not_started', 'Hãy bấm "Bắt đầu làm bài" trước khi nộp.');
      if (!attempt.isRunning()) throw DomainError.conflict('assessment.time_up', 'Đã hết giờ làm bài, không nhận bài nộp nữa.');
    }
    return this.judgeData(session, key, access.canManage);
  }

  /**
   * What a trial run on the sample tests needs (OJ-18). Allowed exactly when the actor may read the statement (the
   * samples are in it); only sample tests are returned, so a trial can never reach the hidden tests.
   */
  async trialTarget(actor: Actor, sessionId: string, key: string): Promise<JudgeTarget> {
    const session = await this.load(sessionId);
    const access = await this.ensureView(actor, session);
    if (await this.mustStartFirst(actor, session, access)) {
      throw DomainError.forbidden('assessment.not_started', 'Đây là bài thi có tính giờ. Hãy bấm "Bắt đầu làm bài" để xem đề.');
    }
    const target = this.judgeData(session, key, access.canManage);
    return { ...target, testCases: target.testCases.filter((t) => t.isSample), maxSubmissions: null };
  }

  /**
   * Current test data of a session problem, without permission checks (used for rejudging).
   * null when the session no longer has that problem (removed by a sync): its submissions are not rejudged.
   */
  async judgeTarget(sessionId: string, key: string): Promise<JudgeTarget | null> {
    const session = await this.load(sessionId);
    return session.findProblem(key) ? this.judgeData(session, key, true) : null;
  }

  /** What the integrity checks need about one session problem; null if the session is gone. */
  async integrityContext(sessionId: string, key: string): Promise<IntegrityContext | null> {
    const session = await this.sessions.findById(sessionId);
    const p = session?.findProblem(key);
    if (!session || !p) return null;
    const { settings, title, createdBy } = session.snapshot;
    return {
      ownerId: createdBy.id,
      checkPlagiarism: settings.checkPlagiarism,
      checkAiUsage: settings.checkAiUsage,
      sessionTitle: title,
      problemTitle: `${p.key}. ${p.title}`,
      statement: [p.statement, p.inputFormat && `Dữ liệu vào:\n${p.inputFormat}`, p.outputFormat && `Kết quả:\n${p.outputFormat}`,
        p.constraints && `Giới hạn:\n${p.constraints}`].filter(Boolean).join('\n\n'),
    };
  }

  async summary(sessionId: string): Promise<{ classId: string | null; title: string; problemKeys: string[] } | null> {
    const session = await this.sessions.findById(sessionId);
    if (!session) return null;
    const s = session.snapshot;
    return { classId: s.classId, title: s.title, problemKeys: s.problems.map((p) => p.key) };
  }

  /** Session managers may review all its submissions. */
  async canReview(actor: Actor, sessionId: string): Promise<boolean> {
    if (actor.role === 'ADMIN') return true;
    const session = await this.sessions.findById(sessionId);
    return !!session && (await this.access(actor, session)).canManage;
  }

  /** What the actor may see of their own results in these sessions. Deleted sessions: everything. */
  async visibility(actor: Actor, sessionIds: string[]): Promise<Map<string, ResultVisibility>> {
    const ids = [...new Set(sessionIds)];
    // One listing query and one class lookup per class, not a full load (with every hidden test) per session.
    const sessions = await this.sessions.findListing(ids);
    const accesses = await this.accessMany(actor, sessions);
    const result = new Map<string, ResultVisibility>(ids.map((id) => [id, 'FULL']));
    for (const session of sessions) {
      const access = accesses.get(session.id)!;
      result.set(session.id, session.visibilityFor(access.canManage, access.state));
    }
    return result;
  }

  // ---------- Reactions ----------

  @OnEvent(SUBMISSION_JUDGED, { async: true, promisify: true })
  async onSubmissionJudged(event: SubmissionJudgedEvent): Promise<void> {
    await this.record.recordAttempt({
      userId: event.userId,
      userDisplayName: event.userDisplayName,
      sessionId: event.sessionId,
      problemKey: event.problemKey,
      score: event.score,
      accepted: event.verdict === 'AC',
      at: event.submittedAt,
    });
  }

  /** Progress is rebuilt from the rejudged results. */
  @OnEvent(REJUDGE_STARTED, { async: true, promisify: true })
  async onRejudgeStarted(event: RejudgeStartedEvent): Promise<void> {
    await this.record.resetProgress(event.sessionId, event.problemKey);
  }

  /** Class deleted for good: its sessions disappear, learning records keep titles and results. */
  @OnEvent(CLASS_PURGED, { async: true, promisify: true })
  async onClassPurged(event: ClassPurgedEvent): Promise<void> {
    const sessions = await this.sessions.findByClass(event.classId);
    await this.record.markUnavailable(sessions.map((s) => s.id), true);
    for (const s of sessions) {
      await this.attempts.deleteBySession(s.id);
      await this.sessions.delete(s.id);
    }
  }

  // ---------- Helpers ----------

  private judgeData(session: Session, key: string, isManager: boolean): JudgeTarget {
    const p = session.problem(key);
    const { settings } = session.snapshot;
    return {
      sessionTitle: session.snapshot.title,
      problemTitle: `${p.key}. ${p.title}`,
      timeLimitMs: p.timeLimitMs,
      memoryLimitMb: p.memoryLimitMb,
      testCases: p.testCases.map((t, i) => ({ id: `${p.key}-${i + 1}`, input: t.input, expectedOutput: t.expectedOutput, points: t.points, isSample: t.isSample })),
      allowedLanguages: settings.allowedLanguages,
      maxSubmissions: isManager ? null : settings.maxSubmissionsPerProblem,
    };
  }

  private cannotSubmit(access: Access): DomainError {
    return DomainError.conflict('assessment.cannot_submit',
      access.classInfo && access.classInfo.status !== 'ACTIVE' ? 'Lớp đã được lưu trữ, không nhận bài nộp nữa.'
        : access.state === 'UPCOMING' ? 'Phiên chưa mở, chưa thể nộp bài.'
        : access.state === 'CLOSED' ? 'Phiên đã đóng, không nhận bài nộp nữa.'
        : 'Bạn không còn là học sinh của lớp này nên không thể nộp bài.');
  }

  private async mustStartFirst(actor: Actor, session: Session, access: Access): Promise<boolean> {
    if (!session.snapshot.settings.isTimed || access.canManage || access.state === 'CLOSED') return false;
    return !(await this.attempts.find(session.id, actor.id));
  }

  private async access(actor: Actor, session: Session): Promise<Access> {
    return (await this.accessMany(actor, [session])).get(session.id)!;
  }

  /** Access to many sessions at once: one class lookup for all, and the actor's role checked once per class. */
  private async accessMany(actor: Actor, sessions: Session[]): Promise<Map<string, Access>> {
    const now = new Date();
    const classIds = [...new Set(sessions.map((s) => s.snapshot.classId).filter((id): id is string => !!id))];
    const classes = classIds.length ? await this.classes.getClasses(classIds) : new Map<string, ClassInfo>();
    const roles = new Map<string, { canManage: boolean; membership: Awaited<ReturnType<ClassAccess['membership']>> }>();
    for (const classId of classIds) {
      const canManage = classes.has(classId) && (await this.classes.canManage(actor, classId));
      roles.set(classId, { canManage, membership: canManage ? null : await this.classes.membership(actor.id, classId) });
    }
    const result = new Map<string, Access>();
    for (const session of sessions) {
      const { classId, createdBy } = session.snapshot;
      if (!classId) {
        const canManage = actor.role === 'ADMIN' || actor.id === createdBy.id;
        const state = session.stateAt(now, true);
        result.set(session.id, { canView: true, canManage, isParticipantNow: state === 'OPEN', state, classInfo: null });
        continue;
      }
      const classInfo = classes.get(classId) ?? null;
      const { canManage, membership } = roles.get(classId)!;
      const state = session.stateAt(now, classInfo?.status === 'ACTIVE');
      result.set(session.id, {
        canView: canManage || membership !== null,
        canManage,
        isParticipantNow: state === 'OPEN' && (canManage || membership === 'current'),
        state,
        classInfo,
      });
    }
    return result;
  }

  private async ensureView(actor: Actor, session: Session): Promise<Access> {
    const access = await this.access(actor, session);
    if (!access.canView) throw notFound();
    return access;
  }

  private async ensureManage(actor: Actor, session: Session) {
    const access = await this.ensureView(actor, session);
    if (!access.canManage) {
      throw DomainError.forbidden('assessment.not_session_manager', 'Chỉ giáo viên phụ trách hoặc người tạo phiên được thao tác với phiên này.');
    }
  }

  /**
   * Learning-record sessions whose topics the actor may not see yet: running tests and exams (OJ-20), and practice that
   * hides its topics (a mixed review, OJ-24). One listing query for all of them.
   */
  private async topicsHiddenIn(actor: Actor, records: RecordSession[]): Promise<Set<string>> {
    const ids = records.filter((r) => r.available).map((r) => r.sessionId);
    const sessions = await this.sessions.findListing(ids);
    const accesses = await this.accessMany(actor, sessions);
    return new Set(
      sessions.filter((s) => !s.topicsVisibleTo(accesses.get(s.id)!.canManage, accesses.get(s.id)!.state)).map((s) => s.id),
    );
  }

  private async hiddenSessions(actor: Actor, sessionIds: string[]): Promise<Set<string>> {
    const visibility = await this.visibility(actor, sessionIds);
    return new Set([...visibility].filter(([, v]) => v === 'HIDDEN').map(([id]) => id));
  }

  private async load(id: string): Promise<Session> {
    const session = await this.sessions.findById(id);
    if (!session) throw notFound();
    return session;
  }

  private async putRecordSession(session: Session) {
    const s = session.snapshot;
    const cls = s.classId ? (await this.classes.getClasses([s.classId])).get(s.classId) : undefined;
    await this.record.putSession({
      sessionId: session.id,
      title: s.title,
      type: s.type,
      classId: s.classId,
      className: cls?.name ?? null,
      problems: s.problems.map((p) => ({ key: p.key, title: p.title, points: p.points, tags: p.tags })),
      available: true,
      classDeleted: false,
    });
  }

  private async dtos(actor: Actor, sessions: Session[]): Promise<SessionDto[]> {
    const ids = sessions.map((s) => s.id);
    const [progress, attempts] = await Promise.all([
      this.record.progressOfUser(actor.id, ids),
      this.attempts.findForUser(actor.id, ids),
    ]);
    const now = new Date();
    const accesses = await this.accessMany(actor, sessions);
    const result: SessionDto[] = [];
    for (const session of sessions) {
      const s = session.snapshot;
      const access = accesses.get(session.id)!;
      const attempt = attempts.find((a) => a.sessionId === session.id) ?? null;
      const timed = s.settings.isTimed && !access.canManage;
      const needsStart = timed && !attempt && access.state !== 'CLOSED';
      result.push({
        id: session.id,
        title: s.title,
        description: s.description,
        type: s.type,
        audience: session.audience,
        classId: s.classId,
        className: access.classInfo?.name ?? null,
        classStatus: access.classInfo?.status ?? null,
        opensAt: s.window.opensAt?.toISOString() ?? null,
        closesAt: s.window.closesAt?.toISOString() ?? null,
        state: access.state,
        sourceSetId: s.sourceSetId,
        createdById: s.createdBy.id,
        createdByName: s.createdBy.name,
        totalPoints: session.totalPoints,
        problems: s.problems.map((p, i) => ({
          key: p.key, code: p.code, title: p.title, difficulty: p.difficulty, points: p.points, order: i + 1,
          tags: session.topicsVisibleTo(access.canManage, access.state) ? p.tags : [],
        })),
        canManage: access.canManage,
        canSubmit: access.isParticipantNow && (!timed || (!!attempt && attempt.isRunning(now))),
        myProgress: myProgress(session, progress.filter((r) => r.sessionId === session.id), session.visibilityFor(access.canManage, access.state)),
        settings: toSettingsDto(s.settings),
        myAttempt: attempt ? { startedAt: attempt.startedAt.toISOString(), endsAt: attempt.endsAt.toISOString() } : null,
        needsStart,
        serverNow: now.toISOString(),
        createdAt: s.createdAt.toISOString(),
      });
    }
    return result;
  }
}

function myProgress(session: Session, rows: RecordProgress[], visibility: ResultVisibility): MySessionProgressDto {
  const problems = session.snapshot.problems;
  const submissionCounts = Object.fromEntries(rows.map((r) => [r.problemKey, r.attempts]));
  if (visibility === 'HIDDEN') {
    return { solvedKeys: [], bestScores: {}, earnedPoints: 0, completed: false, submissionCounts, resultsHidden: true };
  }
  const bestScores: Record<string, number> = {};
  let earned = 0;
  for (const r of rows) {
    bestScores[r.problemKey] = r.bestScore;
    const p = problems.find((x) => x.key === r.problemKey);
    if (p) earned += (p.points * r.bestScore) / 100;
  }
  const solvedKeys = rows.filter((r) => r.solvedAt).map((r) => r.problemKey);
  return {
    solvedKeys,
    bestScores,
    earnedPoints: Math.round(earned * 100) / 100,
    completed: problems.length > 0 && problems.every((p) => solvedKeys.includes(p.key)),
    submissionCounts,
    resultsHidden: false,
  };
}

function toSettingsDto(s: SessionSettings): SessionSettingsDto {
  return {
    durationMinutes: s.durationMinutes,
    allowedLanguages: s.allowedLanguages,
    maxSubmissionsPerProblem: s.maxSubmissionsPerProblem,
    feedback: s.feedback,
    checkPlagiarism: s.checkPlagiarism,
    checkAiUsage: s.checkAiUsage,
    hideTopics: s.hideTopics,
  };
}

function windowOf(opensAt: string | null, closesAt: string | null): TimeWindow {
  return TimeWindow.of(opensAt ? new Date(opensAt) : null, closesAt ? new Date(closesAt) : null);
}

const notFound = () => DomainError.notFound('assessment.session_not_found', 'Không tìm thấy phiên.');
