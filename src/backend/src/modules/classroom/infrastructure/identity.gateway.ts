import { Injectable } from '@nestjs/common';
import type { RegisterRequest, Role } from '@oj/contracts';
import { IdentityFacade } from '../../identity/application/identity.facade.js';
import { PeopleDirectory } from '../application/ports.js';

@Injectable()
export class IdentityPeopleDirectory extends PeopleDirectory {
  constructor(private readonly identity: IdentityFacade) {
    super();
  }

  getPeople(ids: string[]) {
    return this.identity.getUsers(ids);
  }

  listByRole(role: Role) {
    return this.identity.listByRole(role);
  }

  findByEmail(email: string) {
    return this.identity.findByEmail(email);
  }

  organizationNames(ids: string[]) {
    return this.identity.organizationNames(ids);
  }

  isOrganizationMember(userId: string, organizationId: string) {
    return this.identity.isOrganizationMember(userId, organizationId);
  }

  startStudentRegistration(input: Omit<RegisterRequest, 'classCode'>, classId: string | null) {
    return this.identity.requestStudentRegistration(input, classId);
  }
}
