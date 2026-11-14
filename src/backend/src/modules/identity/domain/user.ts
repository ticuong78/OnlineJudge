import type { AiPlan, Role } from '@oj/contracts';
import { AggregateRoot, newId } from '../../../shared/domain/aggregate-root.js';
import { assert, DomainError } from '../../../shared/domain/domain-error.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly value: string) {}

  static of(raw: string): Email {
    const value = raw.trim().toLowerCase();
    assert(EMAIL_RE.test(value), 'identity.invalid_email', 'Email không hợp lệ.');
    return new Email(value);
  }
}

/** Vietnamese phone number, stored as 0xxxxxxxxx. Collected for contact only (not verified). */
export class Phone {
  private constructor(readonly value: string) {}

  static of(raw: string): Phone {
    const digits = raw.replace(/[\s.\-()]/g, '').replace(/^\+?84/, '0');
    assert(/^0\d{9,10}$/.test(digits), 'identity.invalid_phone', 'Số điện thoại không hợp lệ.');
    return new Phone(digits);
  }

  static optional(raw: string | null | undefined): Phone | null {
    return raw && raw.trim() ? Phone.of(raw) : null;
  }
}

export class DisplayName {
  private constructor(readonly value: string) {}

  static of(raw: string): DisplayName {
    const value = raw.trim().replace(/\s+/g, ' ');
    assert(value.length >= 2 && value.length <= 80, 'identity.invalid_name', 'Họ tên phải từ 2 đến 80 ký tự.');
    return new DisplayName(value);
  }
}

export interface UserProps {
  email: Email;
  displayName: string;
  phone: Phone | null;
  role: Role;
  passwordHash: string;
  /** VIP teacher account: unlocks the AI features. */
  vip: boolean;
  createdAt: Date;
}

interface NewAccount {
  email: Email;
  displayName: DisplayName;
  phone: Phone | null;
  passwordHash: string;
}

/**
 * User aggregate. Accounts are created through intention-revealing factories, always after
 * the email was verified (registration OTP or teacher invitation); there is deliberately
 * no way to create an ADMIN other than `bootstrapAdmin`.
 */
export class User extends AggregateRoot {
  private constructor(id: string, private props: UserProps) {
    super(id);
  }

  static registerStudent(account: NewAccount): User {
    return User.create(account, 'STUDENT');
  }

  static acceptTeacherInvitation(account: NewAccount): User {
    return User.create(account, 'TEACHER');
  }

  /** Only used once, at startup, when the system has no administrator. */
  static bootstrapAdmin(account: NewAccount): User {
    return User.create(account, 'ADMIN');
  }

  static rehydrate(id: string, props: UserProps): User {
    return new User(id, props);
  }

  private static create(account: NewAccount, role: Role): User {
    return new User(newId(), {
      email: account.email,
      displayName: account.displayName.value,
      phone: account.phone,
      role,
      passwordHash: account.passwordHash,
      vip: false,
      createdAt: new Date(),
    });
  }

  changePassword(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
  }

  /** Upgrades a teacher to VIP (AI features) or back to a regular account. */
  setVip(vip: boolean): void {
    if (this.props.role !== 'TEACHER') {
      throw DomainError.validation('identity.vip_teachers_only', 'Chỉ tài khoản giáo viên mới nâng cấp VIP được.');
    }
    this.props.vip = vip;
  }

  /**
   * The account's own AI plan (OJ-21): administrators unlimited, VIP teachers PLUS, other teachers a FREE allowance,
   * students none. An organization with AI can raise a teacher to PLUS (`withOrganizationAi`).
   */
  aiPlan(organizationAi = false): AiPlan {
    if (this.props.role === 'ADMIN') return 'UNLIMITED';
    if (this.props.role !== 'TEACHER') return 'NONE';
    return this.props.vip || organizationAi ? 'PLUS' : 'FREE';
  }

  ensureDeletable(): void {
    if (this.props.role === 'ADMIN') {
      throw DomainError.forbidden('identity.admin_not_deletable', 'Không thể xóa tài khoản quản trị viên.');
    }
  }

  get email() { return this.props.email; }
  get displayName() { return this.props.displayName; }
  get phone() { return this.props.phone; }
  get role() { return this.props.role; }
  get passwordHash() { return this.props.passwordHash; }
  get vip() { return this.props.vip; }
  get createdAt() { return this.props.createdAt; }
}
