import type { ClassStatus } from '@oj/contracts';
import { isOrgAdmin, type Actor } from '../../../shared/application/actor.js';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';
import { CLASS_PURGED, type ClassPurgedEvent } from '../classroom.events.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Join code students type at sign-up, e.g. 22DTHC5. Case-insensitive, unique across classes. */
export class ClassCode {
  private constructor(readonly value: string) {}

  static of(raw: string): ClassCode {
    const value = raw.trim().toUpperCase();
    assert(/^[A-Z0-9-]{4,20}$/.test(value), 'classroom.invalid_code',
      'Mã lớp gồm 4–20 ký tự chữ, số hoặc dấu gạch ngang (ví dụ 22DTHC5).');
    return new ClassCode(value);
  }
}

export interface ClassroomState {
  name: string;
  code: ClassCode;
  teacherId: string;
  /** The organization the class belongs to (OJ-8); null = the teacher's personal class. */
  organizationId: string | null;
  status: ClassStatus;
  archivedAt: Date | null;
  /** Scheduled permanent deletion (archived classes only). */
  purgeAt: Date | null;
  createdAt: Date;
}

/**
 * A class: exactly one teacher (staff member), many students, sessions of its own.
 * Lifecycle: ACTIVE -> ARCHIVED (course finished, read-only) -> restored, or deleted for good.
 */
export class Classroom extends AggregateRoot {
  private constructor(id: string, private state: ClassroomState) {
    super(id);
  }

  static open(name: string, code: ClassCode, teacherId: string, organizationId: string | null = null): Classroom {
    return new Classroom(newId(), {
      name: validName(name),
      code,
      teacherId,
      organizationId,
      status: 'ACTIVE',
      archivedAt: null,
      purgeAt: null,
      createdAt: new Date(),
    });
  }

  static rehydrate(id: string, state: ClassroomState): Classroom {
    return new Classroom(id, state);
  }

  get name() { return this.state.name; }
  get code() { return this.state.code; }
  get teacherId() { return this.state.teacherId; }
  get organizationId() { return this.state.organizationId; }
  get status() { return this.state.status; }
  get isActive() { return this.state.status === 'ACTIVE'; }
  get archivedAt() { return this.state.archivedAt; }
  get purgeAt() { return this.state.purgeAt; }
  get createdAt() { return this.state.createdAt; }

  /**
   * The administrator, the teacher in charge, and the org admins of the class's organization (OJ-8). Every class
   * permission elsewhere (sessions, results, rejudging, integrity, class board) derives from this rule.
   */
  isManagedBy(actor: Actor): boolean {
    return actor.role === 'ADMIN' || actor.id === this.state.teacherId || isOrgAdmin(actor, this.state.organizationId);
  }

  ensureManageableBy(actor: Actor): void {
    if (!this.isManagedBy(actor)) {
      throw DomainError.forbidden('classroom.not_teacher', 'Chỉ giáo viên phụ trách lớp hoặc quản trị viên được thao tác với lớp này.');
    }
  }

  /**
   * Permanent deletion (scheduled or immediate) erases sessions and submissions: only the class teacher and the
   * administrator. Org admins manage organization classes but may only archive them (owner's decision, OJ-8).
   */
  canDeleteBy(actor: Actor): boolean {
    return actor.role === 'ADMIN' || actor.id === this.state.teacherId;
  }

  ensureDeletableBy(actor: Actor): void {
    if (!this.canDeleteBy(actor)) {
      throw DomainError.forbidden('classroom.only_teacher_deletes',
        'Chỉ giáo viên phụ trách lớp hoặc quản trị viên được xóa hẳn lớp. Quản lý tổ chức có thể lưu trữ lớp.');
    }
  }

  /** New students, new sessions, submissions and edits require an active class. */
  ensureActive(): void {
    if (!this.isActive) {
      throw DomainError.conflict('classroom.archived', `Lớp ${this.state.name} đã được lưu trữ, không thể thay đổi. Hãy khôi phục lớp trước.`);
    }
  }

  rename(name: string): void {
    this.ensureActive();
    this.state.name = validName(name);
  }

  changeCode(code: ClassCode): void {
    this.ensureActive();
    this.state.code = code;
  }

  assignTeacher(teacherId: string): void {
    this.state.teacherId = teacherId;
  }

  /** A personal class joins one of the teacher's organizations. One way in the pilot: it cannot leave again. */
  moveToOrganization(organizationId: string): void {
    if (this.state.organizationId) {
      throw DomainError.conflict('classroom.already_in_organization', 'Lớp này đã thuộc một tổ chức.');
    }
    this.state.organizationId = organizationId;
  }

  archive(now = new Date()): void {
    this.ensureActive();
    this.state = { ...this.state, status: 'ARCHIVED', archivedAt: now };
  }

  restore(): void {
    if (this.isActive) return;
    this.state = { ...this.state, status: 'ACTIVE', archivedAt: null, purgeAt: null };
  }

  scheduleDeletion(days: number, now = new Date()): void {
    this.ensureArchived();
    assert(Number.isInteger(days) && days >= 1 && days <= 365, 'classroom.invalid_days', 'Số ngày phải từ 1 đến 365.');
    this.state.purgeAt = new Date(now.getTime() + days * DAY_MS);
  }

  cancelDeletion(): void {
    this.state.purgeAt = null;
  }

  isDueForPurge(now = new Date()): boolean {
    return this.state.status === 'ARCHIVED' && this.state.purgeAt !== null && this.state.purgeAt <= now;
  }

  /** Permanent deletion: requires an archived class and, when done by hand, the exact class name. */
  purge(confirmName: string | null): void {
    this.ensureArchived();
    if (confirmName !== null && confirmName.trim() !== this.state.name) {
      throw DomainError.validation('classroom.confirm_name', 'Tên lớp nhập vào không khớp. Hãy gõ đúng tên lớp để xác nhận xóa.');
    }
    const event: ClassPurgedEvent = { name: CLASS_PURGED, occurredAt: new Date(), classId: this.id, className: this.state.name };
    this.record(event);
  }

  private ensureArchived() {
    if (this.isActive) {
      throw DomainError.conflict('classroom.not_archived', 'Hãy lưu trữ lớp trước khi xóa.');
    }
  }
}

function validName(name: string): string {
  const value = name.trim().replace(/\s+/g, ' ');
  assert(value.length >= 1 && value.length <= 100, 'classroom.invalid_name', 'Tên lớp phải từ 1 đến 100 ký tự.');
  return value;
}

/**
 * A student's membership of one class. Open (endedAt null) while the student is in the class;
 * ended when they leave (approved request) or the teacher removes them. Ended memberships are
 * kept as history. A student may have open memberships in several classes.
 */
export class Enrollment {
  private constructor(
    readonly studentId: string,
    readonly classId: string,
    private since: Date,
    private until: Date | null,
  ) {}

  static enroll(studentId: string, classId: string): Enrollment {
    return new Enrollment(studentId, classId, new Date(), null);
  }

  static rehydrate(studentId: string, classId: string, enrolledAt: Date, endedAt: Date | null): Enrollment {
    return new Enrollment(studentId, classId, enrolledAt, endedAt);
  }

  get enrolledAt() { return this.since; }
  get endedAt() { return this.until; }
  get isOpen() { return this.until === null; }

  end(now = new Date()): void {
    if (this.until === null) this.until = now;
  }

  reopen(now = new Date()): void {
    this.since = now;
    this.until = null;
  }
}
