import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AddOrganizationMemberRequest,
  CreateOrganizationRequest,
  InviteToOrganizationRequest,
  OrganizationDetailDto,
  OrganizationDto,
  OrganizationInvitationDto,
  OrganizationMemberDto,
  OrganizationRole,
  UpsertOrganizationRequest,
} from '@oj/contracts';
import { isOrgAdmin, type Actor } from '../../../shared/application/actor.js';
import { EventPublisher } from '../../../shared/application/event-publisher.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { MEMBER_LEFT_ORGANIZATION, type MemberLeftOrganizationEvent } from '../identity.events.js';
import { Organization, OrganizationInvitation, OrganizationMember } from '../domain/organization.js';
import { OrganizationRepository } from '../domain/organization.repository.js';
import { DisplayName, Email, type User } from '../domain/user.js';
import { UserRepository, VerificationRepository } from '../domain/user.repository.js';
import { IdentityMailer } from './ports.js';
import { TeamService } from './team.service.js';

/**
 * Organization plan (OJ-8): the administrator creates organizations; their org admins invite and remove teachers
 * within the seats. A teacher may belong to several organizations. Every organization id that comes from a request
 * is checked against the actor's own memberships (`actor.organizations`), never trusted.
 */
@Injectable()
export class OrganizationService {
  private readonly frontendUrl: string;

  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly users: UserRepository,
    private readonly verifications: VerificationRepository,
    private readonly team: TeamService,
    private readonly mailer: IdentityMailer,
    private readonly events: EventPublisher,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  // ---------- Queries ----------

  /** Administrator: every organization. Teacher: their own organizations. */
  async list(actor: Actor): Promise<OrganizationDto[]> {
    if (actor.role === 'ADMIN') return this.toDtos(await this.organizations.findAll(), actor);
    const ids = (actor.organizations ?? []).map((o) => o.id);
    return this.toDtos(await this.organizations.findByIds(ids), actor);
  }

  /** Members see the organization and its members; invitations only for its org admins and the administrator. */
  async detail(actor: Actor, id: string): Promise<OrganizationDetailDto> {
    const org = await this.loadVisible(actor, id);
    const now = new Date();
    const manager = this.canManage(actor, id);
    const [base] = await this.toDtos([org], actor, now);
    const members = await this.organizations.members(id);
    const invitations = manager ? await this.organizations.pendingInvitations(id, now) : [];
    const people = await this.people([...members.map((m) => m.userId), ...invitations.map((i) => i.snapshot.invitedById)]);
    return {
      ...base,
      members: members
        .filter((m) => people.has(m.userId))
        .map((m) => toMemberDto(m, people.get(m.userId)!))
        .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName, 'vi') : a.role === 'ADMIN' ? -1 : 1)),
      invitations: invitations.map((i) => toInvitationDto(i, org, people.get(i.snapshot.invitedById))),
    };
  }

  /** Pending invitations addressed to the signed-in teacher's existing account. */
  async myInvitations(actor: Actor): Promise<OrganizationInvitationDto[]> {
    if (actor.role !== 'TEACHER') return [];
    const invitations = await this.organizations.pendingInvitationsForUser(actor.id, new Date());
    const orgs = new Map((await this.organizations.findByIds(invitations.map((i) => i.organizationId))).map((o) => [o.id, o]));
    const people = await this.people(invitations.map((i) => i.snapshot.invitedById));
    return invitations
      .filter((i) => orgs.has(i.organizationId))
      .map((i) => toInvitationDto(i, orgs.get(i.organizationId)!, people.get(i.snapshot.invitedById)));
  }

  // ---------- Administrator ----------

  async create(actor: Actor, input: CreateOrganizationRequest): Promise<OrganizationDetailDto> {
    ensureSystemAdmin(actor);
    const admin = await this.loadTeacher(input.adminUserId);
    const org = Organization.create(input);
    await this.organizations.save(org);
    await this.organizations.reserveSeat(org.id, { member: OrganizationMember.join(org.id, admin.id, 'ADMIN') }, new Date());
    return this.detail(actor, org.id);
  }

  async update(actor: Actor, id: string, input: UpsertOrganizationRequest): Promise<OrganizationDetailDto> {
    ensureSystemAdmin(actor);
    const org = await this.load(id);
    const used = (await this.organizations.seatsUsed([id], new Date())).get(id) ?? 0;
    org.revise(input, used);
    await this.organizations.save(org);
    return this.detail(actor, id);
  }

  /** Administrator only: an existing teacher joins directly (no acceptance step), within the seats. */
  async addMember(actor: Actor, id: string, input: AddOrganizationMemberRequest): Promise<OrganizationDetailDto> {
    ensureSystemAdmin(actor);
    const org = await this.load(id);
    org.ensureActive();
    const teacher = await this.loadTeacher(input.userId);
    if (await this.organizations.findMember(id, teacher.id)) throw alreadyMember(teacher.displayName, org.name);
    // A pending invitation for the same teacher would hold a second seat and, once accepted, could not change the
    // role given here; it is withdrawn first.
    for (const pending of await this.organizations.pendingInvitations(id, new Date())) {
      if (pending.snapshot.userId === teacher.id || pending.snapshot.email.value === teacher.email.value) {
        pending.cancel();
        await this.organizations.saveInvitation(pending);
      }
    }
    const reserved = await this.organizations.reserveSeat(id, { member: OrganizationMember.join(id, teacher.id, input.role) }, new Date());
    if (reserved === 'NO_SEATS') throw noSeats(org);
    return this.detail(actor, id);
  }

  // ---------- Org admin ----------

  /**
   * Invites a teacher by email. An existing teacher account accepts on its home page; a new email gets the teacher
   * invitation (email + code) that creates the account and joins the organization. Either way a seat is held
   * until the invitation is accepted, declined, cancelled or expires.
   */
  async invite(actor: Actor, id: string, input: InviteToOrganizationRequest): Promise<OrganizationInvitationDto> {
    const org = await this.loadManaged(actor, id);
    const now = new Date();
    org.ensureActive(now);
    const email = Email.of(input.email);
    const existing = await this.users.findByEmail(email);
    if (existing && existing.role !== 'TEACHER') {
      throw DomainError.conflict('organization.not_a_teacher', 'Email này thuộc tài khoản học sinh hoặc quản trị viên, không mời vào tổ chức được.');
    }
    if (existing && (await this.organizations.findMember(id, existing.id))) throw alreadyMember(existing.displayName, org.name);
    if ((await this.organizations.pendingInvitations(id, now)).some((i) => i.snapshot.email.value === email.value)) {
      throw DomainError.conflict('organization.already_invited', 'Đã có lời mời đang chờ cho email này.');
    }
    const displayName = existing ? existing.displayName : DisplayName.of(input.displayName).value;
    const invitation = OrganizationInvitation.issue(
      { organizationId: id, email, displayName, userId: existing?.id ?? null, invitedById: actor.id },
      now,
    );
    if ((await this.organizations.reserveSeat(id, { invitation }, now)) === 'NO_SEATS') throw noSeats(org);

    try {
      if (existing) {
        await this.mailer.sendOrganizationInvitation(email.value, displayName, org.name, `${this.frontendUrl}/`, invitation.snapshot.expiresAt);
      } else {
        const verification = await this.team.issueTeacherInvitation({ email: email.value, displayName, phone: null }, invitation.id);
        invitation.linkVerification(verification.id);
        await this.organizations.saveInvitation(invitation);
      }
    } catch (error) {
      // No email went out: give the seat back, and withdraw an account invitation that may have been saved before
      // the email failed (it would otherwise block this address with an invitation that can never be accepted).
      invitation.cancel();
      await this.organizations.saveInvitation(invitation);
      const orphan = await this.verifications.findOpen(email, 'INVITE_TEACHER');
      if (orphan?.snapshot.payload.organizationInvitationId === invitation.id) await this.verifications.delete(orphan.id);
      throw error;
    }
    return toInvitationDto(invitation, org, (await this.people([actor.id])).get(actor.id));
  }

  async cancelInvitation(actor: Actor, id: string, invitationId: string): Promise<void> {
    await this.loadManaged(actor, id);
    const invitation = await this.organizations.findInvitation(invitationId);
    if (!invitation || invitation.organizationId !== id) throw invitationNotFound();
    invitation.cancel();
    await this.organizations.saveInvitation(invitation);
    const verificationId = invitation.snapshot.verificationId;
    if (verificationId) await this.verifications.delete(verificationId);
  }

  /** Org admins promote or demote members; an organization always keeps at least one org admin. */
  async setRole(actor: Actor, id: string, userId: string, role: OrganizationRole): Promise<OrganizationDetailDto> {
    await this.loadManaged(actor, id);
    const member = await this.organizations.findMember(id, userId);
    if (!member) throw memberNotFound();
    if (member.isAdmin && role !== 'ADMIN') await this.ensureAnotherAdmin(id, userId);
    member.role = role;
    await this.organizations.saveMember(member);
    return this.detail(actor, id);
  }

  /**
   * An org admin (or the administrator) removes a teacher, or a teacher leaves on their own. The organization keeps
   * its classes and copies of the problems shared with it; they go to `successor` (see MemberLeftOrganizationEvent).
   */
  async removeMember(actor: Actor, id: string, userId: string): Promise<void> {
    const leaving = actor.id === userId;
    const org = leaving ? await this.loadVisible(actor, id) : await this.loadManaged(actor, id);
    const member = await this.organizations.findMember(id, userId);
    if (!member) throw memberNotFound();
    const members = await this.organizations.members(id);
    const otherAdmins = members.filter((m) => m.isAdmin && m.userId !== userId);
    if (member.isAdmin && !otherAdmins.length) {
      throw DomainError.conflict('organization.last_admin',
        `Tổ chức ${org.name} cần ít nhất một quản lý. Hãy chỉ định quản lý khác trước.`);
    }
    // The org admin who removes the teacher takes over; otherwise the longest-standing other org admin.
    const successorId = !leaving && isOrgAdmin(actor, id) ? actor.id : otherAdmins[0]?.userId;
    if (!successorId) throw DomainError.conflict('organization.last_admin', `Tổ chức ${org.name} chưa có quản lý nào khác.`);
    const successor = (await this.people([successorId])).get(successorId);

    await this.organizations.removeMember(id, userId);
    const event: MemberLeftOrganizationEvent = {
      name: MEMBER_LEFT_ORGANIZATION,
      occurredAt: new Date(),
      userId,
      organizationId: id,
      successorId,
      successorName: successor?.displayName ?? 'Quản lý tổ chức',
    };
    await this.events.publish([event]);
  }

  // ---------- Invited teacher ----------

  async accept(actor: Actor, invitationId: string): Promise<OrganizationDto> {
    const invitation = await this.loadMyInvitation(actor, invitationId);
    const org = await this.load(invitation.organizationId);
    org.ensureActive();
    invitation.ensurePending();
    const joined = await this.organizations.acceptInvitation(invitation, OrganizationMember.join(org.id, actor.id, 'TEACHER'));
    if (!joined) throw DomainError.conflict('organization.invitation_closed', 'Lời mời đã hết hạn, đã được dùng hoặc đã bị hủy.');
    return (await this.toDtos([org], { ...actor, organizations: [...(actor.organizations ?? []), { id: org.id, role: 'TEACHER' }] }))[0];
  }

  async decline(actor: Actor, invitationId: string): Promise<void> {
    const invitation = await this.loadMyInvitation(actor, invitationId);
    invitation.decline();
    await this.organizations.saveInvitation(invitation);
  }

  // ---------- Helpers ----------

  private canManage(actor: Actor, id: string): boolean {
    return actor.role === 'ADMIN' || isOrgAdmin(actor, id);
  }

  private async load(id: string): Promise<Organization> {
    const org = await this.organizations.findById(id);
    if (!org) throw notFound();
    return org;
  }

  /** The administrator and members of the organization; anyone else gets "not found". */
  private async loadVisible(actor: Actor, id: string): Promise<Organization> {
    const visible = actor.role === 'ADMIN' || !!actor.organizations?.some((o) => o.id === id);
    if (!visible) throw notFound();
    return this.load(id);
  }

  private async loadManaged(actor: Actor, id: string): Promise<Organization> {
    const org = await this.loadVisible(actor, id);
    if (!this.canManage(actor, id)) {
      throw DomainError.forbidden('organization.not_admin', 'Chỉ quản lý của tổ chức được thao tác này.');
    }
    return org;
  }

  private async loadMyInvitation(actor: Actor, invitationId: string): Promise<OrganizationInvitation> {
    const invitation = await this.organizations.findInvitation(invitationId);
    if (!invitation || invitation.snapshot.userId !== actor.id) throw invitationNotFound();
    return invitation;
  }

  private async loadTeacher(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user || user.role !== 'TEACHER') {
      throw DomainError.validation('organization.not_a_teacher', 'Chỉ tài khoản giáo viên mới tham gia tổ chức được.');
    }
    return user;
  }

  private async ensureAnotherAdmin(id: string, userId: string) {
    const admins = (await this.organizations.members(id)).filter((m) => m.isAdmin && m.userId !== userId);
    if (!admins.length) {
      throw DomainError.conflict('organization.last_admin', 'Tổ chức cần ít nhất một quản lý. Hãy chỉ định quản lý khác trước.');
    }
  }

  private async people(ids: string[]): Promise<Map<string, User>> {
    const users = await this.users.findByIds([...new Set(ids)]);
    return new Map(users.map((u) => [u.id, u]));
  }

  private async toDtos(orgs: Organization[], actor: Actor, now = new Date()): Promise<OrganizationDto[]> {
    const ids = orgs.map((o) => o.id);
    const used = await this.organizations.seatsUsed(ids, now);
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (await this.organizations.members(id)).length);
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      seats: o.seats,
      seatsUsed: used.get(o.id) ?? 0,
      memberCount: counts.get(o.id) ?? 0,
      activeUntil: o.activeUntil,
      active: o.isActive(now),
      aiIncluded: o.aiIncluded,
      createdAt: o.createdAt.toISOString(),
      myRole: actor.organizations?.find((m) => m.id === o.id)?.role ?? null,
    }));
  }
}

function toMemberDto(m: OrganizationMember, user: User): OrganizationMemberDto {
  return { userId: m.userId, displayName: user.displayName, email: user.email.value, role: m.role, joinedAt: m.joinedAt.toISOString() };
}

function toInvitationDto(i: OrganizationInvitation, org: Organization, invitedBy: User | undefined): OrganizationInvitationDto {
  const s = i.snapshot;
  return {
    id: i.id,
    organizationId: org.id,
    organizationName: org.name,
    email: s.email.value,
    displayName: s.displayName,
    forExistingAccount: s.userId !== null,
    status: s.status,
    invitedByName: invitedBy?.displayName ?? '(không rõ)',
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  };
}

function ensureSystemAdmin(actor: Actor) {
  if (actor.role !== 'ADMIN') throw DomainError.forbidden('organization.admin_only', 'Chỉ quản trị viên hệ thống được thao tác này.');
}

const notFound = () => DomainError.notFound('organization.not_found', 'Không tìm thấy tổ chức.');
const memberNotFound = () => DomainError.notFound('organization.member_not_found', 'Giáo viên này không ở trong tổ chức.');
const invitationNotFound = () => DomainError.notFound('organization.invitation_not_found', 'Không tìm thấy lời mời.');
const alreadyMember = (name: string, org: string) =>
  DomainError.conflict('organization.already_member', `${name} đã ở trong tổ chức ${org}.`);
const noSeats = (org: Organization) =>
  DomainError.conflict('organization.no_seats', `Tổ chức ${org.name} đã dùng hết ${org.seats} chỗ giáo viên. Hãy liên hệ quản trị viên để thêm chỗ.`);
