import { clipTag, normalizeTag, type ProblemSetType } from '@oj/contracts';
import { stripExternalLinks } from '../../../shared/domain/external-links.js';
import type { Actor } from '../../../shared/application/actor.js';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';

export const MAX_PATH_STEPS = 30;
/** Session types a path may use: self-study. Tests and exams are not practice. */
export const PATH_SESSION_TYPES: readonly ProblemSetType[] = ['PRACTICE', 'HOMEWORK'];

export interface PathStep {
  sessionId: string;
  title: string;
  note: string;
}

export interface LearningPathState {
  owner: { id: string; name: string };
  title: string;
  description: string;
  topic: string | null;
  isPublic: boolean;
  steps: PathStep[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningPathContent {
  title: string;
  description: string;
  topic: string | null;
  isPublic: boolean;
  steps: PathStep[];
}

/** What a step's session must be: public (no class) and self-study. Checked by the service with the real sessions. */
export interface StepSession {
  id: string;
  classId: string | null;
  type: ProblemSetType;
}

/**
 * A learning path (OJ-24): a teacher's ordered steps through public practice sessions, from easy to harder. Steps are
 * recommended, not locked.
 */
export class LearningPath extends AggregateRoot {
  private constructor(id: string, private state: LearningPathState) {
    super(id);
  }

  static create(owner: { id: string; name: string }, content: LearningPathContent, sessions: StepSession[], now = new Date()): LearningPath {
    return new LearningPath(newId(), { owner, ...valid(content, sessions), createdAt: now, updatedAt: now });
  }

  static rehydrate(id: string, state: LearningPathState): LearningPath {
    return new LearningPath(id, state);
  }

  get snapshot(): Readonly<LearningPathState> {
    return this.state;
  }

  update(content: LearningPathContent, sessions: StepSession[], now = new Date()): void {
    this.state = { ...this.state, ...valid(content, sessions), updatedAt: now };
  }

  canEdit(actor: Actor): boolean {
    return actor.role === 'ADMIN' || actor.id === this.state.owner.id;
  }

  canView(actor: Actor): boolean {
    return this.state.isPublic || this.canEdit(actor);
  }

  ensureEditable(actor: Actor): void {
    if (!this.canEdit(actor)) throw DomainError.forbidden('assessment.not_path_owner', 'Chỉ người tạo lộ trình (hoặc quản trị viên) được sửa hay xóa lộ trình này.');
  }
}

function valid(content: LearningPathContent, sessions: StepSession[]): LearningPathContent {
  const title = content.title.trim();
  assert(title.length >= 1 && title.length <= 200, 'assessment.invalid_path_title', 'Tên lộ trình phải từ 1 đến 200 ký tự.');
  assert(content.description.length <= 5000, 'assessment.invalid_path_description', 'Mô tả lộ trình tối đa 5000 ký tự.');
  assert(content.steps.length >= 1 && content.steps.length <= MAX_PATH_STEPS, 'assessment.invalid_path_steps',
    `Lộ trình cần từ 1 đến ${MAX_PATH_STEPS} bước.`);
  const ids = content.steps.map((s) => s.sessionId);
  assert(new Set(ids).size === ids.length, 'assessment.duplicate_path_step', 'Mỗi phiên chỉ dùng cho một bước của lộ trình.');
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const steps = content.steps.map((step, i) => {
    const session = byId.get(step.sessionId);
    if (!session) {
      throw DomainError.validation('assessment.path_step_missing', `Bước ${i + 1}: phiên của bước này không còn nữa. Hãy bỏ bước hoặc chọn phiên khác.`);
    }
    // Public self-study sessions only: a path can never show a class's material or a test to everyone.
    if (session.classId !== null || !PATH_SESSION_TYPES.includes(session.type)) {
      throw DomainError.validation('assessment.path_step_not_public',
        `Bước ${i + 1}: chỉ dùng được phiên luyện tập hoặc bài tập về nhà công khai cho mọi người.`);
    }
    const stepTitle = step.title.trim();
    assert(stepTitle.length >= 1 && stepTitle.length <= 200, 'assessment.invalid_path_step_title', `Bước ${i + 1}: tên bước phải từ 1 đến 200 ký tự.`);
    assert(step.note.length <= 2000, 'assessment.invalid_path_step_note', `Bước ${i + 1}: ghi chú tối đa 2000 ký tự.`);
    // Teacher text shown to every student: links to other places are removed, as for imported problems.
    return { sessionId: step.sessionId, title: stepTitle, note: stripExternalLinks(step.note.trim()).text };
  });
  const topic = content.topic?.trim() ? clipTag(normalizeTag(content.topic)) : null;
  return { title, description: stripExternalLinks(content.description.trim()).text, topic, isPublic: content.isPublic, steps };
}
