import { Injectable } from '@nestjs/common';
import type { ClassStatus } from '@oj/contracts';
import type { Actor } from '../../../shared/application/actor.js';
import { ClassroomRepository, EnrollmentRepository } from '../domain/classroom.repository.js';
import { PeopleDirectory } from './ports.js';

export interface ClassSummary {
  id: string;
  name: string;
  teacherId: string;
  status: ClassStatus;
}

/** Published interface of the Classroom context. */
@Injectable()
export class ClassroomFacade {
  constructor(
    private readonly classes: ClassroomRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly people: PeopleDirectory,
  ) {}

  async getClasses(ids: string[]): Promise<Map<string, ClassSummary>> {
    const classes = await this.classes.findByIds([...new Set(ids)]);
    return new Map(classes.map((c) => [c.id, { id: c.id, name: c.name, teacherId: c.teacherId, status: c.status }]));
  }

  /**
   * Ids of classes the actor manages: all for the admin; for a teacher, taught classes plus the classes of the
   * organizations where they are org admin (OJ-8); none for students.
   */
  async managedClassIds(actor: Actor): Promise<string[] | 'ALL'> {
    if (actor.role === 'ADMIN') return 'ALL';
    if (actor.role !== 'TEACHER') return [];
    const adminOf = (actor.organizations ?? []).filter((o) => o.role === 'ADMIN').map((o) => o.id);
    const [taught, ofOrgs] = await Promise.all([this.classes.findByTeacher(actor.id), this.classes.findByOrganizations(adminOf)]);
    return [...new Set([...taught, ...ofOrgs].map((c) => c.id))];
  }

  /** The managed classes (`managedClassIds`) that are still active, as ids: archived ones are left out (OJ-28). */
  async activeManagedClassIds(actor: Actor): Promise<string[]> {
    const managed = await this.managedClassIds(actor);
    const classes = managed === 'ALL' ? await this.classes.findAll() : await this.classes.findByIds(managed);
    return classes.filter((c) => c.isActive).map((c) => c.id);
  }

  async canManage(actor: Actor, classId: string): Promise<boolean> {
    const classroom = await this.classes.findById(classId);
    return !!classroom && classroom.isManagedBy(actor);
  }

  /**
   * The user's relation to a class: `current` = open membership (may submit while the class is active),
   * `former` = history only (may read), null = not a member.
   */
  async membership(userId: string, classId: string): Promise<'current' | 'former' | null> {
    const m = await this.enrollments.find(userId, classId);
    return m ? (m.isOpen ? 'current' : 'former') : null;
  }

  /** Every class the student has belonged to (current and history). */
  async classIdsOfStudent(studentId: string): Promise<string[]> {
    return (await this.enrollments.findByStudent(studentId)).map((m) => m.classId);
  }

  async currentStudents(classId: string): Promise<{ id: string; displayName: string }[]> {
    const open = await this.enrollments.findOpenByClass(classId);
    const people = await this.people.getPeople(open.map((e) => e.studentId));
    return [...people.values()].map((p) => ({ id: p.id, displayName: p.displayName }));
  }
}
