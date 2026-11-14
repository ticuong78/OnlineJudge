import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Actor } from '../src/shared/application/actor.js';
import type { DomainError } from '../src/shared/domain/domain-error.js';
import { OneTimeCodes } from '../src/modules/identity/application/one-time-codes.js';
import { actorOrganizations } from '../src/modules/identity/application/organization-memberships.js';
import { OrganizationService } from '../src/modules/identity/application/organization.service.js';
import { TeamService } from '../src/modules/identity/application/team.service.js';
import { Organization, PlanEndDate } from '../src/modules/identity/domain/organization.js';
import { DisplayName, Email, User } from '../src/modules/identity/domain/user.js';
import { MEMBER_LEFT_ORGANIZATION, type MemberLeftOrganizationEvent } from '../src/modules/identity/identity.events.js';
import { JwtTokenService } from '../src/modules/identity/infrastructure/security.js';
import { UserAiAccess } from '../src/modules/identity/infrastructure/user-ai-access.js';
import { FakeHasher, FakeMailer, MemoryUsers, MemoryVerifications, RecordingEvents } from './support/identity-fakes.js';
import { MemoryOrganizations } from './support/organization-fakes.js';

const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;
const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e: DomainError) => e.code);
const ADMIN: Actor = { id: 'sys-admin', role: 'ADMIN', name: 'Quản trị viên' };
const FAR = '2099-12-31';

function setup() {
  const users = new MemoryUsers();
  const verifications = new MemoryVerifications();
  const hasher = new FakeHasher();
  const mailer = new FakeMailer();
  const events = new RecordingEvents();
  const orgs = new MemoryOrganizations();
  const tokens = new JwtTokenService(new JwtService({ secret: 's3cret-'.repeat(8), signOptions: { expiresIn: '7d' } }));
  const team = new TeamService(users, verifications, new OneTimeCodes(hasher, verifications), hasher, tokens, mailer, events, config, orgs);
  const service = new OrganizationService(orgs, users, verifications, team, mailer, events, config);
  const ai = new UserAiAccess(users, orgs);

  async function teacher(email: string, name: string, vip = false) {
    const user = User.acceptTeacherInvitation({ email: Email.of(email), displayName: DisplayName.of(name), phone: null, passwordHash: 'x' });
    if (vip) user.setVip(true);
    await users.save(user);
    return user;
  }
  async function student(email: string) {
    const user = User.registerStudent({ email: Email.of(email), displayName: DisplayName.of('Hoc Sinh'), phone: null, passwordHash: 'x' });
    await users.save(user);
    return user;
  }
  /** The actor as the authenticator builds it: memberships loaded from the repository. */
  async function actor(user: User): Promise<Actor> {
    return { id: user.id, role: user.role, name: user.displayName, organizations: await actorOrganizations(orgs, user.id) };
  }
  async function organization(adminUser: User, seats = 3, activeUntil = FAR, aiIncluded = true) {
    return service.create(ADMIN, { name: 'Trung tâm Tin học A', seats, activeUntil, aiIncluded, adminUserId: adminUser.id });
  }
  return { users, verifications, mailer, events, orgs, team, service, ai, teacher, student, actor, organization };
}

test('plan end date: inclusive last day in Vietnam time, impossible dates refused', () => {
  const end = PlanEndDate.of('2026-11-20');
  assert.equal(end.includes(new Date('2026-11-20T16:59:59Z')), true, '23:59:59 in Hanoi on the last day');
  assert.equal(end.includes(new Date('2026-11-20T17:00:00Z')), false, 'midnight in Hanoi the next day');
  for (const bad of ['2026-02-30', '20-11-2026', '2026-13-01', '']) {
    assert.throws(() => PlanEndDate.of(bad), (e: DomainError) => e.code === 'organization.invalid_date', bad);
  }
});

test('organization terms: seats 1..1000 and never below what is in use', () => {
  const org = Organization.create({ name: 'THPT Chuyên', seats: 5, activeUntil: FAR, aiIncluded: false });
  assert.throws(() => org.revise({ name: 'THPT Chuyên', seats: 2, activeUntil: FAR, aiIncluded: false }, 3),
    (e: DomainError) => e.code === 'organization.seats_in_use');
  org.revise({ name: 'THPT Chuyên', seats: 3, activeUntil: FAR, aiIncluded: true }, 3);
  assert.equal(org.seats, 3);
  assert.throws(() => Organization.create({ name: 'X', seats: 5, activeUntil: FAR, aiIncluded: false }), (e: DomainError) => e.code === 'organization.invalid_name');
  assert.throws(() => Organization.create({ name: 'Ok tên', seats: 0, activeUntil: FAR, aiIncluded: false }), (e: DomainError) => e.code === 'organization.invalid_seats');
});

test('seats: members plus pending invitations; the last free seat goes once, cancelling frees it', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const org = await t.organization(lan, 2);
  const admin = await t.actor(lan);
  assert.equal(org.seatsUsed, 1, 'the org admin takes a seat');

  const first = await t.service.invite(admin, org.id, { email: 'moi1@truong.vn', displayName: 'Giáo Viên Một' });
  assert.equal(first.forExistingAccount, false);
  assert.equal(t.mailer.sent.at(-1)?.kind, 'invitation', 'a new email gets the account invitation with a code');
  assert.equal(await outcome(t.service.invite(admin, org.id, { email: 'moi2@truong.vn', displayName: 'Giáo Viên Hai' })), 'organization.no_seats');

  await t.service.cancelInvitation(admin, org.id, first.id);
  assert.equal(t.verifications.rows.size, 0, 'the account invitation is withdrawn with it');
  assert.equal(await outcome(t.service.invite(admin, org.id, { email: 'moi2@truong.vn', displayName: 'Giáo Viên Hai' })), 'ok');
  assert.equal(await outcome(t.service.update(ADMIN, org.id, { name: org.name, seats: 1, activeUntil: FAR, aiIncluded: true })), 'organization.seats_in_use');
});

test('a new teacher accepting the emailed invitation joins the organization', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const org = await t.organization(lan);
  await t.service.invite(await t.actor(lan), org.id, { email: 'minh@truong.vn', displayName: 'Trần Minh' });
  const mail = t.mailer.sent.at(-1)!;
  const verificationId = new URL(mail.url!).searchParams.get('id')!;

  const res = await t.team.acceptInvitation(verificationId, mail.code, 'mat-khau-moi');
  assert.equal(res.user.role, 'TEACHER');
  assert.deepEqual(res.user.organizations.map((o) => [o.organizationName, o.role]), [['Trung tâm Tin học A', 'TEACHER']]);
  assert.equal(res.user.canUseAi, true, 'AI comes with the active organization');
  const detail = await t.service.detail(ADMIN, org.id);
  assert.equal(detail.memberCount, 2);
  assert.equal(detail.seatsUsed, 2, 'the reserved seat became the membership');
  assert.equal(detail.invitations.length, 0);
});

test('an existing teacher accepts or declines on their home page; students and members are refused', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const hoa = await t.teacher('hoa@truong.vn', 'Lê Hoa');
  await t.student('hs@truong.vn');
  const org = await t.organization(lan);
  const admin = await t.actor(lan);

  const invitation = await t.service.invite(admin, org.id, { email: 'minh@truong.vn', displayName: 'ignored' });
  assert.equal(invitation.forExistingAccount, true);
  assert.equal(invitation.displayName, 'Trần Minh', 'the account name is used, not the typed one');
  assert.equal(t.mailer.sent.at(-1)?.kind, 'organization-invitation', 'a notice without any code');
  assert.equal((await t.service.myInvitations(await t.actor(minh))).length, 1);
  assert.equal(await outcome(t.service.accept(await t.actor(hoa), invitation.id)), 'organization.invitation_not_found', 'only the addressee');

  await t.service.accept(await t.actor(minh), invitation.id);
  assert.deepEqual((await t.actor(minh)).organizations, [{ id: org.id, role: 'TEACHER' }]);
  assert.equal(await outcome(t.service.invite(admin, org.id, { email: 'minh@truong.vn', displayName: 'x x' })), 'organization.already_member');
  assert.equal(await outcome(t.service.invite(admin, org.id, { email: 'hs@truong.vn', displayName: 'x x' })), 'organization.not_a_teacher');

  const second = await t.service.invite(admin, org.id, { email: 'hoa@truong.vn', displayName: 'x x' });
  await t.service.decline(await t.actor(hoa), second.id);
  assert.equal((await t.service.detail(ADMIN, org.id)).seatsUsed, 2, 'declining frees the seat');
});

test('a teacher can belong to several organizations, with a different role in each', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const a = await t.organization(lan);
  const b = await t.service.create(ADMIN, { name: 'THPT Chuyên B', seats: 5, activeUntil: FAR, aiIncluded: false, adminUserId: minh.id });
  await t.service.addMember(ADMIN, a.id, { userId: minh.id, role: 'TEACHER' });
  const minhActor = await t.actor(minh);
  assert.deepEqual(new Set(minhActor.organizations!.map((o) => `${o.id}:${o.role}`)), new Set([`${a.id}:TEACHER`, `${b.id}:ADMIN`]));
  assert.deepEqual((await t.service.list(minhActor)).map((o) => o.name).sort(), ['THPT Chuyên B', 'Trung tâm Tin học A']);
});

test('only org admins manage; others get forbidden, outsiders get not found', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const outsider = await t.teacher('ngoai@truong.vn', 'Người Ngoài');
  const org = await t.organization(lan);
  await t.service.addMember(ADMIN, org.id, { userId: minh.id, role: 'TEACHER' });

  assert.equal(await outcome(t.service.invite(await t.actor(minh), org.id, { email: 'x@truong.vn', displayName: 'x x' })), 'organization.not_admin');
  assert.equal((await t.service.detail(await t.actor(minh), org.id)).invitations.length, 0, 'members do not see invitations');
  assert.equal(await outcome(t.service.detail(await t.actor(outsider), org.id)), 'organization.not_found');
  assert.equal(await outcome(t.service.removeMember(await t.actor(outsider), org.id, minh.id)), 'organization.not_found');
  assert.equal(await outcome(t.service.addMember(await t.actor(lan), org.id, { userId: outsider.id, role: 'TEACHER' })), 'organization.admin_only');
});

test('an organization always keeps an org admin', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const org = await t.organization(lan);
  await t.service.addMember(ADMIN, org.id, { userId: minh.id, role: 'TEACHER' });
  const admin = await t.actor(lan);
  assert.equal(await outcome(t.service.removeMember(admin, org.id, lan.id)), 'organization.last_admin');
  assert.equal(await outcome(t.service.setRole(admin, org.id, lan.id, 'TEACHER')), 'organization.last_admin');
  await t.service.setRole(admin, org.id, minh.id, 'ADMIN');
  assert.equal(await outcome(t.service.removeMember(await t.actor(lan), org.id, lan.id)), 'ok', 'with another org admin, leaving works');
});

test('leaving: the remover takes over; on leaving alone, the longest-standing other org admin', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const hoa = await t.teacher('hoa@truong.vn', 'Lê Hoa');
  const org = await t.organization(lan, 5);
  await t.service.addMember(ADMIN, org.id, { userId: minh.id, role: 'ADMIN' });
  await t.service.addMember(ADMIN, org.id, { userId: hoa.id, role: 'TEACHER' });

  await t.service.removeMember(await t.actor(minh), org.id, hoa.id);
  let event = t.events.published.at(-1) as MemberLeftOrganizationEvent;
  assert.equal(event.name, MEMBER_LEFT_ORGANIZATION);
  assert.deepEqual([event.userId, event.successorId, event.successorName], [hoa.id, minh.id, 'Trần Minh']);
  assert.equal((await t.service.detail(ADMIN, org.id)).seatsUsed, 2, 'seat freed');

  await t.service.removeMember(await t.actor(minh), org.id, minh.id);
  event = t.events.published.at(-1) as MemberLeftOrganizationEvent;
  assert.deepEqual([event.userId, event.successorId], [minh.id, lan.id], 'Lan joined first');
});

test('AI: VIP, or an active organization that includes AI; expiry turns it off and blocks new invitations', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const vip = await t.teacher('vip@truong.vn', 'Giáo Viên VIP', true);
  assert.equal(await t.ai.allows(minh.id), false);
  assert.equal(await t.ai.allows(vip.id), true);

  const org = await t.organization(lan, 5, FAR, true);
  await t.service.addMember(ADMIN, org.id, { userId: minh.id, role: 'TEACHER' });
  assert.equal(await t.ai.allows(minh.id), true);

  await t.service.update(ADMIN, org.id, { name: org.name, seats: 5, activeUntil: FAR, aiIncluded: false });
  assert.equal(await t.ai.allows(minh.id), false, 'AI not included');

  await t.service.update(ADMIN, org.id, { name: org.name, seats: 5, activeUntil: '2020-01-31', aiIncluded: true });
  assert.equal(await t.ai.allows(minh.id), false, 'expired');
  assert.equal(await outcome(t.service.invite(await t.actor(lan), org.id, { email: 'x@truong.vn', displayName: 'x x' })), 'organization.inactive');
  assert.equal((await t.service.detail(ADMIN, org.id)).memberCount, 2, 'nothing is removed on expiry');
});

// ---------------------------------------------------------------- security review fixes (OJ-8 review)

test('deleting a teacher leaves their organizations: seat freed, successor named; the only org admin cannot be deleted (M1)', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const org = await t.organization(lan, 3);
  await t.service.addMember(ADMIN, org.id, { userId: minh.id, role: 'TEACHER' });

  assert.equal(await outcome(t.team.deleteUser(lan.id)), 'organization.last_admin');
  assert.ok(await t.users.findById(lan.id), 'nothing deleted');

  await t.team.deleteUser(minh.id);
  assert.equal((await t.service.detail(ADMIN, org.id)).seatsUsed, 1, 'seat freed');
  const left = t.events.published.find((e) => e.name === MEMBER_LEFT_ORGANIZATION) as MemberLeftOrganizationEvent;
  assert.deepEqual([left.userId, left.successorId], [minh.id, lan.id], 'the organization keeps its classes and problem copies');
});

test('adding a teacher directly withdraws their pending invitation, so no seat is held twice (L2)', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const minh = await t.teacher('minh@truong.vn', 'Trần Minh');
  const org = await t.organization(lan, 3);
  const invitation = await t.service.invite(await t.actor(lan), org.id, { email: 'minh@truong.vn', displayName: 'x x' });
  await t.service.addMember(ADMIN, org.id, { userId: minh.id, role: 'ADMIN' });
  assert.equal((await t.service.detail(ADMIN, org.id)).seatsUsed, 2);
  assert.equal(await outcome(t.service.accept(await t.actor(minh), invitation.id)), 'organization.invitation_closed');
  assert.deepEqual((await t.actor(minh)).organizations, [{ id: org.id, role: 'ADMIN' }], 'the role given by the administrator stays');
});

test('if the invitation email fails, the seat and the address are freed (L4)', async () => {
  const t = setup();
  const lan = await t.teacher('lan@truong.vn', 'Nguyễn Lan');
  const org = await t.organization(lan, 2);
  const send = t.mailer.sendTeacherInvitation;
  t.mailer.sendTeacherInvitation = async () => { throw new Error('SMTP down'); };
  await assert.rejects(t.service.invite(await t.actor(lan), org.id, { email: 'moi@truong.vn', displayName: 'Giáo Viên Mới' }));
  assert.equal(t.verifications.rows.size, 0, 'no account invitation left behind');
  assert.equal((await t.service.detail(ADMIN, org.id)).seatsUsed, 1);
  t.mailer.sendTeacherInvitation = send;
  assert.equal(await outcome(t.service.invite(await t.actor(lan), org.id, { email: 'moi@truong.vn', displayName: 'Giáo Viên Mới' })), 'ok', 'the address can be invited again');
});
