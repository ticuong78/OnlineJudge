import type { MembershipRequestKind } from '@oj/contracts';
import type { ClassCode, Classroom, Enrollment } from './classroom.js';
import type { MembershipRequest } from './membership-request.js';

export abstract class ClassroomRepository {
  abstract findById(id: string): Promise<Classroom | null>;
  abstract findByIds(ids: string[]): Promise<Classroom[]>;
  abstract findByCode(code: ClassCode): Promise<Classroom | null>;
  abstract findAll(): Promise<Classroom[]>;
  abstract findByTeacher(teacherId: string): Promise<Classroom[]>;
  /** Classes belonging to any of these organizations. */
  abstract findByOrganizations(organizationIds: string[]): Promise<Classroom[]>;
  abstract findDueForPurge(now: Date): Promise<Classroom[]>;
  abstract save(classroom: Classroom): Promise<void>;
  abstract delete(id: string): Promise<void>;
}

export abstract class EnrollmentRepository {
  /** All memberships of a student (current and history). */
  abstract findByStudent(studentId: string): Promise<Enrollment[]>;
  abstract find(studentId: string, classId: string): Promise<Enrollment | null>;
  /** Open memberships of a class. */
  abstract findOpenByClass(classId: string): Promise<Enrollment[]>;
  abstract findAllOpen(): Promise<Enrollment[]>;
  /** classId -> number of open memberships */
  abstract countOpenByClass(classIds: string[]): Promise<Map<string, number>>;
  abstract save(enrollment: Enrollment): Promise<void>;
  abstract deleteByStudent(studentId: string): Promise<void>;
  abstract deleteByClass(classId: string): Promise<void>;
}

export abstract class MembershipRequestRepository {
  abstract findById(id: string): Promise<MembershipRequest | null>;
  /** The open request of this kind, if any (at most one per student, class and kind). */
  abstract findPending(studentId: string, classId: string, kind: MembershipRequestKind): Promise<MembershipRequest | null>;
  abstract findPendingByClass(classId: string): Promise<MembershipRequest[]>;
  /** A student's requests, newest first (recent history included). */
  abstract findByStudent(studentId: string, limit: number): Promise<MembershipRequest[]>;
  /** classId -> number of pending requests */
  abstract countPendingByClass(classIds: string[]): Promise<Map<string, number>>;
  abstract save(request: MembershipRequest): Promise<void>;
  abstract deleteByStudent(studentId: string): Promise<void>;
  abstract deleteByClass(classId: string): Promise<void>;
}
