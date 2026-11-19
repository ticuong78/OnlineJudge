/** The results board gets the wide container only when its columns need it (OJ-34): more than 4 problems. */
export const RESULTS_WIDE_AFTER = 4;

export function resultsWide(problemCount: number): boolean {
  return problemCount > RESULTS_WIDE_AFTER;
}

/**
 * The page container (OJ-35): one gutter for every page, so content starts at the same place everywhere (x = 32 at
 * 1280 px). Normal pages are at most 1280 px wide; wide pages (see `Container`) at most 1440 px. The header bar uses the
 * same gutter and the normal width, so its logo lines up with the page content.
 */
export const PAGE_GUTTER = 'px-4 sm:px-6 lg:px-8';

export function containerClass(wide: boolean): string {
  return `mx-auto w-full ${PAGE_GUTTER} py-6 ${wide ? 'max-w-[1440px]' : 'max-w-7xl'}`;
}
