import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { OrganizationInvitationStatus, OrganizationRole } from '@oj/contracts';
import { DataSource, In, MoreThan, type EntityManager } from 'typeorm';
import {
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  PlanEndDate,
} from '../domain/organization.js';
import { OrganizationRepository, type SeatReservation } from '../domain/organization.repository.js';
import { Email } from '../domain/user.js';
import {
  OrganizationInvitationOrmEntity,
  OrganizationMemberOrmEntity,
  OrganizationOrmEntity,
} from './organization.orm-entity.js';

@Injectable()
export class TypeOrmOrganizationRepository extends OrganizationRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  private get orgs() { return this.db.getRepository(OrganizationOrmEntity); }
  private get memberRows() { return this.db.getRepository(OrganizationMemberOrmEntity); }
  private get invitationRows() { return this.db.getRepository(OrganizationInvitationOrmEntity); }

  async findById(id: string) {
    const row = await this.orgs.findOneBy({ id });
    return row ? toOrganization(row) : null;
  }

  async findByIds(ids: string[]) {
    return ids.length ? (await this.orgs.findBy({ id: In([...new Set(ids)]) })).map(toOrganization) : [];
  }

  async findAll() {
    return (await this.orgs.find({ order: { name: 'ASC' } })).map(toOrganization);
  }

  async save(o: Organization) {
    await this.orgs.save({ id: o.id, name: o.name, seats: o.seats, activeUntil: o.activeUntil, aiIncluded: o.aiIncluded, createdAt: o.createdAt });
  }

  async members(organizationId: string) {
    return (await this.memberRows.find({ where: { organizationId }, order: { joinedAt: 'ASC' } })).map(toMember);
  }

  async membershipsOfUser(userId: string) {
    return (await this.memberRows.find({ where: { userId }, order: { joinedAt: 'ASC' } })).map(toMember);
  }

  async membershipsOfUsers(userIds: string[]) {
    if (!userIds.length) return [];
    return (await this.memberRows.find({ where: { userId: In([...new Set(userIds)]) }, order: { joinedAt: 'ASC' } })).map(toMember);
  }

  async findMember(organizationId: string, userId: string) {
    const row = await this.memberRows.findOneBy({ organizationId, userId });
    return row ? toMember(row) : null;
  }

  async saveMember(m: OrganizationMember) {
    await this.memberRows.update({ organizationId: m.organizationId, userId: m.userId }, { role: m.role });
  }

  async removeMember(organizationId: string, userId: string) {
    await this.memberRows.delete({ organizationId, userId });
  }

  async seatsUsed(organizationIds: string[], now: Date) {
    const used = new Map<string, number>(organizationIds.map((id) => [id, 0]));
    if (!organizationIds.length) return used;
    return countSeats(this.db.manager, organizationIds, now, used);
  }

  async findInvitation(id: string) {
    const row = await this.invitationRows.findOneBy({ id });
    return row ? toInvitation(row) : null;
  }

  async pendingInvitations(organizationId: string, now: Date) {
    const rows = await this.invitationRows.find({
      where: { organizationId, status: 'PENDING', expiresAt: MoreThan(now) },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toInvitation);
  }

  async pendingInvitationsForUser(userId: string, now: Date) {
    const rows = await this.invitationRows.find({
      where: { userId, status: 'PENDING', expiresAt: MoreThan(now) },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toInvitation);
  }

  async saveInvitation(invitation: OrganizationInvitation) {
    const s = invitation.snapshot;
    await this.invitationRows.update({ id: invitation.id }, { status: s.status, verificationId: s.verificationId });
  }

  async reserveSeat(
    organizationId: string,
    entry: { invitation: OrganizationInvitation } | { member: OrganizationMember },
    now: Date,
  ): Promise<SeatReservation> {
    return this.db.transaction(async (tx) => {
      // The organization row is locked until this commits: parallel reservations wait, then count again.
      const org = await tx.getRepository(OrganizationOrmEntity).findOne({
        where: { id: organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!org) return 'NO_SEATS';
      const used = (await countSeats(tx, [organizationId], now, new Map([[organizationId, 0]]))).get(organizationId) ?? 0;
      if (used >= org.seats) return 'NO_SEATS';
      if ('invitation' in entry) await tx.getRepository(OrganizationInvitationOrmEntity).insert(toInvitationRow(entry.invitation));
      else await tx.getRepository(OrganizationMemberOrmEntity).insert(toMemberRow(entry.member));
      return 'RESERVED';
    });
  }

  async acceptInvitation(invitation: OrganizationInvitation, member: OrganizationMember): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Only a still-pending invitation may become a membership (it may have been cancelled meanwhile).
      const result = await tx.getRepository(OrganizationInvitationOrmEntity).update(
        { id: invitation.id, status: 'PENDING' },
        { status: 'ACCEPTED' },
      );
      if (!result.affected) return false;
      // Already a member (e.g. added directly meanwhile): keep that membership and its role.
      await tx.createQueryBuilder().insert().into(OrganizationMemberOrmEntity).values(toMemberRow(member)).orIgnore().execute();
      return true;
    });
  }
}

/** Members plus pending, unexpired invitations, per organization. */
async function countSeats(db: EntityManager, ids: string[], now: Date, into: Map<string, number>) {
  const members = await db
    .createQueryBuilder(OrganizationMemberOrmEntity, 'm')
    .select('m.organizationId', 'id')
    .addSelect('COUNT(*)', 'n')
    .where('m.organizationId IN (:...ids)', { ids })
    .groupBy('m.organizationId')
    .getRawMany<{ id: string; n: string }>();
  const invitations = await db
    .createQueryBuilder(OrganizationInvitationOrmEntity, 'i')
    .select('i.organizationId', 'id')
    .addSelect('COUNT(*)', 'n')
    .where('i.organizationId IN (:...ids) AND i.status = :pending AND i.expiresAt > :now', { ids, pending: 'PENDING', now })
    .groupBy('i.organizationId')
    .getRawMany<{ id: string; n: string }>();
  for (const r of [...members, ...invitations]) into.set(r.id, (into.get(r.id) ?? 0) + Number(r.n));
  return into;
}

function toOrganization(row: OrganizationOrmEntity): Organization {
  return Organization.rehydrate(row.id, {
    name: row.name,
    seats: row.seats,
    activeUntil: PlanEndDate.of(row.activeUntil),
    aiIncluded: row.aiIncluded,
    createdAt: row.createdAt,
  });
}

function toMember(row: OrganizationMemberOrmEntity): OrganizationMember {
  return new OrganizationMember(row.organizationId, row.userId, row.role as OrganizationRole, row.joinedAt);
}

function toMemberRow(m: OrganizationMember): OrganizationMemberOrmEntity {
  return { organizationId: m.organizationId, userId: m.userId, role: m.role, joinedAt: m.joinedAt };
}

function toInvitation(row: OrganizationInvitationOrmEntity): OrganizationInvitation {
  return OrganizationInvitation.rehydrate(row.id, {
    organizationId: row.organizationId,
    email: Email.of(row.email),
    displayName: row.displayName,
    userId: row.userId,
    invitedById: row.invitedById,
    status: row.status as OrganizationInvitationStatus,
    verificationId: row.verificationId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });
}

function toInvitationRow(invitation: OrganizationInvitation): OrganizationInvitationOrmEntity {
  const s = invitation.snapshot;
  return {
    id: invitation.id,
    organizationId: s.organizationId,
    email: s.email.value,
    displayName: s.displayName,
    userId: s.userId,
    invitedById: s.invitedById,
    status: s.status,
    verificationId: s.verificationId,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  };
}
