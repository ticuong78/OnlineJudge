import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First-solution AI reviews get a table of their own, keyed by session, problem and student (OJ-26). They used to be
 * rows of kind AI_FIRST in `integrity_checks` under an id hashed from those three, which cannot be turned back into
 * them, so those rows are removed: a student whose first accepted solution was already reviewed may be reviewed once
 * more. Only databases that ran OJ-21 checks have such rows. IF NOT EXISTS: a development database that `DB_SYNC`
 * already gave the table must still start (OJ-28).
 */
export class FirstReviews1794624915638 implements MigrationInterface {
  name = 'FirstReviews1794624915638';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE IF NOT EXISTS "integrity_first_reviews" ("sessionId" uuid NOT NULL, "problemKey" character varying(4) NOT NULL, "userId" uuid NOT NULL, "reviewedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_9007b2d0b70b3f4e5bf87242a36" PRIMARY KEY ("sessionId", "problemKey", "userId"))`,
    );
    await q.query(`DELETE FROM "integrity_checks" WHERE "kind" = 'AI_FIRST'`);
  }

  /** The previous version keeps its claims in `integrity_checks` again; reviews recorded here are not carried back. */
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "integrity_first_reviews"`);
  }
}
