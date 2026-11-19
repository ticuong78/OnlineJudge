/**
 * How many bank filters are on, for the "Lọc (n)" button on phones (OJ-34). The search box stays on screen, so it is
 * not counted: only what the button hides (difficulty and topics).
 */
export function activeFilterCount(filters: { difficulty: string; tags: readonly string[] }): number {
  return (filters.difficulty ? 1 : 0) + filters.tags.length;
}
