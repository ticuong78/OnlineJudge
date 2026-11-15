import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { MIGRATIONS } from '../../src/migrations/index.js';

/** Every entity of the backend, found by file like the TypeORM command line does (src/data-source.ts). */
export const ALL_ENTITIES = [join(__dirname, '../../src/modules/*/infrastructure/*.{ts,js}')];

/**
 * A test database schema built the way production builds it: by the migrations (OJ-5), not by `synchronize`.
 * The migrations' SQL names no schema, so the connection's search path points at the test's own schema.
 */
export function migratedOptions(
  url: string | undefined,
  schema: string,
  entities: NonNullable<DataSourceOptions['entities']>,
  extra: Record<string, unknown> = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url: url ?? '',
    schema,
    entities,
    migrations: MIGRATIONS,
    migrationsRun: true,
    migrationsTransactionMode: 'all',
    extra: { ...extra, options: `-c search_path="${schema}"` },
  };
}
