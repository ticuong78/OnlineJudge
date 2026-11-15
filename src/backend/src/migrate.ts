/**
 * `pnpm --filter @oj/backend migration:run | migration:revert` (OJ-28): the same advisory lock as the API's startup,
 * so running one while a backend starts cannot apply or undo a migration twice. Reads the database settings the same
 * way as data-source.ts. `migration:show`, `migration:generate` and `migration:check` use the TypeORM command line.
 */
import 'reflect-metadata';
import dataSource from './data-source.js';
import { prepareDatabase, withMigrationLock } from './database.js';

async function main(command: string | undefined) {
  if (command !== 'run' && command !== 'revert') throw new Error('Usage: migrate.ts run | revert');
  const ds = await dataSource.initialize();
  try {
    if (command === 'run') {
      await prepareDatabase(ds);
      console.log('Migrations are up to date.');
    } else {
      await withMigrationLock(ds, () => ds.undoLastMigration({ transaction: 'all' }));
      console.log('The last migration was reverted.');
    }
  } finally {
    await ds.destroy();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
