import { clipTag, normalizeTag } from '@oj/contracts';

/**
 * The stored tags of each problem after OJ-20's normalisation, for the problems where they change. Same rule as on
 * save (aliases to standard topic ids, NFC, duplicates removed, order kept), plus tags from before the 40-character
 * limit cut to it, so such problems can be copied and edited again. Running it twice changes nothing.
 */
export function retagged(rows: { id: string; tags: string[] }[]): { id: string; from: string[]; to: string[] }[] {
  return rows
    .map((r) => ({ id: r.id, from: r.tags, to: [...new Set(r.tags.map((t) => clipTag(normalizeTag(t))).filter(Boolean))] }))
    .filter((r) => r.to.length !== r.from.length || r.to.some((t, i) => t !== r.from[i]));
}
