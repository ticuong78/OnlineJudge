import { Injectable } from '@nestjs/common';
import {
  PATHS_PAGE_SIZE,
  type LearningPathDto,
  type LearningPathPageDto,
  type LearningPathSummaryDto,
  type ListPathsQuery,
  type PathStepDto,
  type UpsertLearningPathRequest,
} from '@oj/contracts';
import { isStaff, type Actor } from '../../../shared/application/actor.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { LearningPath, PATH_SESSION_TYPES } from '../domain/learning-path.js';
import { LearningPathRepository, SessionRepository } from '../domain/repositories.js';
import type { Session } from '../domain/session.js';
import { LearningRecordStore } from './ports.js';

const notFound = () => DomainError.notFound('assessment.path_not_found', 'Không tìm thấy lộ trình.');

/**
 * Use cases of learning paths (OJ-24). A path only points at public practice sessions; what a student sees of each
 * problem (topics included) follows the same rules as the session itself, and progress is the student's own record.
 */
@Injectable()
export class LearningPathService {
  constructor(
    private readonly paths: LearningPathRepository,
    private readonly sessions: SessionRepository,
    private readonly record: LearningRecordStore,
  ) {}

  /**
   * One page of paths (OJ-27, OJ-28): `public` ones for anyone, or the caller's own (`mine`, staff only), newest
   * first. One more row than `limit` is read, so `next` is null exactly when nothing follows.
   */
  async list(actor: Actor, query: ListPathsQuery = {}): Promise<LearningPathPageDto> {
    if (query.scope === 'mine' && !isStaff(actor)) return { items: [], next: null };
    const limit = query.limit ?? PATHS_PAGE_SIZE;
    const filter = query.scope === 'mine' ? { ownerId: actor.id } : { publicOnly: true };
    const rows = await this.paths.list(filter, { limit: limit + 1, before: query.before ? decodeCursor(query.before) : undefined });
    const paths = rows.slice(0, limit);
    const view = await this.view(actor, paths);
    const last = paths.at(-1);
    return { items: paths.map((p) => view.summary(p)), next: rows.length > limit && last ? encodeCursor(last) : null };
  }

  async get(actor: Actor, id: string): Promise<LearningPathDto> {
    const path = await this.load(actor, id);
    return (await this.view(actor, [path])).detail(path, actor);
  }

  async create(actor: Actor, input: UpsertLearningPathRequest): Promise<LearningPathDto> {
    if (!isStaff(actor)) throw DomainError.forbidden('assessment.not_staff', 'Chỉ giáo viên mới tạo được lộ trình.');
    const path = LearningPath.create({ id: actor.id, name: actor.name }, input, await this.stepSessions(input));
    await this.paths.save(path);
    return this.get(actor, path.id);
  }

  async update(actor: Actor, id: string, input: UpsertLearningPathRequest): Promise<LearningPathDto> {
    const path = await this.load(actor, id);
    path.ensureEditable(actor);
    path.update(input, await this.stepSessions(input));
    await this.paths.save(path);
    return this.get(actor, id);
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const path = await this.load(actor, id);
    path.ensureEditable(actor);
    await this.paths.delete(id);
  }

  private async load(actor: Actor, id: string): Promise<LearningPath> {
    const path = await this.paths.findById(id);
    // A private path does not exist for anyone but its owner and administrators.
    if (!path || !path.canView(actor)) throw notFound();
    return path;
  }

  private async stepSessions(input: UpsertLearningPathRequest) {
    const sessions = await this.sessions.findListing(input.steps.map((s) => s.sessionId));
    return sessions.map((s) => ({ id: s.id, classId: s.snapshot.classId, type: s.snapshot.type }));
  }

  /** Loads every session and the caller's progress once, for one or many paths. */
  private async view(actor: Actor, paths: LearningPath[]) {
    const ids = [...new Set(paths.flatMap((p) => p.snapshot.steps.map((s) => s.sessionId)))];
    const sessions = new Map((await this.sessions.findListing(ids)).map((s) => [s.id, s]));
    const solved = new Set(
      (await this.record.progressOfUser(actor.id, ids)).filter((r) => r.solvedAt).map((r) => `${r.sessionId}/${r.problemKey}`),
    );
    const now = new Date();

    const step = (s: LearningPath['snapshot']['steps'][number]): PathStepDto => {
      const session: Session | undefined = sessions.get(s.sessionId);
      // Checked again on reading (defence in depth): only public self-study sessions are ever shown through a path.
      if (!session || session.snapshot.classId !== null || !PATH_SESSION_TYPES.includes(session.snapshot.type)) {
        return { ...s, review: false, sessionTitle: '', state: 'CLOSED', available: false, problems: [], solved: 0, total: 0 };
      }
      const snap = session.snapshot;
      // Public sessions: the class status does not apply; managers (creator, admin) see topics as on the session page.
      const state = session.stateAt(now, true);
      const manager = actor.role === 'ADMIN' || actor.id === snap.createdBy.id;
      const showTopics = session.topicsVisibleTo(manager, state);
      const problems = snap.problems.map((p) => ({
        key: p.key, title: p.title, difficulty: p.difficulty, tags: showTopics ? p.tags : [], solved: solved.has(`${session.id}/${p.key}`),
      }));
      return {
        ...s,
        review: snap.settings.hideTopics,
        sessionTitle: snap.title,
        state,
        available: true,
        problems,
        solved: problems.filter((p) => p.solved).length,
        total: problems.length,
      };
    };

    const summary = (p: LearningPath): LearningPathSummaryDto => {
      const steps = p.snapshot.steps.map(step);
      const s = p.snapshot;
      return {
        id: p.id, title: s.title, description: s.description, topic: s.topic, ownerId: s.owner.id, ownerName: s.owner.name,
        isPublic: s.isPublic, stepCount: s.steps.length,
        solved: steps.reduce((n, x) => n + x.solved, 0), total: steps.reduce((n, x) => n + x.total, 0),
        updatedAt: s.updatedAt.toISOString(),
      };
    };

    const detail = (p: LearningPath, viewer: Actor): LearningPathDto => {
      const steps = p.snapshot.steps.map(step);
      let next: LearningPathDto['next'] = null;
      for (const [i, st] of steps.entries()) {
        if (!st.available || st.state !== 'OPEN') continue;
        const open = st.problems.find((q) => !q.solved);
        if (open) {
          next = { sessionId: st.sessionId, key: open.key, title: open.title, stepIndex: i };
          break;
        }
      }
      return { ...summary(p), canEdit: p.canEdit(viewer), steps, next };
    };

    return { summary, detail };
  }
}

/** The position after a path, for `?before=` (OJ-28): opaque to clients, so the order can change without breaking them. */
export function encodeCursor(path: LearningPath): string {
  return Buffer.from(`${path.snapshot.createdAt.toISOString()}|${path.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [at, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(at ?? '');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (extra !== undefined || Number.isNaN(createdAt.getTime()) || !uuid.test(id ?? '')) {
    throw DomainError.validation('assessment.invalid_cursor', 'Vị trí trang không hợp lệ. Hãy tải lại danh sách.');
  }
  return { createdAt, id: id! };
}

