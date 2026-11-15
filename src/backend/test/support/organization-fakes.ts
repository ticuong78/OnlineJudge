import { Organization, OrganizationInvitation, OrganizationMember } from '../../src/modules/identity/domain/organization.js';
import { OrganizationRepository, type SeatReservation } from '../../src/modules/identity/domain/organization.repository.js';

/** In-memory OrganizationRepository with the same seat rule as the TypeORM one (single-threaded, so atomic). */
export class MemoryOrganizations extends OrganizationRepository {
  readonly orgs = new Map<string, Organization>();
  readonly memberList: OrganizationMember[] = [];
  readonly invitations = new Map<string, OrganizationInvitation>();

  async findById(id: string) { return this.orgs.get(id) ?? null; }
  async findByIds(ids: string[]) { return ids.map((id) => this.orgs.get(id)).filter((o): o is Organization => !!o); }
  async findAll() { return [...this.orgs.values()]; }
  async save(o: Organization) { this.orgs.set(o.id, o); }

  async members(organizationId: string) { return this.memberList.filter((m) => m.organizationId === organizationId); }
  async membershipsOfUser(userId: string) { return this.memberList.filter((m) => m.userId === userId); }
  async membershipsOfUsers(userIds: string[]) { return this.memberList.filter((m) => userIds.includes(m.userId)); }
  async findMember(organizationId: string, userId: string) {
    return this.memberList.find((m) => m.organizationId === organizationId && m.userId === userId) ?? null;
  }
  async saveMember(member: OrganizationMember) {
    const existing = await this.findMember(member.organizationId, member.userId);
    if (existing) existing.role = member.role;
  }
  async removeMember(organizationId: string, userId: string) {
    const i = this.memberList.findIndex((m) => m.organizationId === organizationId && m.userId === userId);
    if (i >= 0) this.memberList.splice(i, 1);
  }

  async seatsUsed(organizationIds: string[], now: Date) {
    return new Map(organizationIds.map((id) => [id, this.used(id, now)]));
  }

  async findInvitation(id: string) { return this.invitations.get(id) ?? null; }
  async pendingInvitations(organizationId: string, now: Date) {
    return [...this.invitations.values()].filter((i) => i.organizationId === organizationId && i.isPending(now));
  }
  async pendingInvitationsForUser(userId: string, now: Date) {
    return [...this.invitations.values()].filter((i) => i.snapshot.userId === userId && i.isPending(now));
  }
  async saveInvitation(invitation: OrganizationInvitation) { this.invitations.set(invitation.id, invitation); }

  async reserveSeat(
    organizationId: string,
    entry: { invitation: OrganizationInvitation } | { member: OrganizationMember },
    now: Date,
  ): Promise<SeatReservation> {
    const org = this.orgs.get(organizationId);
    if (!org || this.used(organizationId, now) >= org.seats) return 'NO_SEATS';
    if ('invitation' in entry) this.invitations.set(entry.invitation.id, entry.invitation);
    else this.memberList.push(entry.member);
    return 'RESERVED';
  }

  async acceptInvitation(invitation: OrganizationInvitation, member: OrganizationMember) {
    const stored = this.invitations.get(invitation.id);
    if (!stored || stored.snapshot.status !== 'PENDING') return false;
    stored.accept(new Date(0)); // status change only: expiry is the service's check
    if (!(await this.findMember(member.organizationId, member.userId))) this.memberList.push(member);
    return true;
  }

  private used(organizationId: string, now: Date): number {
    return this.memberList.filter((m) => m.organizationId === organizationId).length
      + [...this.invitations.values()].filter((i) => i.organizationId === organizationId && i.isPending(now)).length;
  }
}
