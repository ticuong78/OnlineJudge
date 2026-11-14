import type { OrganizationRole, Role } from '@oj/contracts';

/** One of the actor's organizations (OJ-8). */
export interface ActorOrganization {
  id: string;
  role: OrganizationRole;
}

/** The authenticated user performing a use case. */
export interface Actor {
  id: string;
  role: Role;
  name: string;
  /** Teachers: the organizations they belong to, loaded with the account on every request. Absent = none. */
  organizations?: readonly ActorOrganization[];
}

export const isStaff = (actor: Actor): boolean => actor.role === 'ADMIN' || actor.role === 'TEACHER';

/** The actor is a member (any role) of the organization. */
export const isOrgMember = (actor: Actor, organizationId: string | null | undefined): boolean =>
  !!organizationId && !!actor.organizations?.some((o) => o.id === organizationId);

/** The actor is an org admin of the organization. */
export const isOrgAdmin = (actor: Actor, organizationId: string | null | undefined): boolean =>
  !!organizationId && !!actor.organizations?.some((o) => o.id === organizationId && o.role === 'ADMIN');
