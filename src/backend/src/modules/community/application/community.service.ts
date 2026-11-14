import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AWAITING_QUESTIONS_LIMIT } from '@oj/contracts';
import type {
  ClassStatus,
  CreateThreadRequest,
  ThreadDto,
  ThreadReplyDto,
  ThreadSummaryDto,
} from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { CLASS_PURGED, type ClassPurgedEvent } from '../../classroom/classroom.events.js';
import { Thread, type Reply } from '../domain/thread.js';
import { ClassMembership, SessionDirectory, ThreadRepository } from './ports.js';

/** The teacher home lists at most this many waiting questions, newest first (OJ-26). */
export const AWAITING_LIMIT = AWAITING_QUESTIONS_LIMIT;

/** The actor's standing in a class, which decides what they may do on its board. */
interface Standing {
  isManager: boolean;
  isCurrentMember: boolean;
  canView: boolean;
  /** Posting and replying need an active class. */
  canParticipate: boolean;
  status: ClassStatus;
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly classes: ClassMembership,
    private readonly sessions: SessionDirectory,
  ) {}

  async list(actor: Actor, classId: string, topic: { sessionId?: string; problemKey?: string }): Promise<ThreadSummaryDto[]> {
    await this.ensureView(actor, classId);
    const threads = await this.threads.listByClass(classId, topic);
    return threads
      .sort((a, b) =>
        Number(b.snapshot.pinned) - Number(a.snapshot.pinned)
        || b.snapshot.lastActivityAt.getTime() - a.snapshot.lastActivityAt.getTime())
      .map(toSummary);
  }

  /**
   * The newest students' questions no teacher has answered yet, in the active classes the actor runs (UAT M8): the
   * teacher home shows them in one request instead of one per class. At most AWAITING_LIMIT, in one query (OJ-28).
   */
  async awaiting(actor: Actor): Promise<ThreadSummaryDto[]> {
    const classIds = await this.classes.activeManagedClassIds(actor);
    const threads = await this.threads.listAwaitingQuestions(classIds, AWAITING_LIMIT);
    return threads.filter((t) => t.awaitsAnswer).map(toSummary);
  }

  async get(actor: Actor, id: string): Promise<ThreadDto> {
    const thread = await this.load(id);
    const standing = await this.ensureView(actor, thread.snapshot.classId);
    return toDto(thread, actor, standing);
  }

  async create(actor: Actor, classId: string, input: CreateThreadRequest): Promise<ThreadDto> {
    const standing = await this.ensureView(actor, classId);
    ensureParticipate(standing);
    if (input.kind === 'ANNOUNCEMENT' && !standing.isManager) {
      throw DomainError.forbidden('community.only_teacher_announces', 'Chỉ giáo viên của lớp được đăng thông báo.');
    }
    let topic = null;
    if (input.sessionId) {
      const session = await this.sessions.summary(input.sessionId);
      if (!session || session.classId !== classId) {
        throw DomainError.validation('community.invalid_topic', 'Phiên được chọn không thuộc lớp này.');
      }
      const key = input.problemKey?.toUpperCase() ?? null;
      if (key && !session.problemKeys.includes(key)) {
        throw DomainError.validation('community.invalid_topic', 'Bài được chọn không có trong phiên.');
      }
      topic = { sessionId: input.sessionId, sessionTitle: session.title, problemKey: key };
    }
    const thread = Thread.start({
      classId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      author: { id: actor.id, name: actor.name, role: actor.role },
      topic,
    });
    await this.threads.save(thread);
    return toDto(thread, actor, standing);
  }

  async reply(actor: Actor, id: string, body: string): Promise<ThreadReplyDto> {
    const thread = await this.load(id);
    const standing = await this.ensureView(actor, thread.snapshot.classId);
    ensureParticipate(standing);
    const reply = thread.reply({ id: actor.id, name: actor.name, role: actor.role }, body);
    await this.threads.save(thread);
    return toReplyDto(reply, actor, standing);
  }

  async delete(actor: Actor, id: string): Promise<void> {
    const thread = await this.load(id);
    const standing = await this.ensureView(actor, thread.snapshot.classId);
    if (!thread.canBeDeletedBy(actor.id, standing.isManager)) {
      throw DomainError.forbidden('community.not_author', 'Bạn chỉ xóa được chủ đề của mình.');
    }
    await this.threads.delete(id);
  }

  async deleteReply(actor: Actor, id: string, replyId: string): Promise<void> {
    const thread = await this.load(id);
    const standing = await this.ensureView(actor, thread.snapshot.classId);
    thread.removeReply(replyId, actor.id, standing.isManager);
    await this.threads.save(thread);
  }

  async pin(actor: Actor, id: string, pinned: boolean): Promise<ThreadDto> {
    const thread = await this.load(id);
    const standing = await this.ensureView(actor, thread.snapshot.classId);
    if (!standing.isManager) throw DomainError.forbidden('community.only_teacher_pins', 'Chỉ giáo viên của lớp được ghim chủ đề.');
    thread.pin(pinned);
    await this.threads.save(thread);
    return toDto(thread, actor, standing);
  }

  @OnEvent(CLASS_PURGED, { async: true, promisify: true })
  async onClassPurged(event: ClassPurgedEvent): Promise<void> {
    await this.threads.deleteByClass(event.classId);
  }

  private async ensureView(actor: Actor, classId: string): Promise<Standing> {
    const status = await this.classes.status(classId);
    if (!status) throw notFound();
    const isManager = await this.classes.canManage(actor, classId);
    const membership = isManager ? null : await this.classes.membership(actor.id, classId);
    if (!isManager && !membership) throw notFound();
    const isCurrentMember = membership === 'current';
    return {
      isManager,
      isCurrentMember,
      canView: true,
      canParticipate: status === 'ACTIVE' && (isManager || isCurrentMember),
      status,
    };
  }

  private async load(id: string): Promise<Thread> {
    const thread = await this.threads.findById(id);
    if (!thread) throw DomainError.notFound('community.not_found', 'Không tìm thấy chủ đề.');
    return thread;
  }
}

function ensureParticipate(standing: Standing) {
  if (standing.canParticipate) return;
  throw DomainError.conflict('community.read_only',
    standing.status !== 'ACTIVE' ? 'Lớp đã được lưu trữ, bảng tin chỉ còn để đọc.' : 'Bạn không còn là học sinh của lớp này.');
}

const notFound = () => DomainError.notFound('community.class_not_found', 'Không tìm thấy lớp.');

function toSummary(thread: Thread): ThreadSummaryDto {
  const s = thread.snapshot;
  return {
    id: thread.id,
    classId: s.classId,
    kind: s.kind,
    title: s.title,
    authorId: s.author.id,
    authorName: s.author.name,
    authorRole: s.author.role,
    pinned: s.pinned,
    sessionId: s.topic?.sessionId ?? null,
    sessionTitle: s.topic?.sessionTitle ?? null,
    problemKey: s.topic?.problemKey ?? null,
    replyCount: s.replies.length,
    awaitingAnswer: thread.awaitsAnswer,
    lastActivityAt: s.lastActivityAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}

function toReplyDto(r: Reply, actor: Actor, standing: Standing): ThreadReplyDto {
  return {
    id: r.id,
    authorId: r.author.id,
    authorName: r.author.name,
    authorRole: r.author.role,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    canDelete: standing.isManager || r.author.id === actor.id,
  };
}

function toDto(thread: Thread, actor: Actor, standing: Standing): ThreadDto {
  return {
    ...toSummary(thread),
    body: thread.snapshot.body,
    replies: thread.snapshot.replies.map((r) => toReplyDto(r, actor, standing)),
    canReply: standing.canParticipate,
    canDelete: thread.canBeDeletedBy(actor.id, standing.isManager),
    canPin: standing.isManager,
  };
}
