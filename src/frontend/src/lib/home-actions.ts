/**
 * What the teacher's main "Giao bài" button does on the home page (OJ-33). It used to link to the bank's sets, which
 * left the teacher to find the assign button there; now it opens the assign flow for a class.
 */
export type AssignEntry =
  /** No active class yet: the button creates the first one instead. */
  | { kind: 'firstClass' }
  /** Admins, or the class list could not be loaded: today's link to the bank. */
  | { kind: 'bank' }
  /** Exactly one active class: straight to picking what to assign. */
  | { kind: 'class'; classId: string }
  /** Several active classes: ask which class first. */
  | { kind: 'pickClass' };

export function assignEntry(
  classes: readonly { id: string; status: string }[] | undefined,
  isAdmin: boolean,
): AssignEntry {
  if (isAdmin || !classes) return { kind: 'bank' };
  const active = classes.filter((c) => c.status === 'ACTIVE');
  if (active.length === 0) return { kind: 'firstClass' };
  if (active.length === 1) return { kind: 'class', classId: active[0].id };
  return { kind: 'pickClass' };
}
