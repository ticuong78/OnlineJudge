import { Injectable } from '@nestjs/common';
import type { AiPlan } from '@oj/contracts';
import { AiAccess } from '../../../shared/application/ai-access.js';
import { aiFromOrganizations, membershipViewsOf } from '../application/organization-memberships.js';
import { OrganizationRepository } from '../domain/organization.repository.js';
import { UserRepository } from '../domain/user.repository.js';

/**
 * AI access read from the account itself (administrators and VIP teachers) and from its organizations
 * (active, with AI included). Looked up on every call, so an expiry or an upgrade applies at once.
 */
@Injectable()
export class UserAiAccess extends AiAccess {
  constructor(
    private readonly users: UserRepository,
    private readonly organizations: OrganizationRepository,
  ) {
    super();
  }

  async plan(userId: string): Promise<AiPlan> {
    const user = await this.users.findById(userId);
    if (!user) return 'NONE';
    // Organizations are only looked up for a regular teacher: they can raise FREE to PLUS, nothing else.
    if (user.aiPlan() !== 'FREE') return user.aiPlan();
    return user.aiPlan(aiFromOrganizations(await membershipViewsOf(this.organizations, userId)));
  }
}
