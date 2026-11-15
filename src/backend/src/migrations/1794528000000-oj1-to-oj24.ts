import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Everything OJ-1 to OJ-24 added to `master`'s schema: organizations (OJ-8), sign-in links (OJ-1), the judge watchdog
 * (OJ-3), one integrity flag per pair (OJ-4, OJ-10), AI allowances (OJ-21) and learning paths (OJ-24). Generated from the
 * difference between the two sets of entities. IF NOT EXISTS, so databases that `DB_SYNC` already brought part or all
 * of the way are fine. Indexes on the dropped columns go with them in `down`.
 */
export class Oj1ToOj241794528000000 implements MigrationInterface {
  name = 'Oj1ToOj241794528000000';

  async up(q: QueryRunner): Promise<void> {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS "organizations" ("id" uuid NOT NULL, "name" character varying(120) NOT NULL, "seats" integer NOT NULL, "activeUntil" character varying(10) NOT NULL, "aiIncluded" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
      `CREATE TABLE IF NOT EXISTS "organization_members" ("organizationId" uuid NOT NULL, "userId" uuid NOT NULL, "role" character varying(8) NOT NULL, "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_7c48546e8026fb043d9ad0c2c8c" PRIMARY KEY ("organizationId", "userId"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_e826222ad017663c6db1a45a4f" ON "organization_members" ("userId")`,
      `CREATE TABLE IF NOT EXISTS "organization_invitations" ("id" uuid NOT NULL, "organizationId" uuid NOT NULL, "email" character varying(254) NOT NULL, "displayName" character varying(80) NOT NULL, "userId" uuid, "invitedById" uuid NOT NULL, "status" character varying(10) NOT NULL, "verificationId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f172f12b8a9ee6584b661f57e24" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_0a571bcec1c4e5ce4b4b4c9b0d" ON "organization_invitations" ("userId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_75f0b32d774fb798078e0c4750" ON "organization_invitations" ("organizationId", "status")`,
      `ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "sharedOrganizationIds" uuid array NOT NULL DEFAULT '{}'`,
      `ALTER TABLE "classrooms" ADD COLUMN IF NOT EXISTS "organizationId" uuid`,
      `CREATE INDEX IF NOT EXISTS "IDX_9031adbb9c0f5d47107fb633dc" ON "classrooms" ("organizationId")`,
      `ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "linkHash" character varying(255)`,
      `ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "faultSource" character varying(16)`,
      `ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "queuedAt" TIMESTAMP WITH TIME ZONE`,
      `ALTER TABLE "integrity_flags" ADD COLUMN IF NOT EXISTS "pairKey" character varying(80)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_9839432d4ee99e02635780fa30" ON "integrity_flags" ("pairKey")`,
      `CREATE TABLE IF NOT EXISTS "ai_usage" ("userId" uuid NOT NULL, "feature" character varying(24) NOT NULL, "period" character varying(7) NOT NULL, "used" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_2acfd49a8177aa3f80770f315af" PRIMARY KEY ("userId", "feature", "period"))`,
      `CREATE TABLE IF NOT EXISTS "learning_paths" ("id" uuid NOT NULL, "ownerId" uuid NOT NULL, "ownerName" character varying(80) NOT NULL, "title" character varying(200) NOT NULL, "description" text NOT NULL DEFAULT '', "topic" character varying(40), "isPublic" boolean NOT NULL DEFAULT false, "steps" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_2f073530d2af4a865296c06274c" PRIMARY KEY ("id"))`,
      `CREATE INDEX IF NOT EXISTS "IDX_0662d30fe03e23f899ad4467c7" ON "learning_paths" ("ownerId")`,
      `CREATE INDEX IF NOT EXISTS "IDX_3b6e9dc902696c78c58b29ff5f" ON "learning_paths" ("isPublic")`,
    ]) {
      await q.query(sql);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const sql of [
      `DROP TABLE IF EXISTS "learning_paths"`,
      `DROP TABLE IF EXISTS "ai_usage"`,
      `DROP TABLE IF EXISTS "organization_invitations"`,
      `DROP TABLE IF EXISTS "organization_members"`,
      `DROP TABLE IF EXISTS "organizations"`,
      `ALTER TABLE "integrity_flags" DROP COLUMN IF EXISTS "pairKey"`,
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "queuedAt"`,
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "faultSource"`,
      `ALTER TABLE "verifications" DROP COLUMN IF EXISTS "linkHash"`,
      `ALTER TABLE "classrooms" DROP COLUMN IF EXISTS "organizationId"`,
      `ALTER TABLE "problems" DROP COLUMN IF EXISTS "sharedOrganizationIds"`,
    ]) {
      await q.query(sql);
    }
  }
}
