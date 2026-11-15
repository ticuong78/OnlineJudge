import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { DataSource } from 'typeorm';
import { throwaway } from './support/throwaway.js';
import { Problem, ResourceLimits, Sharing } from '../src/modules/catalog/domain/problem.js';
import { ProblemOrmEntity, TestCaseOrmEntity } from '../src/modules/catalog/infrastructure/problem.orm-entities.js';
import { TypeOrmProblemQueries, TypeOrmProblemRepository } from '../src/modules/catalog/infrastructure/typeorm-problem.repository.js';
import { ClassCode, Classroom } from '../src/modules/classroom/domain/classroom.js';
import { ClassroomOrmEntity, TypeOrmClassroomRepository } from '../src/modules/classroom/infrastructure/classroom.persistence.js';
import { Organization, OrganizationInvitation, OrganizationMember } from '../src/modules/identity/domain/organization.js';
import { Email } from '../src/modules/identity/domain/user.js';
import {
  OrganizationInvitationOrmEntity,
  OrganizationMemberOrmEntity,
  OrganizationOrmEntity,
} from '../src/modules/identity/infrastructure/organization.orm-entity.js';
import { TypeOrmOrganizationRepository } from '../src/modules/identity/infrastructure/typeorm-organization.repository.js';
import { migratedOptions } from './support/migrated-schema.js';

/**
 * OJ-8 persistence on real PostgreSQL: the seat lock under parallel requests, the conditional accept, the
 * uuid[] sharing column and the queries built on it. The in-memory fakes used by the unit tests only model these.
 * Runs in a throwaway schema of TEST_DATABASE_URL on the throwaway stack (see test/support/throwaway.ts):
 *   pnpm infra:test:up   then   pnpm test:integration
 */
const { url, skip } = throwaway('TEST_DATABASE_URL');

describe('PostgreSQL: organizations (OJ-8)', { skip }, () => {
  const schema = `oj_test_${randomBytes(4).toString('hex')}`;
  let admin: DataSource;
  let ds: DataSource;
  let orgs: TypeOrmOrganizationRepository;
  let classes: TypeOrmClassroomRepository;
  let problems: TypeOrmProblemRepository;
  let queries: TypeOrmProblemQueries;

  before(async () => {
    admin = new DataSource({ type: 'postgres', url });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource(
      migratedOptions(
        url,
        schema,
        [OrganizationOrmEntity, OrganizationMemberOrmEntity, OrganizationInvitationOrmEntity, ClassroomOrmEntity, ProblemOrmEntity, TestCaseOrmEntity],
        { max: 20 },
      ),
    );
    await ds.initialize();
    orgs = new TypeOrmOrganizationRepository(ds);
    classes = new TypeOrmClassroomRepository(ds.getRepository(ClassroomOrmEntity));
    problems = new TypeOrmProblemRepository(ds);
    queries = new TypeOrmProblemQueries(ds);
  });

  after(async () => {
    await ds?.destroy();
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.destroy();
  });

  const newOrg = async (seats: number, activeUntil = '2099-12-31') => {
    const org = Organization.create({ name: `Tổ chức ${randomBytes(3).toString('hex')}`, seats, activeUntil, aiIncluded: true });
    await orgs.save(org);
    return org;
  };
  const invitation = (orgId: string, userId: string | null = null, now = new Date()) =>
    OrganizationInvitation.issue(
      { organizationId: orgId, email: Email.of(`gv-${randomBytes(4).toString('hex')}@truong.vn`), displayName: 'Giáo Viên', userId, invitedById: randomUUID() },
      now,
    );

  // ---------------------------------------------------------------- seats

  test('reserveSeat: 25 parallel invitations into 3 seats (1 taken) reserve exactly 2', async () => {
    const org = await newOrg(3);
    await orgs.reserveSeat(org.id, { member: OrganizationMember.join(org.id, randomUUID(), 'ADMIN') }, new Date());
    const results = await Promise.all(Array.from({ length: 25 }, () => orgs.reserveSeat(org.id, { invitation: invitation(org.id) }, new Date())));
    assert.equal(results.filter((r) => r === 'RESERVED').length, 2);
    assert.equal((await orgs.seatsUsed([org.id], new Date())).get(org.id), 3);
    assert.equal((await orgs.pendingInvitations(org.id, new Date())).length, 2);
  });

  test('reserveSeat: parallel members and invitations together never exceed the seats', async () => {
    const org = await newOrg(4);
    const entries = Array.from({ length: 30 }, (_, i) =>
      i % 2 ? { member: OrganizationMember.join(org.id, randomUUID(), 'TEACHER') } : { invitation: invitation(org.id) });
    const results = await Promise.all(entries.map((e) => orgs.reserveSeat(org.id, e, new Date())));
    assert.equal(results.filter((r) => r === 'RESERVED').length, 4);
    assert.equal((await orgs.seatsUsed([org.id], new Date())).get(org.id), 4);
  });

  test('seats used: cancelled, declined and expired invitations do not count', async () => {
    const org = await newOrg(10);
    const now = new Date();
    const cancelled = invitation(org.id);
    const declined = invitation(org.id, randomUUID());
    const old = invitation(org.id, null, new Date(now.getTime() - 8 * 24 * 3_600_000));
    const live = invitation(org.id);
    for (const i of [cancelled, declined, old, live]) await orgs.reserveSeat(org.id, { invitation: i }, new Date(0));
    cancelled.cancel();
    await orgs.saveInvitation(cancelled);
    declined.decline(now);
    await orgs.saveInvitation(declined);
    assert.equal((await orgs.seatsUsed([org.id], now)).get(org.id), 1, 'only the live one');
    assert.deepEqual((await orgs.pendingInvitations(org.id, now)).map((i) => i.id), [live.id]);
  });

  // ---------------------------------------------------------------- accepting

  test('acceptInvitation: of 10 parallel accepts of one invitation exactly one wins', async () => {
    const org = await newOrg(5);
    const userId = randomUUID();
    const inv = invitation(org.id, userId);
    await orgs.reserveSeat(org.id, { invitation: inv }, new Date());
    const results = await Promise.all(
      Array.from({ length: 10 }, () => orgs.acceptInvitation(inv, OrganizationMember.join(org.id, userId, 'TEACHER'))),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await orgs.members(org.id)).length, 1);
    assert.equal((await orgs.findInvitation(inv.id))!.snapshot.status, 'ACCEPTED');
    assert.equal((await orgs.seatsUsed([org.id], new Date())).get(org.id), 1, 'the seat carried over, not doubled');
  });

  test('acceptInvitation never overwrites an existing membership (review L2)', async () => {
    const org = await newOrg(5);
    const userId = randomUUID();
    await orgs.reserveSeat(org.id, { member: OrganizationMember.join(org.id, userId, 'ADMIN', new Date('2026-01-01')) }, new Date());
    const inv = invitation(org.id, userId);
    await orgs.reserveSeat(org.id, { invitation: inv }, new Date());
    assert.equal(await orgs.acceptInvitation(inv, OrganizationMember.join(org.id, userId, 'TEACHER')), true);
    const member = await orgs.findMember(org.id, userId);
    assert.equal(member!.role, 'ADMIN');
    assert.equal(member!.joinedAt.toISOString(), '2026-01-01T00:00:00.000Z');
  });

  test('memberships round-trip: several organizations per teacher, role change, removal', async () => {
    const [a, b] = [await newOrg(5), await newOrg(5)];
    const userId = randomUUID();
    await orgs.reserveSeat(a.id, { member: OrganizationMember.join(a.id, userId, 'TEACHER') }, new Date());
    await orgs.reserveSeat(b.id, { member: OrganizationMember.join(b.id, userId, 'ADMIN') }, new Date());
    assert.deepEqual(new Set((await orgs.membershipsOfUser(userId)).map((m) => `${m.organizationId}:${m.role}`)), new Set([`${a.id}:TEACHER`, `${b.id}:ADMIN`]));
    const m = (await orgs.findMember(a.id, userId))!;
    m.role = 'ADMIN';
    await orgs.saveMember(m);
    assert.equal((await orgs.findMember(a.id, userId))!.role, 'ADMIN');
    await orgs.removeMember(a.id, userId);
    assert.deepEqual((await orgs.membershipsOfUsers([userId])).map((x) => x.organizationId), [b.id]);
  });

  test('the plan end date survives the round trip', async () => {
    const org = await newOrg(1, '2026-11-20');
    const loaded = (await orgs.findById(org.id))!;
    assert.equal(loaded.activeUntil, '2026-11-20');
    assert.equal(loaded.isActive(new Date('2026-11-20T16:59:59Z')), true);
    assert.equal(loaded.isActive(new Date('2026-11-20T17:00:00Z')), false);
  });

  // ---------------------------------------------------------------- classes and problems

  test('classes: organization id round-trips and findByOrganizations returns only those classes', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const code = () => ClassCode.of(`T${randomBytes(4).toString('hex')}`);
    const inA = Classroom.open('Lớp A', code(), randomUUID(), a);
    const inB = Classroom.open('Lớp B', code(), randomUUID(), b);
    const personal = Classroom.open('Lớp riêng', code(), randomUUID(), null);
    for (const c of [inA, inB, personal]) await classes.save(c);
    assert.deepEqual((await classes.findByOrganizations([a])).map((c) => c.id), [inA.id]);
    assert.equal((await classes.findById(personal.id))!.organizationId, null);
    assert.deepEqual(await classes.findByOrganizations([]), []);
  });

  test('topics (OJ-20): the bank filter needs every chosen tag, and tag counts follow the scope', async () => {
    const owner = { id: randomUUID(), name: 'Minh' };
    const other = { id: randomUUID(), name: 'Lan' };
    const make = async (who: typeof owner, tags: string[]) => {
      const p = Problem.create(await problems.nextSeq(), who, {
        title: `Bài ${randomBytes(2).toString('hex')}`, difficulty: 'EASY', tags, statement: 's', inputFormat: 'i', outputFormat: 'o', constraints: '',
      }, ResourceLimits.default);
      await problems.save(p);
      return p;
    };
    const both = await make(owner, ['Mảng', 'Tổng tiền tố']);
    const arraysOnly = await make(owner, ['arrays']);
    await make(owner, ['quy hoạch động', 'mảng']);
    await make(other, ['arrays', 'dp']); // another teacher's private problem: never counted for `owner`

    const mine = async (tags: string[]) =>
      (await queries.list({ scope: 'mine', viewerId: owner.id, tags, page: 1, pageSize: 50 })).rows.map((r) => r.id);
    assert.deepEqual(await mine(['arrays', 'prefix-sums']), [both.id]);
    assert.equal((await mine(['arrays'])).length, 3);
    assert.ok((await mine(['arrays'])).includes(arraysOnly.id));
    assert.deepEqual(await queries.tagCounts({ scope: 'mine', viewerId: owner.id, organizationIds: [] }), [
      { tag: 'arrays', count: 3 },
      { tag: 'dp', count: 1 },
      { tag: 'prefix-sums', count: 1 },
    ]);
    assert.deepEqual(await queries.tagCounts({ scope: 'organization', viewerId: owner.id, organizationIds: [] }), []);
  });

  test('problems: organization sharing round-trips; the organization scope uses array overlap and is empty without organizations', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const owner = { id: randomUUID(), name: 'Minh' };
    const make = async (sharing: Sharing) => {
      const p = Problem.create(await problems.nextSeq(), owner, {
        title: `Bài ${randomBytes(2).toString('hex')}`, difficulty: 'EASY', tags: [], statement: 's', inputFormat: 'i', outputFormat: 'o', constraints: '',
      }, ResourceLimits.default);
      p.addTestCase({ input: '1\n', expectedOutput: '1\n', isSample: true, points: 1 });
      p.share(sharing);
      await problems.save(p);
      return p;
    };
    const both = await make(Sharing.of(false, false, false, [a, b]));
    const onlyB = await make(Sharing.of(true, false, false, [b]));
    await make(Sharing.private);

    assert.deepEqual([...(await problems.findById(both.id))!.sharing.organizationIds].sort(), [a, b].sort());
    const list = async (organizationIds: string[]) =>
      (await queries.list({ scope: 'organization', viewerId: randomUUID(), organizationIds, page: 1, pageSize: 50 })).rows.map((r) => r.id);
    assert.deepEqual(await list([a]), [both.id]);
    assert.deepEqual(new Set(await list([a, b])), new Set([both.id, onlyB.id]));
    assert.deepEqual(await list([]), [], 'no organizations, nothing listed');
    assert.deepEqual((await problems.findByOwnerSharedWith(owner.id, b)).map((p) => p.id).sort(), [both.id, onlyB.id].sort());

    both.share(both.sharing.withoutOrganization(a));
    await problems.save(both);
    assert.deepEqual(await list([a]), [], 'unsharing removes it from the organization scope');
  });
});
