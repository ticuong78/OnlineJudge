import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('organizations')
export class OrganizationOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column('int') seats: number;
  /** Last day of the plan, Vietnam time (YYYY-MM-DD). */
  @Column({ type: 'varchar', length: 10 }) activeUntil: string;
  @Column('boolean', { default: false }) aiIncluded: boolean;
  @Column('timestamptz') createdAt: Date;
}

/** One row per (organization, teacher). A teacher may be in several organizations. */
@Entity('organization_members')
export class OrganizationMemberOrmEntity {
  @PrimaryColumn('uuid') organizationId: string;
  @Index()
  @PrimaryColumn('uuid') userId: string;
  @Column({ type: 'varchar', length: 8 }) role: string;
  @Column('timestamptz') joinedAt: Date;
}

@Entity('organization_invitations')
@Index(['organizationId', 'status'])
export class OrganizationInvitationOrmEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') organizationId: string;
  @Column({ type: 'varchar', length: 254 }) email: string;
  @Column({ type: 'varchar', length: 80 }) displayName: string;
  @Index()
  @Column('uuid', { nullable: true }) userId: string | null;
  @Column('uuid') invitedById: string;
  @Column({ type: 'varchar', length: 10 }) status: string;
  @Column('uuid', { nullable: true }) verificationId: string | null;
  @Column('timestamptz') createdAt: Date;
  @Column('timestamptz') expiresAt: Date;
}
