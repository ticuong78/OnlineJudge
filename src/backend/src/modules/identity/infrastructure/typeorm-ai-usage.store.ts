import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { AiFeature } from '@oj/contracts';
import { DataSource } from 'typeorm';
import { AiUsageStore } from '../../../shared/application/ai-quota.js';
import { AiUsageOrmEntity } from './ai-usage.orm-entity.js';

/**
 * `AiUsageStore` in PostgreSQL. `reserve` is a single statement: the row is created at 1 or incremented only while it
 * is under the limit, so concurrent requests can never take it past the allowance (the database serialises them).
 */
@Injectable()
export class TypeOrmAiUsageStore extends AiUsageStore {
  constructor(@InjectDataSource() private readonly db: DataSource) {
    super();
  }

  /** The table with its schema when one is configured (raw SQL does not get TypeORM's prefixing). */
  private get table(): string {
    const { schema, tableName } = this.db.getMetadata(AiUsageOrmEntity);
    return schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
  }

  async reserve(userId: string, feature: AiFeature, period: string, limit: number | null): Promise<boolean> {
    if (limit !== null && limit <= 0) return false;
    const rows = await this.db.query<{ used: number }[]>(
      `INSERT INTO ${this.table} AS u ("userId", feature, period, used) VALUES ($1, $2, $3, 1)
       ON CONFLICT ("userId", feature, period) DO UPDATE SET used = u.used + 1
       WHERE $4::int IS NULL OR u.used < $4::int
       RETURNING used`,
      [userId, feature, period, limit],
    );
    return rows.length > 0;
  }

  async release(userId: string, feature: AiFeature, period: string): Promise<void> {
    await this.db.query(
      `UPDATE ${this.table} SET used = used - 1 WHERE "userId" = $1 AND feature = $2 AND period = $3 AND used > 0`,
      [userId, feature, period],
    );
  }

  async used(userId: string, period: string): Promise<Map<AiFeature, number>> {
    const rows = await this.db.query<{ feature: AiFeature; used: number }[]>(
      `SELECT feature, used FROM ${this.table} WHERE "userId" = $1 AND period = $2`,
      [userId, period],
    );
    return new Map(rows.map((r) => [r.feature, Number(r.used)]));
  }
}
