import type { OrganizationInvitationStatus, OrganizationRole } from '@oj/contracts';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';
import type { Email } from './user.js';

export const MAX_SEATS = 1000;
/** Same lifetime as a teacher invitation (verification.ts). */
export const ORGANIZATION_INVITATION_TTL_MS = 7 * 24 * 60 * 60_000;

/**
 * The plan's last day, inclusive, in Vietnam time (UTC+7, no daylight saving): the organization is active until
 * the end of that day there, wherever the server runs.
 */
export class PlanEndDate {
  private constructor(readonly value: string, private readonly endsAt: number) {}

  static of(raw: string): PlanEndDate {
    const value = raw.trim();
    const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T23:59:59.999+07:00`) : NaN;
    // Date.parse accepts 2026-02-31 as March 3rd: the round trip catches impossible dates.
    const valid = Number.isFinite(endsAt) && new Date(endsAt + 7 * 3_600_000).toISOString().slice(0, 10) === value;
    assert(valid, 'organization.invalid_date', 'Ngày hết hạn không hợp lệ (định dạng YYYY-MM-DD).');
    return new PlanEndDate(value, endsAt);
  }

  includes(now: Date): boolean {
    return now.getTime() <= this.endsAt;
  }
}

export interface OrganizationTerms {
  name: string;
  seats: number;
  activeUntil: string;
  aiIncluded: boolean;
}

export interface OrganizationState {
  name: string;
  seats: number;
  activeUntil: PlanEndDate;
  aiIncluded: boolean;
  createdAt: Date;
}

/** A center or school on the organization plan: teacher seats, a plan end date and whether AI is included. */
export class Organization extends AggregateRoot {
  private constructor(id: string, private state: OrganizationState) {
    super(id);
  }

  static create(terms: OrganizationTerms, now = new Date()): Organization {
    return new Organization(newId(), { ...validTerms(terms), createdAt: now });
  }

  static rehydrate(id: string, state: OrganizationState): Organization {
    return new Organization(id, state);
  }

  get name() { return this.state.name; }
  get seats() { return this.state.seats; }
  get activeUntil() { return this.state.activeUntil.value; }
  get aiIncluded() { return this.state.aiIncluded; }
  get createdAt() { return this.state.createdAt; }

  isActive(now = new Date()): boolean {
    return this.state.activeUntil.includes(now);
  }

  /** Members get the AI features from this organization. */
  givesAi(now = new Date()): boolean {
    return this.state.aiIncluded && this.isActive(now);
  }

  /** New members and invitations need an active plan. */
  ensureActive(now = new Date()): void {
    if (!this.isActive(now)) {
      throw DomainError.conflict('organization.inactive',
        `Gói của tổ chức ${this.state.name} đã hết hạn (${this.activeUntil}). Hãy liên hệ quản trị viên để gia hạn.`);
    }
  }

  /** Seats may not drop below what members and pending invitations already use. */
  revise(terms: OrganizationTerms, seatsUsed: number): void {
    const next = validTerms(terms);
    if (next.seats < seatsUsed) {
      throw DomainError.conflict('organization.seats_in_use',
        `Tổ chức đang dùng ${seatsUsed} chỗ (giáo viên và lời mời đang chờ), không thể giảm xuống ${next.seats}.`);
    }
    this.state = { ...this.state, ...next };
  }
}

function validTerms(terms: OrganizationTerms): Omit<OrganizationState, 'createdAt'> {
  const name = terms.name.trim().replace(/\s+/g, ' ');
  assert(name.length >= 2 && name.length <= 120, 'organization.invalid_name', 'Tên tổ chức phải từ 2 đến 120 ký tự.');
  assert(Number.isInteger(terms.seats) && terms.seats >= 1 && terms.seats <= MAX_SEATS, 'organization.invalid_seats',
    `Số chỗ giáo viên phải từ 1 đến ${MAX_SEATS}.`);
  return { name, seats: terms.seats, activeUntil: PlanEndDate.of(terms.activeUntil), aiIncluded: terms.aiIncluded };
}

/** A teacher's membership of one organization. A teacher may belong to several organizations. */
export class OrganizationMember {
  constructor(
    readonly organizationId: string,
    readonly userId: string,
    public role: OrganizationRole,
    readonly joinedAt: Date,
  ) {}

  static join(organizationId: string, userId: string, role: OrganizationRole, now = new Date()): OrganizationMember {
    return new OrganizationMember(organizationId, userId, role, now);
  }

  get isAdmin() { return this.role === 'ADMIN'; }
}

export interface OrganizationInvitationState {
  organizationId: string;
  email: Email;
  displayName: string;
  /** Set when the email already belongs to a teacher: they accept from their home page. */
  userId: string | null;
  invitedById: string;
  status: OrganizationInvitationStatus;
  /** New accounts: the teacher invitation (email + code) that creates the account. */
  verificationId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/** An invitation into an organization. While pending and not expired it holds one seat. */
export class OrganizationInvitation extends AggregateRoot {
  private constructor(id: string, private state: OrganizationInvitationState) {
    super(id);
  }

  static issue(
    input: Pick<OrganizationInvitationState, 'organizationId' | 'email' | 'displayName' | 'userId' | 'invitedById'>,
    now = new Date(),
  ): OrganizationInvitation {
    return new OrganizationInvitation(newId(), {
      ...input,
      status: 'PENDING',
      verificationId: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ORGANIZATION_INVITATION_TTL_MS),
    });
  }

  static rehydrate(id: string, state: OrganizationInvitationState): OrganizationInvitation {
    return new OrganizationInvitation(id, state);
  }

  get snapshot(): Readonly<OrganizationInvitationState> { return this.state; }
  get organizationId() { return this.state.organizationId; }

  isPending(now = new Date()): boolean {
    return this.state.status === 'PENDING' && now < this.state.expiresAt;
  }

  ensurePending(now = new Date()): void {
    if (!this.isPending(now)) {
      throw DomainError.conflict('organization.invitation_closed', 'Lời mời đã hết hạn, đã được dùng hoặc đã bị hủy.');
    }
  }

  linkVerification(verificationId: string): void {
    this.state.verificationId = verificationId;
  }

  accept(now = new Date()): void {
    this.ensurePending(now);
    this.state.status = 'ACCEPTED';
  }

  decline(now = new Date()): void {
    this.ensurePending(now);
    this.state.status = 'DECLINED';
  }

  cancel(): void {
    if (this.state.status === 'PENDING') this.state.status = 'CANCELLED';
  }
}
