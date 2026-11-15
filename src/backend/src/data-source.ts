/**
 * The data source for the TypeORM command line (OJ-5): `pnpm --filter @oj/backend migration:run | migration:revert |
 * migration:show | migration:generate | migration:check`. It reads the same `.env` files as the API; variables already
 * set take precedence. The API itself runs the migrations at startup and does not use this file.
 */
import 'reflect-metadata';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.js';

for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Missing file: use the environment as it is.
  }
}

export default new DataSource({
  ...databaseOptions((key) => process.env[key]),
  // The command line never alters the schema on its own; it only runs, reverts or compares migrations.
  migrationsRun: false,
  synchronize: false,
  // The API finds entities through its modules (autoLoadEntities); here they are found by file.
  entities: [join(__dirname, 'modules/*/infrastructure/*.{ts,js}')],
});
