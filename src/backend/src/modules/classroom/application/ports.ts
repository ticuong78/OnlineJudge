import type { RegisterRequest, Role, VerificationTicketDto } from '@oj/contracts';

export interface Person {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: Role;
}

/** Port (ACL) towards the Identity context. */
export abstract class PeopleDirectory {
  abstract getPeople(ids: string[]): Promise<Map<string, Person>>;
  abstract listByRole(role: Role): Promise<Person[]>;
  abstract findByEmail(email: string): Promise<Person | null>;
  /** organizationId -> name (OJ-8). */
  abstract organizationNames(ids: string[]): Promise<Map<string, string>>;
  /** Whether the user is a member (any role) of the organization. */
  abstract isOrganizationMember(userId: string, organizationId: string): Promise<boolean>;
  abstract startStudentRegistration(input: Omit<RegisterRequest, 'classCode'>, classId: string | null): Promise<VerificationTicketDto>;
}
