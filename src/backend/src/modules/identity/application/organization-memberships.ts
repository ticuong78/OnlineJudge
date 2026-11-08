import type { OrganizationMembershipDto } from '@oj/contracts';
import type { ActorOrganization } from '../../../shared/application/actor.js';
import { OrganizationRepository } from '../domain/organization.repository.js';

/** The organizations of each user, as shown on their account (UserDto) and used for the AI rule. */
export async function membershipViews(
  organizations: OrganizationRepository,
  userIds: string[],
  now = new Date(),
): Promise<Map<string, OrganizationMembershipDto[]>> {
  const views = new Map<string, OrganizationMembershipDto[]>(userIds.map((id) => [id, []]));
  const members = await organizations.membershipsOfUsers(userIds);
  if (!members.length) return views;
  const orgs = new Map((await organizations.findByIds(members.map((m) => m.organizationId))).map((o) => [o.id, o]));
  for (const m of members) {
    const org = orgs.get(m.organizationId);
    if (!org) continue;
    views.get(m.userId)?.push({
      organizationId: org.id,
      organizationName: org.name,
      role: m.role,
      active: org.isActive(now),
      aiIncluded: org.aiIncluded,
    });
  }
  return views;
}

export async function membershipViewsOf(organizations: OrganizationRepository, userId: string, now = new Date()) {
  return (await membershipViews(organizations, [userId], now)).get(userId) ?? [];
}

/** AI comes with an organization while it is active and includes AI. */
export const aiFromOrganizations = (views: OrganizationMembershipDto[]): boolean =>
  views.some((v) => v.active && v.aiIncluded);

export async function actorOrganizations(organizations: OrganizationRepository, userId: string): Promise<ActorOrganization[]> {
  return (await organizations.membershipsOfUser(userId)).map((m) => ({ id: m.organizationId, role: m.role }));
}
