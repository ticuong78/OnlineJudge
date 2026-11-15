import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Monthly AI uses per account and feature (OJ-21). One row per user, feature and month ("2026-11"). */
@Entity('ai_usage')
export class AiUsageOrmEntity {
  @PrimaryColumn('uuid') userId: string;
  @PrimaryColumn({ type: 'varchar', length: 24 }) feature: string;
  @PrimaryColumn({ type: 'varchar', length: 7 }) period: string;
  @Column('int', { default: 0 }) used: number;
}
