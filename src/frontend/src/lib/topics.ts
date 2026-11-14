import { foldTag, isTopicId, normalizeTag, TOPIC_ALIASES, Topics, type TopicId } from '@oj/contracts';

/** How many suggestions the tag input shows at once. */
export const MAX_SUGGESTIONS = 8;
/** Tags the topic picker shows before "show all". */
export const PICKER_COLLAPSED = 12;

/**
 * Suggestions for what a teacher is typing in the tag input (OJ-20): standard topics whose name (in the interface
 * language), id or a known alias matches the text, then the teacher's own other tags; at most MAX_SUGGESTIONS in all.
 * Exact matches come first, then names that start with the text, then the rest (review: "cây" must offer "Cây" before
 * a topic whose alias merely contains it). Tags already chosen are left out.
 */
export function suggestTags(
  text: string,
  nameOf: (id: TopicId) => string,
  ownTags: string[],
  chosen: string[],
): { standard: TopicId[]; own: string[] } {
  const q = foldTag(text);
  const exact = text.trim() ? normalizeTag(text) : '';
  const taken = new Set(chosen);
  const aliasesOf = (id: TopicId) => Object.entries(TOPIC_ALIASES).filter(([, to]) => to === id).map(([alias]) => alias);
  /** 0 exact, 1 a name/id/alias starts with the text, 2 contains it, -1 no match. */
  const rank = (forms: string[], isExact: boolean) => {
    if (!q) return 2;
    if (isExact || forms.includes(q)) return 0;
    if (forms.some((f) => f.startsWith(q))) return 1;
    return forms.some((f) => f.includes(q)) ? 2 : -1;
  };
  // One ranked list for both kinds, so an exact own tag is never crowded out by partial topic matches. Within a rank:
  // standard topics first, each kind in its own order (Array.prototype.sort is stable).
  const candidates = [
    ...Topics.map((t) => t.id as TopicId)
      .filter((id) => !taken.has(id))
      .map((id) => ({ tag: id as string, standard: true, rank: rank([foldTag(nameOf(id)), foldTag(id), ...aliasesOf(id)], exact === id) })),
    ...ownTags
      .filter((tag) => !isTopicId(tag) && !taken.has(tag))
      .map((tag) => ({ tag, standard: false, rank: rank([foldTag(tag)], exact === tag) })),
  ]
    .filter((c) => c.rank >= 0)
    .sort((a, b) => a.rank - b.rank || Number(b.standard) - Number(a.standard))
    .slice(0, MAX_SUGGESTIONS);
  // Shown as two groups (standard, then own), keeping the ranked order inside each.
  const standard = candidates.filter((c) => c.standard).map((c) => c.tag as TopicId);
  const own = candidates.filter((c) => !c.standard).map((c) => c.tag);
  return { standard, own };
}

/** What Enter adds without browsing the list: the typed text when it is exactly a topic or an own tag, else null. */
export function exactTag(text: string, ownTags: string[]): string | null {
  if (!text.trim()) return null;
  const tag = normalizeTag(text);
  return isTopicId(tag) || ownTags.includes(tag) ? tag : null;
}

/** Tag counts for the picker: chosen ones first, then standard topics, then the rest; each by count, then name. */
export function orderTagCounts<T extends { tag: string; count: number }>(counts: T[], chosen: string[]): T[] {
  const rank = (t: T) => (chosen.includes(t.tag) ? 0 : isTopicId(t.tag) ? 1 : 2);
  return [...counts].sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Counts how many items carry each tag (practice problems on the client). */
export function countTags(items: { tags: string[] }[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count }));
}
