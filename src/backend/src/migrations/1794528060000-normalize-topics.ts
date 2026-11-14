import { Logger } from '@nestjs/common';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillRecordProblems, backfillSessionProblems } from '../modules/assessment/application/topic-backfill.js';
import { retagged } from '../modules/catalog/application/topic-normalization.js';

type Row = Record<string, unknown>;

/** The rows of a SELECT, typed by the caller. */
async function select<T>(q: QueryRunner, sql: string): Promise<T[]> {
  return (await q.query(sql)) as T[];
}

/**
 * Data, not schema (OJ-20):
 * 1. Problems' tags are rewritten to their stored form: "Quy hoạch động" and "qhđ" become the standard topic `dp`, and
 *    tags from before the 40-character limit are cut to it.
 * 2. Sessions created before topics were copied get the tags of their bank problems, and the learning record's copy
 *    of those sessions gets the same tags. Nothing is refreshed or rejudged, and tags a session already has stay.
 *
 * It runs before the API accepts requests, in the migrations' transaction, with the rows locked. That matters: the
 * API writes `[]` for a session's missing tags on any save, and this step never overwrites tags that are present.
 * Running it again changes nothing.
 */
export class NormalizeTopics1794528060000 implements MigrationInterface {
  name = 'NormalizeTopics1794528060000';

  async up(q: QueryRunner): Promise<void> {
    const log = new Logger('Migration');
    const rows = await select<{ id: string; tags: string[] }>(q, 'SELECT id, tags FROM problems FOR UPDATE');
    const changes = retagged(rows);
    for (const c of changes) await q.query('UPDATE problems SET tags = $1 WHERE id = $2', [c.to, c.id]);

    const normalised = new Map(changes.map((c) => [c.id, c.to]));
    const bankTags = new Map(rows.map((r) => [r.id, normalised.get(r.id) ?? r.tags]));
    const sessions = await select<{ id: string; problems: { sourceProblemId: string; key: string; tags?: string[] }[] }>(
      q,
      'SELECT id, problems FROM sessions FOR UPDATE',
    );
    const tagsBySession = new Map<string, Map<string, string[]>>();
    let filled = 0;
    for (const s of sessions) {
      const next = backfillSessionProblems(s.problems, bankTags);
      tagsBySession.set(s.id, new Map((next ?? s.problems).map((p) => [p.key, p.tags ?? []])));
      if (!next) continue;
      filled++;
      await q.query('UPDATE sessions SET problems = $1 WHERE id = $2', [JSON.stringify(next), s.id]);
    }

    const records = await select<{ sessionId: string; problems: (Row & { key: string; tags?: string[] })[] }>(
      q,
      'SELECT "sessionId", problems FROM learning_sessions FOR UPDATE',
    );
    let recordsFilled = 0;
    for (const r of records) {
      const next = backfillRecordProblems(r.problems, tagsBySession.get(r.sessionId) ?? new Map());
      if (!next) continue;
      recordsFilled++;
      await q.query('UPDATE learning_sessions SET problems = $1 WHERE "sessionId" = $2', [JSON.stringify(next), r.sessionId]);
    }
    log.log(
      `Topics: ${changes.length} of ${rows.length} problems normalised, ${filled} of ${sessions.length} sessions and ` +
        `${recordsFilled} of ${records.length} learning-record sessions filled in.`,
    );
  }

  /** The old spellings are not kept, so there is nothing to restore; the tags stay valid for the previous version. */
  async down(): Promise<void> {}
}
