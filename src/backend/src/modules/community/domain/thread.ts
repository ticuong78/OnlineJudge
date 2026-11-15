import type { Role, ThreadKind } from '@oj/contracts';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';

const MAX_REPLIES = 500;

export interface Author {
  id: string;
  name: string;
  role: Role;
}

export interface Reply {
  id: string;
  author: Author;
  body: string;
  createdAt: Date;
}

export interface ThreadState {
  classId: string;
  kind: ThreadKind;
  title: string;
  body: string;
  author: Author;
  pinned: boolean;
  /** Optional link to one problem of one session of the class. */
  topic: { sessionId: string; sessionTitle: string; problemKey: string | null } | null;
  replies: Reply[];
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * A thread on the class board: a teacher's announcement or a question anyone in the class can answer.
 * Who may post is decided by the application (class role and status); the thread guards its own content.
 */
export class Thread extends AggregateRoot {
  private constructor(id: string, private state: ThreadState) {
    super(id);
  }

  static start(input: {
    classId: string;
    kind: ThreadKind;
    title: string;
    body: string;
    author: Author;
    topic: ThreadState['topic'];
  }): Thread {
    const now = new Date();
    return new Thread(newId(), {
      ...input,
      title: validTitle(input.title),
      body: validBody(input.body),
      pinned: false,
      replies: [],
      createdAt: now,
      lastActivityAt: now,
    });
  }

  static rehydrate(id: string, state: ThreadState): Thread {
    return new Thread(id, state);
  }

  get snapshot(): Readonly<ThreadState> {
    return this.state;
  }

  reply(author: Author, body: string, now = new Date()): Reply {
    assert(this.state.replies.length < MAX_REPLIES, 'community.too_many_replies', 'Chủ đề đã quá dài, hãy mở chủ đề mới.');
    const reply = { id: newId(), author, body: validBody(body), createdAt: now };
    this.state.replies.push(reply);
    this.state.lastActivityAt = now;
    return reply;
  }

  removeReply(replyId: string, byUserId: string, isManager: boolean): void {
    const reply = this.state.replies.find((r) => r.id === replyId);
    if (!reply) throw DomainError.notFound('community.reply_not_found', 'Không tìm thấy trả lời.');
    if (reply.author.id !== byUserId && !isManager) {
      throw DomainError.forbidden('community.not_author', 'Bạn chỉ xóa được trả lời của mình.');
    }
    this.state.replies = this.state.replies.filter((r) => r.id !== replyId);
  }

  /**
   * A student's question no teacher or administrator has replied to yet. Replies from classmates do not count as an
   * answer, and a question a teacher asked is not waiting for the teacher.
   */
  get awaitsAnswer(): boolean {
    return (
      this.state.kind === 'QUESTION'
      && this.state.author.role === 'STUDENT'
      && !this.state.replies.some((r) => r.author.role !== 'STUDENT')
    );
  }

  canBeDeletedBy(userId: string, isManager: boolean): boolean {
    return isManager || this.state.author.id === userId;
  }

  pin(pinned: boolean): void {
    this.state.pinned = pinned;
  }
}

function validTitle(title: string): string {
  const t = title.trim();
  assert(t.length >= 1 && t.length <= 200, 'community.invalid_title', 'Tiêu đề phải từ 1 đến 200 ký tự.');
  return t;
}

function validBody(body: string): string {
  const b = body.trim();
  assert(b.length >= 1 && b.length <= 20_000, 'community.invalid_body', 'Nội dung phải từ 1 đến 20000 ký tự.');
  return b;
}
