import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ClassStatus, MembershipRequestKind, MembershipRequestStatus } from '@oj/contracts';
import { Column, Entity, In, Index, IsNull, LessThanOrEqual, PrimaryColumn, Repository } from 'typeorm';
import { ClassCode, Classroom, Enrollment } from '../domain/classroom.js';
import { ClassroomRepository, EnrollmentRepository, MembershipRequestRepository } from '../domain/classroom.repository.js';
import { MembershipRequest } from '../domain/membership-request.js';

@Entity('classrooms')
export class ClassroomOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 }) code: string;
  @Index()
  @Column('uuid') teacherId: string;
  @Index()
  @Column('uuid', { nullable: true }) organizationId: string | null;
  @Column({ type: 'varchar', length: 12, default: 'ACTIVE' }) status: string;
  @Column('timestamptz', { nullable: true }) archivedAt: Date | null;
  @Index()
  @Column('timestamptz', { nullable: true }) purgeAt: Date | null;
  @Column('timestamptz') createdAt: Date;
}

/** One row per (student, class) ever joined; `endedAt` null = still in that class. */
@Entity('enrollments')
export class EnrollmentOrmEntity {
  @PrimaryColumn('uuid') studentId: string;
  @PrimaryColumn('uuid') classId: string;
  @Column('timestamptz') enrolledAt: Date;
  @Column('timestamptz', { nullable: true }) endedAt: Date | null;
}

@Injectable()
export class TypeOrmClassroomRepository extends ClassroomRepository {
  constructor(@InjectRepository(ClassroomOrmEntity) private readonly repo: Repository<ClassroomOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toClassroom(row) : null;
  }

  async findByIds(ids: string[]) {
    return ids.length ? (await this.repo.findBy({ id: In([...new Set(ids)]) })).map(toClassroom) : [];
  }

  async findByCode(code: ClassCode) {
    const row = await this.repo.findOneBy({ code: code.value });
    return row ? toClassroom(row) : null;
  }

  async findAll() {
    return (await this.repo.find({ order: { status: 'ASC', name: 'ASC' } })).map(toClassroom);
  }

  async findByTeacher(teacherId: string) {
    return (await this.repo.find({ where: { teacherId }, order: { status: 'ASC', name: 'ASC' } })).map(toClassroom);
  }

  async findByOrganizations(organizationIds: string[]) {
    if (!organizationIds.length) return [];
    const rows = await this.repo.find({ where: { organizationId: In([...new Set(organizationIds)]) }, order: { status: 'ASC', name: 'ASC' } });
    return rows.map(toClassroom);
  }

  async findDueForPurge(now: Date) {
    const rows = await this.repo.findBy({ status: 'ARCHIVED', purgeAt: LessThanOrEqual(now) });
    return rows.map(toClassroom);
  }

  async save(c: Classroom) {
    await this.repo.save({
      id: c.id,
      name: c.name,
      code: c.code.value,
      teacherId: c.teacherId,
      organizationId: c.organizationId,
      status: c.status,
      archivedAt: c.archivedAt,
      purgeAt: c.purgeAt,
      createdAt: c.createdAt,
    });
  }

  async delete(id: string) {
    await this.repo.delete({ id });
  }
}

function toClassroom(row: ClassroomOrmEntity): Classroom {
  return Classroom.rehydrate(row.id, {
    name: row.name,
    code: ClassCode.of(row.code),
    teacherId: row.teacherId,
    organizationId: row.organizationId ?? null,
    status: row.status as ClassStatus,
    archivedAt: row.archivedAt,
    purgeAt: row.purgeAt,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class TypeOrmEnrollmentRepository extends EnrollmentRepository {
  constructor(@InjectRepository(EnrollmentOrmEntity) private readonly repo: Repository<EnrollmentOrmEntity>) {
    super();
  }

  async findByStudent(studentId: string) {
    return (await this.repo.find({ where: { studentId }, order: { enrolledAt: 'DESC' } })).map(toEnrollment);
  }

  async find(studentId: string, classId: string) {
    const row = await this.repo.findOneBy({ studentId, classId });
    return row ? toEnrollment(row) : null;
  }

  async findOpenByClass(classId: string) {
    return (await this.repo.findBy({ classId, endedAt: IsNull() })).map(toEnrollment);
  }

  async findAllOpen() {
    return (await this.repo.findBy({ endedAt: IsNull() })).map(toEnrollment);
  }

  async countOpenByClass(classIds: string[]) {
    if (!classIds.length) return new Map<string, number>();
    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e.classId', 'classId')
      .addSelect('COUNT(*)', 'count')
      .where('e.classId IN (:...classIds)', { classIds })
      .andWhere('e.endedAt IS NULL')
      .groupBy('e.classId')
      .getRawMany<{ classId: string; count: string }>();
    return new Map(rows.map((r) => [r.classId, Number(r.count)]));
  }

  async save(e: Enrollment) {
    await this.repo.save({ studentId: e.studentId, classId: e.classId, enrolledAt: e.enrolledAt, endedAt: e.endedAt });
  }

  async deleteByStudent(studentId: string) {
    await this.repo.delete({ studentId });
  }

  async deleteByClass(classId: string) {
    await this.repo.delete({ classId });
  }
}

function toEnrollment(row: EnrollmentOrmEntity): Enrollment {
  return Enrollment.rehydrate(row.studentId, row.classId, row.enrolledAt, row.endedAt);
}


@Entity('membership_requests')
@Index(['classId', 'status'])
@Index(['studentId', 'createdAt'])
export class MembershipRequestOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 8 }) kind: string;
  @Column({ type: 'varchar', length: 12 }) status: string;
  @Column('uuid') studentId: string;
  @Column('uuid') classId: string;
  @Column('text', { nullable: true }) message: string | null;
  @Column('timestamptz') createdAt: Date;
  @Column('timestamptz', { nullable: true }) decidedAt: Date | null;
  @Column('uuid', { nullable: true }) decidedById: string | null;
}

@Injectable()
export class TypeOrmMembershipRequestRepository extends MembershipRequestRepository {
  constructor(@InjectRepository(MembershipRequestOrmEntity) private readonly repo: Repository<MembershipRequestOrmEntity>) {
    super();
  }

  async findById(id: string) {
    const row = await this.repo.findOneBy({ id });
    return row ? toRequest(row) : null;
  }

  async findPending(studentId: string, classId: string, kind: MembershipRequestKind) {
    const row = await this.repo.findOneBy({ studentId, classId, kind, status: 'PENDING' });
    return row ? toRequest(row) : null;
  }

  async findPendingByClass(classId: string) {
    return (await this.repo.find({ where: { classId, status: 'PENDING' }, order: { createdAt: 'ASC' } })).map(toRequest);
  }

  async findByStudent(studentId: string, limit: number) {
    return (await this.repo.find({ where: { studentId }, order: { createdAt: 'DESC' }, take: limit })).map(toRequest);
  }

  async countPendingByClass(classIds: string[]) {
    if (!classIds.length) return new Map<string, number>();
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.classId', 'classId')
      .addSelect('COUNT(*)', 'count')
      .where('r.classId IN (:...classIds)', { classIds })
      .andWhere("r.status = 'PENDING'")
      .groupBy('r.classId')
      .getRawMany<{ classId: string; count: string }>();
    return new Map(rows.map((r) => [r.classId, Number(r.count)]));
  }

  async save(r: MembershipRequest) {
    await this.repo.save({ id: r.id, ...r.snapshot });
  }

  async deleteByStudent(studentId: string) {
    await this.repo.delete({ studentId });
  }

  async deleteByClass(classId: string) {
    await this.repo.delete({ classId });
  }
}

function toRequest(row: MembershipRequestOrmEntity): MembershipRequest {
  return MembershipRequest.rehydrate(row.id, {
    kind: row.kind as MembershipRequestKind,
    status: row.status as MembershipRequestStatus,
    studentId: row.studentId,
    classId: row.classId,
    message: row.message,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decidedById: row.decidedById,
  });
}
