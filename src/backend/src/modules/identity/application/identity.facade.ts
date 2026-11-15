import { Injectable } from '@nestjs/common';
import type { RegisterRequest, Role, VerificationTicketDto } from '@oj/contracts';
import { Email } from '../domain/user.js';
import { UserRepository } from '../domain/user.repository.js';
import { OrganizationRepository } from '../domain/organization.repository.js';
import { AccountService } from './account.service.js';

export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: Role;
}

/** Published interface of the Identity context (open host service). */
@Injectable()
export class IdentityFacade {
  constructor(
    private readonly users: UserRepository,
    private readonly accounts: AccountService,
    private readonly organizations: OrganizationRepository,
  ) {}

  /** organizationId -> name (OJ-8). */
  async organizationNames(ids: string[]): Promise<Map<string, string>> {
    return new Map((await this.organizations.findByIds(ids)).map((o) => [o.id, o.name]));
  }

  async isOrganizationMember(userId: string, organizationId: string): Promise<boolean> {
    return !!(await this.organizations.findMember(organizationId, userId));
  }

  async getUsers(ids: string[]): Promise<Map<string, UserSummary>> {
    return new Map((await this.users.findByIds([...new Set(ids)])).map((u) => [u.id, summary(u)]));
  }

  async listByRole(role: Role): Promise<UserSummary[]> {
    return (await this.users.findByRole(role)).map(summary);
  }

  async findByEmail(email: string): Promise<UserSummary | null> {
    let address: Email;
    try {
      address = Email.of(email);
    } catch {
      return null;
    }
    const user = await this.users.findByEmail(address);
    return user ? summary(user) : null;
  }

  /** Starts student sign-up, optionally with a class (already resolved from its code) to ask to join. */
  requestStudentRegistration(input: Omit<RegisterRequest, 'classCode'>, classId: string | null): Promise<VerificationTicketDto> {
    return this.accounts.requestRegistration(input, classId);
  }
}

function summary(u: { id: string; displayName: string; email: { value: string }; phone: { value: string } | null; role: Role }): UserSummary {
  return { id: u.id, displayName: u.displayName, email: u.email.value, phone: u.phone?.value ?? null, role: u.role };
}
