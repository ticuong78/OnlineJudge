import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/application/actor.js';
import { OrganizationRepository } from '../domain/organization.repository.js';
import { UserRepository } from '../domain/user.repository.js';
import { actorOrganizations } from './organization-memberships.js';
import { TokenService } from './ports.js';

/**
 * Turns a bearer token into the CURRENT actor.
 *
 * A valid signature is not enough: the token must still match the account. A deleted user and a token issued
 * before the last password change are both refused, so a password reset really does end stolen sessions.
 * Role, name and organization memberships come from the account, not from the token, so they are never stale:
 * removing a teacher from an organization applies from their next request.
 */
@Injectable()
export class Authenticator {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  async authenticate(token: string): Promise<Actor | null> {
    const claims = await this.tokens.verify(token);
    if (!claims) return null;
    const user = await this.users.findById(claims.userId);
    if (!user || claims.credential !== this.tokens.credentialOf(user)) return null;
    const organizations = user.role === 'TEACHER' ? await actorOrganizations(this.organizations, user.id) : [];
    return { id: user.id, role: user.role, name: user.displayName, organizations };
  }
}
