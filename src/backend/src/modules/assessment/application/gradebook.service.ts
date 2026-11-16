import { Injectable } from '@nestjs/common';
import type { ClassGradebookDto } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { SessionRepository } from '../domain/repositories.js';
import { buildGradebook } from './gradebook.js';
import { ClassAccess, LearningRecordStore } from './ports.js';

/** A class's scores across its sessions, for the people who manage the class (OJ-31). */
@Injectable()
export class GradebookService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly classes: ClassAccess,
    private readonly record: LearningRecordStore,
  ) {}

  async gradebook(actor: Actor, classId: string, now = new Date()): Promise<ClassGradebookDto> {
    if (!(await this.classes.getClasses([classId])).has(classId)) {
      throw DomainError.notFound('classroom.not_found', 'Không tìm thấy lớp.');
    }
    if (!(await this.classes.canManage(actor, classId))) {
      throw DomainError.forbidden('assessment.not_class_teacher', 'Chỉ giáo viên phụ trách lớp xem được bảng điểm.');
    }

    // Only sessions that have opened: an upcoming one has no scores and would read as everyone at 0.
    const opened = (await this.sessions.findByClass(classId))
      .map((s) => ({ id: s.id, data: s.snapshot }))
      .filter((s) => s.data.window.stateAt(now) !== 'UPCOMING');
    const [roster, progress] = await Promise.all([
      this.classes.currentStudents(classId),
      this.record.progressOfSessions(opened.map((s) => s.id)),
    ]);

    // Someone with a score who is not on the roster is either a former student (kept, marked) or staff trying a
    // problem (left out). Few people, so one membership check each is fine.
    const onRoster = new Set(roster.map((s) => s.id));
    const others = [...new Set(progress.map((p) => p.userId).filter((id) => !onRoster.has(id)))];
    const relations = await Promise.all(others.map(async (id) => [id, await this.classes.membership(id, classId)] as const));
    const former = new Set(relations.filter(([, m]) => m === 'former').map(([id]) => id));

    return buildGradebook(
      classId,
      opened.map(({ id, data }) => ({
        id,
        title: data.title,
        type: data.type,
        opensAt: data.window.opensAt,
        closesAt: data.window.closesAt,
        createdAt: data.createdAt,
        problems: data.problems.map((p) => ({ key: p.key, points: p.points })),
      })),
      roster,
      former,
      progress,
    );
  }
}
