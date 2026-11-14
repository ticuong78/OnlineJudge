import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The schema of `master` (2026-11-06), generated from its TypeORM entities: what a server set up before migrations
 * existed has. Every statement is IF NOT EXISTS, so on a database that `DB_SYNC` already built it changes nothing and
 * is only recorded as applied (OJ-5).
 */
export class Baseline1793923200000 implements MigrationInterface {
  name = 'Baseline1793923200000';

  async up(q: QueryRunner): Promise<void> {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS "problem_sets" ("id" uuid NOT NULL, "ownerId" uuid NOT NULL, "ownerName" character varying(80) NOT NULL, "title" character varying(200) NOT NULL, "description" text NOT NULL DEFAULT '', "type" character varying(16) NOT NULL, "items" jsonb NOT NULL DEFAULT '[]', "isPublic" boolean NOT NULL DEFAULT false, "copiedFromId" uuid, "copiedFromTitle" character varying(200), "copiedFromOwner" character varying(80), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_1b8b9ef204d69e7a399d02ef4a8" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_3e1e3a4ba3ec3901e61ac2993a" ON "problem_sets" ("ownerId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_c2699225e32ff23b4a592ae41b" ON "problem_sets" ("isPublic")`,
      `CREATE TABLE IF NOT EXISTS "sessions" ("id" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text NOT NULL DEFAULT '', "type" character varying(16) NOT NULL, "classId" uuid, "sourceSetId" uuid, "assignmentKey" character varying(120), "opensAt" TIMESTAMP WITH TIME ZONE, "closesAt" TIMESTAMP WITH TIME ZONE, "settings" jsonb NOT NULL DEFAULT '{}', "createdById" uuid NOT NULL, "createdByName" character varying(80) NOT NULL, "problems" jsonb NOT NULL, "retiredKeys" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_df8bda143f8079aed2bbe55342" ON "sessions" ("classId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_13b77783749416048011a5f168" ON "sessions" ("assignmentKey")`,
      `CREATE TABLE IF NOT EXISTS "session_tests" ("sessionId" uuid NOT NULL, "tests" jsonb NOT NULL, CONSTRAINT "PK_56363e8dd8a58aa4a0a4808e8fd" PRIMARY KEY ("sessionId"))`,
      `CREATE TABLE IF NOT EXISTS "session_attempts" ("sessionId" uuid NOT NULL, "userId" uuid NOT NULL, "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_6ca04e4e5725cef2f858ef8e5b3" PRIMARY KEY ("sessionId", "userId"))`,
      `CREATE TABLE IF NOT EXISTS "learning_sessions" ("sessionId" uuid NOT NULL, "title" character varying(200) NOT NULL, "type" character varying(16) NOT NULL, "classId" uuid, "className" character varying(100), "problems" jsonb NOT NULL, "available" boolean NOT NULL DEFAULT true, "classDeleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_b005262c0feb03eca9f14f76e9d" PRIMARY KEY ("sessionId"))`,
      `CREATE TABLE IF NOT EXISTS "learning_progress" ("userId" uuid NOT NULL, "sessionId" uuid NOT NULL, "problemKey" character varying(4) NOT NULL, "userDisplayName" character varying(80) NOT NULL, "bestScore" real NOT NULL DEFAULT '0', "solvedAt" TIMESTAMP WITH TIME ZONE, "lastSubmittedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_7d676293e978851d3b593d6826d" PRIMARY KEY ("userId", "sessionId", "problemKey"))`,
      `CREATE TABLE IF NOT EXISTS "problems" ("id" uuid NOT NULL, "seq" integer NOT NULL, "ownerId" uuid NOT NULL, "ownerName" character varying(80) NOT NULL, "isPublic" boolean NOT NULL DEFAULT false, "publicTests" boolean NOT NULL DEFAULT false, "publicSolution" boolean NOT NULL DEFAULT false, "copiedFromId" uuid, "copiedFromCode" character varying(16), "copiedFromOwner" character varying(80), "title" character varying(200) NOT NULL, "difficulty" character varying(16) NOT NULL, "tags" text array NOT NULL DEFAULT '{}', "statement" text NOT NULL, "inputFormat" text NOT NULL, "outputFormat" text NOT NULL, "constraints" text NOT NULL, "timeLimitMs" integer NOT NULL, "memoryLimitMb" integer NOT NULL, "solutionExplanation" text, "solutionLanguage" character varying(16), "solutionCode" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b3994afba6ab64a42cda1ccaeff" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_98b64030638bbceea4505ecac5" ON "problems" ("seq")`,
      `CREATE INDEX IF NOT EXISTS "IDX_e5ed51a5e311263f3b492d6688" ON "problems" ("ownerId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_61cd5930e349544742892706c5" ON "problems" ("isPublic")`,
      `CREATE INDEX IF NOT EXISTS "IDX_aededfe79884d75423b0f93c45" ON "problems" ("difficulty")`,
      `CREATE TABLE IF NOT EXISTS "test_cases" ("id" uuid NOT NULL, "problemId" uuid NOT NULL, "order" integer NOT NULL, "input" text NOT NULL, "expectedOutput" text NOT NULL, "isSample" boolean NOT NULL DEFAULT false, "points" real NOT NULL DEFAULT '1', CONSTRAINT "PK_39eb2dc90c54d7a036b015f05c4" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_0126d367e92400b37cd7da0cda" ON "test_cases" ("problemId")`,
      `CREATE TABLE IF NOT EXISTS "classrooms" ("id" uuid NOT NULL, "name" character varying(100) NOT NULL, "code" character varying(20) NOT NULL, "teacherId" uuid NOT NULL, "status" character varying(12) NOT NULL DEFAULT 'ACTIVE', "archivedAt" TIMESTAMP WITH TIME ZONE, "purgeAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_20b7b82896c06eda27548bd0c24" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_7970c5df0018bd7bc59491a3db" ON "classrooms" ("code")`,
      `CREATE INDEX IF NOT EXISTS "IDX_ea22bf3c6b069755e01340f633" ON "classrooms" ("teacherId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_504ac269764cf4a9afb032d5b5" ON "classrooms" ("purgeAt")`,
      `CREATE TABLE IF NOT EXISTS "enrollments" ("studentId" uuid NOT NULL, "classId" uuid NOT NULL, "enrolledAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_43599c2329cb145ee8ba57079b4" PRIMARY KEY ("studentId", "classId"))`,
      `CREATE TABLE IF NOT EXISTS "membership_requests" ("id" uuid NOT NULL, "kind" character varying(8) NOT NULL, "status" character varying(12) NOT NULL, "studentId" uuid NOT NULL, "classId" uuid NOT NULL, "message" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "decidedAt" TIMESTAMP WITH TIME ZONE, "decidedById" uuid, CONSTRAINT "PK_7679697ffa9b5a0d385d83b0783" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_1c0c996405637ea1049ccd760d" ON "membership_requests" ("studentId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "IDX_f0a2e2ec3af342db20d6344d2a" ON "membership_requests" ("classId", "status")`,
      `CREATE TABLE IF NOT EXISTS "class_threads" ("id" uuid NOT NULL, "classId" uuid NOT NULL, "kind" character varying(16) NOT NULL, "title" character varying(200) NOT NULL, "body" text NOT NULL, "author" jsonb NOT NULL, "pinned" boolean NOT NULL DEFAULT false, "sessionId" uuid, "sessionTitle" character varying(200), "problemKey" character varying(4), "replies" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_4cbd5eb10def2810c5b98bec2c1" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_58f4fb5d23df64929e8f110ee8" ON "class_threads" ("sessionId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_b1fd614df040c5cdc9bde6cf8e" ON "class_threads" ("classId", "lastActivityAt")`,
      `CREATE TABLE IF NOT EXISTS "users" ("id" uuid NOT NULL, "email" character varying(254) NOT NULL, "displayName" character varying(80) NOT NULL, "phone" character varying(16), "role" character varying(16) NOT NULL, "passwordHash" character varying(255) NOT NULL, "vip" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_single_admin" ON "users" ("role") WHERE "role" = 'ADMIN'`,
      `CREATE TABLE IF NOT EXISTS "verifications" ("id" uuid NOT NULL, "purpose" character varying(24) NOT NULL, "email" character varying(254) NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "codeHash" character varying(255) NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSentAt" TIMESTAMP WITH TIME ZONE NOT NULL, "consumedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_2127ad1b143cf012280390b01d1" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_5b1924b3231e8883aac7db6787" ON "verifications" ("email", "purpose")`,
      `CREATE TABLE IF NOT EXISTS "integrity_flags" ("id" uuid NOT NULL, "kind" character varying(16) NOT NULL, "status" character varying(16) NOT NULL, "level" character varying(8) NOT NULL, "score" real NOT NULL, "summary" text NOT NULL, "reasons" jsonb NOT NULL DEFAULT '[]', "segments" jsonb NOT NULL DEFAULT '[]', "sessionId" uuid NOT NULL, "sessionTitle" character varying(200) NOT NULL, "problemKey" character varying(4) NOT NULL, "problemTitle" character varying(210) NOT NULL, "subject" jsonb NOT NULL, "matched" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "acknowledgedAt" TIMESTAMP WITH TIME ZONE, "acknowledgedByName" character varying(80), CONSTRAINT "PK_519c19074981f9e2a04d85015a8" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_4756ea74fb3ba1f8f7719e3c5d" ON "integrity_flags" ("sessionId", "status")`,
      `CREATE TABLE IF NOT EXISTS "integrity_checks" ("submissionId" uuid NOT NULL, "kind" character varying(16) NOT NULL, "checkedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_0b2f9dfbef9085ef1c5432abd2a" PRIMARY KEY ("submissionId", "kind"))`,
      `CREATE TABLE IF NOT EXISTS "submissions" ("id" uuid NOT NULL, "userId" uuid NOT NULL, "userDisplayName" character varying(80) NOT NULL, "sessionId" uuid NOT NULL, "sessionTitle" character varying(200) NOT NULL, "problemKey" character varying(4) NOT NULL, "problemTitle" character varying(210) NOT NULL, "language" character varying(16) NOT NULL, "sourceCode" text NOT NULL, "totalPoints" real NOT NULL, "judgeRun" integer NOT NULL DEFAULT '1', "status" character varying(16) NOT NULL, "verdict" character varying(8), "score" real NOT NULL DEFAULT '0', "compileOutput" text, "testResults" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "judgedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_10b3be95b8b2fb1e482e07d706b" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_d4842916487f15fcca89b1a918" ON "submissions" ("status")`,
      `CREATE INDEX IF NOT EXISTS "IDX_43279b3bb7dcb519a62f27fc5f" ON "submissions" ("sessionId", "problemKey")`,
      `CREATE INDEX IF NOT EXISTS "IDX_b539f9ae2dc4d4731e8ef7e7ba" ON "submissions" ("userId", "createdAt")`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_0126d367e92400b37cd7da0cda6' AND connamespace = current_schema()::regnamespace) THEN
          ALTER TABLE "test_cases" ADD CONSTRAINT "FK_0126d367e92400b37cd7da0cda6" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$`,
    ]) {
      await q.query(sql);
    }
  }

  /**
   * Refuses (OJ-28): undoing the baseline would drop every table with all class data. Restore a backup instead.
   */
  async down(): Promise<void> {
    throw new Error('The baseline migration cannot be reverted: it would drop every table. Restore a backup instead.');
  }
}
