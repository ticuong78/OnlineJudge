import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import type { VerificationPayload } from '../domain/verification.js';

@Entity('users')
// Database-level guarantee that there is at most one administrator.
@Index('uq_users_single_admin', ['role'], { unique: true, where: `"role" = 'ADMIN'` })
export class UserOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 80 })
  displayName: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 16 })
  role: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  /** VIP teacher: may use the AI features. */
  @Column('boolean', { default: false })
  vip: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('verifications')
@Index(['email', 'purpose'])
export class VerificationOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 24 }) purpose: string;
  @Column({ type: 'varchar', length: 254 }) email: string;
  @Column('jsonb', { default: {} }) payload: VerificationPayload;
  @Column({ type: 'varchar', length: 255 }) codeHash: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) linkHash: string | null;
  @Column('int', { default: 0 }) attempts: number;
  @Column('timestamptz') expiresAt: Date;
  @Column('timestamptz') lastSentAt: Date;
  @Column('timestamptz', { nullable: true }) consumedAt: Date | null;
  @Column('timestamptz') createdAt: Date;
}
