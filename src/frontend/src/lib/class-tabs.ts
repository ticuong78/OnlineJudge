/** Tabs of the class page (OJ-32), kept in the URL as `?tab=`. */
export const ClassTabs = ['sessions', 'gradebook', 'board', 'students'] as const;
export type ClassTab = (typeof ClassTabs)[number];

/** An unknown or missing value opens the sessions, which is where a teacher usually starts. */
export function classTab(param: string | null | undefined): ClassTab {
  return (ClassTabs as readonly string[]).includes(param ?? '') ? (param as ClassTab) : 'sessions';
}

export function classTabHref(classId: string, tab: ClassTab): string {
  return tab === 'sessions' ? `/classes/${classId}` : `/classes/${classId}?tab=${tab}`;
}

