import type { Organization, OrganizationInvitation, OrganizationMember } from './organization.js';

/** What a seat reservation found: room for one more, or every seat taken. */
export type SeatReservation = 'RESERVED' | 'NO_SEATS';

export abstract class OrganizationRepository {
  abstract findById(id: string): Promise<Organization | null>;
  abstract findByIds(ids: string[]): Promise<Organization[]>;
  abstract findAll(): Promise<Organization[]>;
  abstract save(organization: Organization): Promise<void>;

  abstract members(organizationId: string): Promise<OrganizationMember[]>;
  abstract membershipsOfUser(userId: string): Promise<OrganizationMember[]>;
  abstract membershipsOfUsers(userIds: string[]): Promise<OrganizationMember[]>;
  abstract findMember(organizationId: string, userId: string): Promise<OrganizationMember | null>;
  /** Role change of an existing member. */
  abstract saveMember(member: OrganizationMember): Promise<void>;
  abstract removeMember(organizationId: string, userId: string): Promise<void>;

  /** Members plus pending, unexpired invitations. */
  abstract seatsUsed(organizationIds: string[], now: Date): Promise<Map<string, number>>;

  abstract findInvitation(id: string): Promise<OrganizationInvitation | null>;
  abstract pendingInvitations(organizationId: string, now: Date): Promise<OrganizationInvitation[]>;
  abstract pendingInvitationsForUser(userId: string, now: Date): Promise<OrganizationInvitation[]>;
  /** Status or verification link change of an existing invitation. */
  abstract saveInvitation(invitation: OrganizationInvitation): Promise<void>;

  /**
   * Checks that a seat is free and inserts the invitation or the member in one transaction, with the organization
   * locked, so parallel requests can never book more seats than the organization has.
   */
  abstract reserveSeat(
    organizationId: string,
    entry: { invitation: OrganizationInvitation } | { member: OrganizationMember },
    now: Date,
  ): Promise<SeatReservation>;

  /**
   * Turns a pending invitation into a membership in one transaction (its seat carries over).
   * False when the invitation was no longer pending (accepted, declined or cancelled in the meantime).
   */
  abstract acceptInvitation(invitation: OrganizationInvitation, member: OrganizationMember): Promise<boolean>;
}
