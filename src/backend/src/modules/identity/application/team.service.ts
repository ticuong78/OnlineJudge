import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthResponse,
  InvitationDto,
  InvitationPreviewDto,
  InviteTeacherRequest,
  UserDto,
} from '@oj/contracts';
import { EventPublisher } from '../../../shared/application/event-publisher.js';
import { DomainError } from '../../../shared/domain/domain-error.js';
import {
  MEMBER_LEFT_ORGANIZATION,
  USER_DELETED,
  type MemberLeftOrganizationEvent,
  type UserDeletedEvent,
} from '../identity.events.js';
import { OrganizationMember } from '../domain/organization.js';
import { OrganizationRepository } from '../domain/organization.repository.js';
import { DisplayName, Email, Phone, User } from '../domain/user.js';
import { UserRepository, VerificationRepository } from '../domain/user.repository.js';
import { Verification } from '../domain/verification.js';
import { toUserDto, validatePassword } from './account.service.js';
import { OneTimeCodes } from './one-time-codes.js';
import { membershipViews, membershipViewsOf } from './organization-memberships.js';
import { IdentityMailer, PasswordHasher, TokenService } from './ports.js';

/** Admin use cases: the user list and teacher invitations (teacher accepts and sets their own password). */
@Injectable()
export class TeamService {
  private readonly frontendUrl: string;

  constructor(
    private readonly users: UserRepository,
    private readonly verifications: VerificationRepository,
    private readonly codes: OneTimeCodes,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly mailer: IdentityMailer,
    private readonly events: EventPublisher,
    config: ConfigService,
    private readonly organizations: OrganizationRepository,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  async listUsers(): Promise<UserDto[]> {
    const users = await this.users.findAll();
    const views = await membershipViews(this.organizations, users.filter((u) => u.role === 'TEACHER').map((u) => u.id));
    return users.map((u) => toUserDto(u, views.get(u.id) ?? []));
  }

  /** Upgrades a teacher to VIP (AI features) or back to a regular account. */
  async setVip(id: string, vip: boolean): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw DomainError.notFound('identity.user_not_found', 'Không tìm thấy người dùng.');
    user.setVip(vip);
    await this.users.save(user);
    return toUserDto(user, await membershipViewsOf(this.organizations, user.id));
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.users.findById(id);
    if (!user) throw DomainError.notFound('identity.user_not_found', 'Không tìm thấy người dùng.');
    user.ensureDeletable();
    const leaving = user.role === 'TEACHER' ? await this.organizationsToLeave(id) : [];
    await this.users.delete(id);
    await this.leaveOrganizations(id, leaving);
    const event: UserDeletedEvent = { name: USER_DELETED, occurredAt: new Date(), userId: id, role: user.role };
    await this.events.publish([event]);
  }

  /**
   * A deleted teacher leaves every organization the normal way (OJ-8 review M1): seats are freed, the organization
   * keeps its classes and copies of the problems shared with it (successor: the longest-standing other org admin).
   * Refused while they are the only org admin of an organization, which would otherwise be left without one.
   */
  private async organizationsToLeave(userId: string): Promise<{ organizationId: string; successorId: string | null }[]> {
    const leaving: { organizationId: string; successorId: string | null }[] = [];
    for (const m of await this.organizations.membershipsOfUser(userId)) {
      const otherAdmins = (await this.organizations.members(m.organizationId)).filter((x) => x.isAdmin && x.userId !== userId);
      if (m.isAdmin && !otherAdmins.length) {
        const org = await this.organizations.findById(m.organizationId);
        throw DomainError.conflict('organization.last_admin',
          `Giáo viên này là quản lý duy nhất của tổ chức ${org?.name ?? ''}. Hãy chỉ định quản lý khác trước khi xóa tài khoản.`);
      }
      leaving.push({ organizationId: m.organizationId, successorId: otherAdmins[0]?.userId ?? null });
    }
    return leaving;
  }

  private async leaveOrganizations(userId: string, leaving: { organizationId: string; successorId: string | null }[]) {
    const now = new Date();
    for (const invitation of await this.organizations.pendingInvitationsForUser(userId, now)) {
      invitation.cancel();
      await this.organizations.saveInvitation(invitation);
    }
    for (const { organizationId, successorId } of leaving) {
      await this.organizations.removeMember(organizationId, userId);
      if (!successorId) continue;
      const successor = await this.users.findById(successorId);
      const event: MemberLeftOrganizationEvent = {
        name: MEMBER_LEFT_ORGANIZATION,
        occurredAt: now,
        userId,
        organizationId,
        successorId,
        successorName: successor?.displayName ?? 'Quản lý tổ chức',
      };
      await this.events.publish([event]);
    }
  }

  // ---------- Invitations ----------

  async invite(input: InviteTeacherRequest): Promise<InvitationDto> {
    return toInvitationDto(await this.issueTeacherInvitation(input));
  }

  /**
   * Creates and emails a teacher invitation (account creation by code). `organizationInvitationId`: sent on behalf
   * of an organization, so accepting it also joins that organization (OJ-8).
   */
  async issueTeacherInvitation(input: InviteTeacherRequest, organizationInvitationId?: string): Promise<Verification> {
    const email = Email.of(input.email);
    const displayName = DisplayName.of(input.displayName);
    const phone = Phone.optional(input.phone);
    if (await this.users.findByEmail(email)) {
      throw DomainError.conflict('identity.email_taken', 'Email này đã có tài khoản.');
    }
    if (await this.verifications.findOpen(email, 'INVITE_TEACHER')) {
      throw DomainError.conflict('identity.already_invited', 'Đã có lời mời cho email này. Hãy dùng "Gửi lại lời mời".');
    }
    const { code, hash } = await this.codes.generate();
    const payload = { displayName: displayName.value, phone: phone?.value ?? null, ...(organizationInvitationId ? { organizationInvitationId } : {}) };
    const invitation = Verification.issue('INVITE_TEACHER', email, payload, hash);
    await this.verifications.save(invitation);
    await this.send(invitation, code);
    return invitation;
  }

  async listInvitations(): Promise<InvitationDto[]> {
    return (await this.verifications.findOpenByPurpose('INVITE_TEACHER')).map(toInvitationDto);
  }

  async resendInvitation(id: string): Promise<InvitationDto> {
    const invitation = await this.loadInvitation(id);
    const { code, hash } = await this.codes.generate();
    const sentBefore = invitation.snapshot.lastSentAt;
    invitation.reissue(hash);
    if (!(await this.verifications.saveReissued(invitation, sentBefore))) {
      // Accepted or resent since it was loaded: report the current state instead of reopening it.
      (await this.loadInvitation(id)).reissue(hash);
      throw DomainError.conflict('identity.resend_too_soon', 'Lời mời vừa được gửi lại. Vui lòng đợi 1 phút rồi thử lại.');
    }
    await this.send(invitation, code);
    return toInvitationDto(invitation);
  }

  async cancelInvitation(id: string): Promise<void> {
    const invitation = await this.loadInvitation(id);
    await this.verifications.delete(id);
    // Sent for an organization: its seat is freed too.
    const orgInvitationId = invitation.snapshot.payload.organizationInvitationId;
    const orgInvitation = orgInvitationId ? await this.organizations.findInvitation(orgInvitationId) : null;
    if (orgInvitation) {
      orgInvitation.cancel();
      await this.organizations.saveInvitation(orgInvitation);
    }
  }

  async previewInvitation(id: string): Promise<InvitationPreviewDto> {
    const invitation = await this.loadInvitation(id);
    if (!invitation.isUsable()) {
      throw DomainError.validation('identity.invitation_expired', 'Lời mời đã hết hạn hoặc đã được dùng. Hãy nhờ quản trị viên gửi lại.');
    }
    const s = invitation.snapshot;
    return { email: s.email.value, displayName: s.payload.displayName ?? '', expiresAt: s.expiresAt.toISOString() };
  }

  async acceptInvitation(id: string, code: string, password: string): Promise<AuthResponse> {
    validatePassword(password);
    const invitation = await this.loadInvitation(id);
    await this.codes.check(invitation, code);

    const { email, payload } = invitation.snapshot;
    if (await this.users.findByEmail(email)) {
      throw DomainError.conflict('identity.email_taken', 'Email này đã có tài khoản. Hãy đăng nhập.');
    }
    // Sent for an organization: it must still be pending and the organization active, before any account exists.
    const orgInvitation = payload.organizationInvitationId ? await this.organizations.findInvitation(payload.organizationInvitationId) : null;
    if (payload.organizationInvitationId) {
      if (!orgInvitation) throw DomainError.conflict('organization.invitation_closed', 'Lời mời vào tổ chức đã bị hủy.');
      orgInvitation.ensurePending();
      const org = await this.organizations.findById(orgInvitation.organizationId);
      if (!org) throw DomainError.conflict('organization.invitation_closed', 'Tổ chức không còn tồn tại.');
      org.ensureActive();
    }
    const user = User.acceptTeacherInvitation({
      email,
      displayName: DisplayName.of(payload.displayName ?? ''),
      phone: Phone.optional(payload.phone),
      passwordHash: await this.hasher.hash(password),
    });
    await this.users.save(user);
    if (orgInvitation) {
      // The seat was reserved by the invitation; false only if it was cancelled in the last moment.
      await this.organizations.acceptInvitation(orgInvitation, OrganizationMember.join(orgInvitation.organizationId, user.id, 'TEACHER'));
    }
    const accessToken = await this.tokens.issue(user);
    return { accessToken, user: toUserDto(user, await membershipViewsOf(this.organizations, user.id)) };
  }

  private async loadInvitation(id: string): Promise<Verification> {
    const invitation = await this.verifications.findById(id);
    if (!invitation || invitation.snapshot.purpose !== 'INVITE_TEACHER') {
      throw DomainError.notFound('identity.invitation_not_found', 'Không tìm thấy lời mời.');
    }
    return invitation;
  }

  private send(invitation: Verification, code: string) {
    const s = invitation.snapshot;
    // The code goes in the fragment, which browsers never send to a server, so it stays out of access logs (audit R4-N3).
    const url = `${this.frontendUrl}/invite?id=${invitation.id}#c=${code}`;
    return this.mailer.sendTeacherInvitation(s.email.value, s.payload.displayName ?? '', url, code, s.expiresAt);
  }
}

function toInvitationDto(v: Verification): InvitationDto {
  const s = v.snapshot;
  return {
    id: v.id,
    email: s.email.value,
    displayName: s.payload.displayName ?? '',
    phone: s.payload.phone ?? null,
    expiresAt: s.expiresAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}
