import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import type { EventPublisher } from '../src/shared/application/event-publisher.js';
import { ClassroomFacade } from '../src/modules/classroom/application/classroom.facade.js';
import { ClassroomService } from '../src/modules/classroom/application/classroom.service.js';
import { PeopleDirectory, type Person } from '../src/modules/classroom/application/ports.js';
import { ClassCode, Classroom } from '../src/modules/classroom/domain/classroom.js';
import type { ClassroomRepository, EnrollmentRepository, MembershipRequestRepository } from '../src/modules/classroom/domain/classroom.repository.js';
import { ProblemService } from '../src/modules/catalog/application/problem.service.js';
import { UnshareChecks } from '../src/modules/catalog/application/unshare-checks.js';
import { Problem, ResourceLimits, Sharing } from '../src/modules/catalog/domain/problem.js';
import type { ProblemQueries, ProblemRepository } from '../src/modules/catalog/domain/problem.repository.js';
import { MEMBER_LEFT_ORGANIZATION, type MemberLeftOrganizationEvent } from '../src/modules/identity/identity.events.js';

const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

// Lan: org admin of A. Minh: teacher in A and org admin of B. Hoa: teacher in A. Tu: independent. An: student.
const lan: Actor = { id: 'lan', role: 'TEACHER', name: 'Lan', organizations: [{ id: ORG_A, role: 'ADMIN' }] };
const minh: Actor = { id: 'minh', role: 'TEACHER', name: 'Minh', organizations: [{ id: ORG_A, role: 'TEACHER' }, { id: ORG_B, role: 'ADMIN' }] };
const hoa: Actor = { id: 'hoa', role: 'TEACHER', name: 'Hoa', organizations: [{ id: ORG_A, role: 'TEACHER' }] };
const tu: Actor = { id: 'tu', role: 'TEACHER', name: 'Tu' };
const an: Actor = { id: 'an', role: 'STUDENT', name: 'An', organizations: [{ id: ORG_A, role: 'TEACHER' }] }; // forged: students never match
const admin: Actor = { id: 'admin', role: 'ADMIN', name: 'Admin' };
const membersOf: Record<string, string[]> = { [ORG_A]: ['lan', 'minh', 'hoa'], [ORG_B]: ['minh'] };

// ---------------------------------------------------------------- classes

class MemoryClasses {
  readonly rows = new Map<string, Classroom>();
  async findById(id: string) { return this.rows.get(id) ?? null; }
  async findByIds(ids: string[]) { return ids.map((id) => this.rows.get(id)).filter((c): c is Classroom => !!c); }
  async findByCode(code: ClassCode) { return [...this.rows.values()].find((c) => c.code.value === code.value) ?? null; }
  async findAll() { return [...this.rows.values()]; }
  async findByTeacher(teacherId: string) { return [...this.rows.values()].filter((c) => c.teacherId === teacherId); }
  async findByOrganizations(ids: string[]) { return [...this.rows.values()].filter((c) => c.organizationId && ids.includes(c.organizationId)); }
  async findDueForPurge() { return []; }
  async save(c: Classroom) { this.rows.set(c.id, c); }
  async delete(id: string) { this.rows.delete(id); }
}

class People extends PeopleDirectory {
  async getPeople(ids: string[]) {
    return new Map(ids.map((id): [string, Person] => [id, { id, displayName: id, email: `${id}@truong.vn`, phone: null, role: id === 'an' ? 'STUDENT' : 'TEACHER' }]));
  }
  async listByRole() { return []; }
  async findByEmail() { return null; }
  async startStudentRegistration(): Promise<never> { throw new Error('unused'); }
  async organizationNames(ids: string[]) { return new Map(ids.map((id) => [id, id === ORG_A ? 'Trung tâm A' : 'Trường B'])); }
  async isOrganizationMember(userId: string, organizationId: string) { return membersOf[organizationId]?.includes(userId) ?? false; }
}

function classroomSetup() {
  const classes = new MemoryClasses();
  const enrollments = { countOpenByClass: async () => new Map(), findOpenByClass: async () => [] } as unknown as EnrollmentRepository;
  const requests = { countPendingByClass: async () => new Map() } as unknown as MembershipRequestRepository;
  const people = new People();
  const service = new ClassroomService(classes as unknown as ClassroomRepository, enrollments, requests, people, {} as EventPublisher);
  const facade = new ClassroomFacade(classes as unknown as ClassroomRepository, enrollments, people);
  const open = (name: string, teacherId: string, organizationId: string | null) => {
    const c = Classroom.open(name, ClassCode.of(name.replace(/\s/g, '').slice(0, 10).padEnd(4, 'X')), teacherId, organizationId);
    classes.rows.set(c.id, c);
    return c;
  };
  return { classes, service, facade, open };
}

test('org admins manage every class of their organization, and only of their organization', () => {
  const { open } = classroomSetup();
  const ofA = open('Lop A1', 'hoa', ORG_A);
  const ofB = open('Lop B1', 'minh', ORG_B);
  const personal = open('Lop rieng', 'hoa', null);

  assert.equal(ofA.isManagedBy(lan), true, 'org admin of A');
  assert.equal(ofA.isManagedBy(hoa), true, 'its teacher');
  assert.equal(ofA.isManagedBy(minh), false, 'a plain member of A is not a manager');
  assert.equal(ofB.isManagedBy(lan), false, 'org admin of A, not of B');
  assert.equal(personal.isManagedBy(lan), false, "a member's personal class stays private");
  assert.equal(ofB.isManagedBy(admin), true);
});

test('managed class ids (used by sessions, results, judging, integrity, board) include the organization classes', async () => {
  const { open, facade } = classroomSetup();
  const ofA = open('Lop A1', 'hoa', ORG_A);
  const ofB = open('Lop B1', 'minh', ORG_B);
  open('Lop rieng', 'hoa', null);
  assert.deepEqual(new Set(await facade.managedClassIds(lan)), new Set([ofA.id]));
  assert.deepEqual(new Set(await facade.managedClassIds(minh)), new Set([ofB.id]), 'Minh teaches B1 and is org admin of B, not of A');
  assert.equal(await facade.canManage(lan, ofB.id), false);
});

test('classes are created in, and moved into, organizations the teacher belongs to only', async () => {
  const { service, classes, open } = classroomSetup();
  const created = await service.create(hoa, { name: 'Lop A2', code: 'A2-TIN', organizationId: ORG_A });
  assert.deepEqual(created.organization, { id: ORG_A, name: 'Trung tâm A' });
  assert.equal(await outcome(service.create(hoa, { name: 'Lop B2', code: 'B2-TIN', organizationId: ORG_B })), 'classroom.not_in_organization');
  assert.equal(await outcome(service.create(tu, { name: 'Lop T', code: 'T1-TIN', organizationId: ORG_A })), 'classroom.not_in_organization');

  const personal = open('Lop rieng', 'hoa', null);
  assert.equal(await outcome(service.moveToOrganization(lan, personal.id, ORG_A)), 'classroom.not_teacher', 'only its teacher moves it');
  assert.equal(await outcome(service.moveToOrganization(hoa, personal.id, ORG_B)), 'classroom.not_in_organization');
  await service.moveToOrganization(hoa, personal.id, ORG_A);
  assert.equal(classes.rows.get(personal.id)!.organizationId, ORG_A);
  assert.equal(await outcome(service.moveToOrganization(hoa, personal.id, ORG_A)), 'classroom.already_in_organization', 'one way');
});

test('org admins hand organization classes to its members only; others cannot reassign', async () => {
  const { service, open } = classroomSetup();
  const ofA = open('Lop A1', 'hoa', ORG_A);
  const update = (actor: Actor, teacherId: string) => service.update(actor, ofA.id, { name: 'Lop A1', code: ofA.code.value, teacherId });
  assert.equal(await outcome(update(lan, 'tu')), 'classroom.teacher_not_in_organization');
  assert.equal(await outcome(update(hoa, 'minh')), 'classroom.only_admin_reassigns', 'the class teacher is not an org admin');
  assert.equal(await outcome(update(lan, 'minh')), 'ok');
  assert.equal((await service.organizationClasses(lan, ORG_A)).length, 1);
  assert.equal(await outcome(service.organizationClasses(hoa, ORG_A)), 'classroom.not_org_admin');
});

test("leaving: the organization's classes go to the successor; personal and other organizations' classes stay", async () => {
  const { service, classes, open } = classroomSetup();
  const ofA = open('Lop A1', 'minh', ORG_A);
  const ofB = open('Lop B1', 'minh', ORG_B);
  const personal = open('Lop rieng', 'minh', null);
  const event: MemberLeftOrganizationEvent = {
    name: MEMBER_LEFT_ORGANIZATION, occurredAt: new Date(), userId: 'minh', organizationId: ORG_A, successorId: 'lan', successorName: 'Lan',
  };
  await service.onMemberLeftOrganization(event);
  assert.equal(classes.rows.get(ofA.id)!.teacherId, 'lan');
  assert.equal(classes.rows.get(ofB.id)!.teacherId, 'minh');
  assert.equal(classes.rows.get(personal.id)!.teacherId, 'minh');
});

// ---------------------------------------------------------------- problems

let seq = 1;
function problem(owner: Actor, sharing = Sharing.private): Problem {
  const p = Problem.create(seq++, { id: owner.id, name: owner.name }, {
    title: 'Tổng', difficulty: 'EASY', tags: [], statement: 'Tính a + b.', inputFormat: 'a b', outputFormat: 'a + b', constraints: '',
  }, ResourceLimits.default);
  p.addTestCase({ input: '1 2\n', expectedOutput: '3\n', isSample: true, points: 1 });
  p.addTestCase({ input: '5 5\n', expectedOutput: '10\n', isSample: false, points: 1 });
  p.share(sharing);
  return p;
}

function catalogSetup(problems: Problem[]) {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const repo = {
    findById: async (id: string) => byId.get(id) ?? null,
    findByOwnerSharedWith: async (owner: string, org: string) =>
      [...byId.values()].filter((p) => p.owner.id === owner && p.sharing.organizationIds.includes(org)),
    nextSeq: async () => seq++,
    save: async (p: Problem) => void byId.set(p.id, p),
  } as unknown as ProblemRepository;
  const service = new ProblemService(repo, {} as ProblemQueries, {} as EventPublisher, {} as never, {} as never, {} as never, new UnshareChecks());
  return { service, byId };
}

test('organization sharing: colleagues see the whole problem; other organizations, outsiders and students do not', () => {
  const p = problem(hoa, Sharing.of(false, false, false, [ORG_A]));
  for (const colleague of [lan, minh]) {
    assert.equal(p.canView(colleague), true);
    assert.equal(p.canSeeHiddenTests(colleague), true);
    assert.equal(p.canSeeSolution(colleague), true);
    assert.equal(p.canEdit(colleague), false, 'colleagues read and copy, the owner edits');
  }
  assert.equal(p.canView(tu), false);
  assert.equal(p.canView(an), false, 'a student never sees blueprints, whatever the actor claims');
  assert.equal(problem(minh, Sharing.of(false, false, false, [ORG_B])).canView(lan), false);

  const copy = p.copyFor(lan, seq++);
  assert.equal(copy.testCases.length, 2, 'a colleague copies the hidden tests too');
  assert.deepEqual(copy.sharing.organizationIds, [], 'copies start private');
});

test('a teacher shares only with organizations they belong to', async () => {
  const p = problem(hoa);
  const { service } = catalogSetup([p]);
  const share = (actor: Actor, organizationIds: string[]) =>
    service.share(actor, p.id, { isPublic: false, publicTests: false, publicSolution: false, organizationIds });
  assert.equal(await outcome(share(hoa, [ORG_B])), 'catalog.not_in_organization');
  assert.equal(await outcome(share(hoa, [ORG_A])), 'ok');
  assert.deepEqual(p.sharing.organizationIds, [ORG_A]);
});

test('leaving: the teacher keeps their problems, unshared from that organization; the successor gets full copies', async () => {
  const shared = problem(minh, Sharing.of(true, false, false, [ORG_A, ORG_B]));
  const privateOne = problem(minh);
  const { service, byId } = catalogSetup([shared, privateOne]);
  await service.onMemberLeftOrganization({
    name: MEMBER_LEFT_ORGANIZATION, occurredAt: new Date(), userId: 'minh', organizationId: ORG_A, successorId: 'lan', successorName: 'Lan',
  });

  assert.deepEqual(shared.sharing.organizationIds, [ORG_B], 'still shared with B, and still public');
  assert.equal(shared.sharing.isPublic, true);
  assert.equal(shared.owner.id, 'minh');
  const copies = [...byId.values()].filter((p) => p.owner.id === 'lan');
  assert.equal(copies.length, 1, 'only the problem shared with A is copied');
  assert.equal(copies[0].copiedFrom?.id, shared.id);
  assert.equal(copies[0].testCases.length, 2, 'with hidden tests');
});

test('org admins archive and restore organization classes but cannot delete them for good', async () => {
  const { service, open } = classroomSetup();
  const ofA = open('Lop A1', 'hoa', ORG_A);
  await service.archive(lan, ofA.id);
  assert.equal(await outcome(service.scheduleDeletion(lan, ofA.id, 30)), 'classroom.only_teacher_deletes');
  assert.equal(await outcome(service.deleteNow(lan, ofA.id, 'Lop A1')), 'classroom.only_teacher_deletes');
  await service.restore(lan, ofA.id);
  await service.archive(hoa, ofA.id);
  assert.equal(await outcome(service.scheduleDeletion(hoa, ofA.id, 30)), 'ok', 'the class teacher still can');
  assert.equal(await outcome(service.cancelDeletion(lan, ofA.id)), 'ok', 'cancelling a scheduled deletion only protects data');
});
