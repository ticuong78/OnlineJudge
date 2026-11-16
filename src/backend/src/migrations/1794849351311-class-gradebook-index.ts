import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An index on `learning_progress.sessionId` (OJ-31). The primary key starts with `userId`, so reading a session's
 * progress (session results) or several sessions' (the class gradebook) scanned the whole table. IF NOT EXISTS: a
 * development database that `DB_SYNC` already gave the index must still start (OJ-28).
 */
export class ClassGradebookIndex1794849351311 implements MigrationInterface {
  name = 'ClassGradebookIndex1794849351311';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_9446184cb740ba66f1c6b3d9c7" ON "learning_progress" ("sessionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Not schema-qualified, like the other migrations: the database's search path decides (tests use their own schema).
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_9446184cb740ba66f1c6b3d9c7"`);
  }
}
