import type { Role, UserDto } from '@oj/contracts';

/** Keys of `shell.nav` in the message files. */
export type NavKey = 'home' | 'bank' | 'classes' | 'myClass' | 'practice' | 'progress' | 'integrity' | 'organizations' | 'submissions' | 'users';

export interface NavLink {
  href: string;
  label: NavKey;
}

type NavUser = Pick<UserDto, 'role' | 'organizations'>;

const STAFF: Role[] = ['ADMIN', 'TEACHER'];
const isStaff = (u: NavUser) => STAFF.includes(u.role);

/**
 * The top menu (OJ-32). Teachers get the four places they start from; import sits inside the bank, and the
 * submissions list and organizations move to the account menu, since teachers reach submissions from results.
 */
export function navItems(user: NavUser | null): NavLink[] {
  if (!user) return [{ href: '/', label: 'home' }];
  if (!isStaff(user)) {
    return [
      { href: '/', label: 'home' },
      { href: '/my-class', label: 'myClass' },
      { href: '/practice', label: 'practice' },
      { href: '/progress', label: 'progress' },
      { href: '/submissions', label: 'submissions' },
    ];
  }
  const items: NavLink[] = [
    { href: '/', label: 'home' },
    { href: '/classes', label: 'classes' },
    { href: '/bank', label: 'bank' },
    { href: '/integrity', label: 'integrity' },
  ];
  if (user.role === 'ADMIN') items.push({ href: '/admin/users', label: 'users' });
  return items;
}

/** Links in the account menu, above "sign out". Students have theirs in the top menu. */
export function accountItems(user: NavUser | null): NavLink[] {
  if (!user || !isStaff(user)) return [];
  const items: NavLink[] = [];
  if (user.role === 'ADMIN' || user.organizations.length > 0) items.push({ href: '/organizations', label: 'organizations' });
  items.push({ href: '/submissions', label: 'submissions' });
  return items;
}

/** Whether a refetch on window focus is due: at most one per `gapMs`, so switching windows does not flood the API. */
export function refreshDue(lastAt: number, now: number, gapMs: number): boolean {
  return now - lastAt >= gapMs;
}
