'use client';

import type { Role, UserDto } from '@oj/contracts';
import {
  Code2,
  Dumbbell,
  Library,
  NotebookPen,
  FileUp,
  Home,
  LogOut,
  Menu,
  School,
  Send,
  ShieldAlert,
  Building2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useAuth } from '@/lib/auth';
import type { Messages } from '@/i18n/messages';
import { hasUnsavedChanges } from './leave-guard';
import { LocaleSwitch } from './locale-switch';
import { ThemeSwitch } from './theme-switch';
import { ConfirmDialog } from './ui';
import { pageTitle } from '@/lib/page-title';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: keyof Messages['shell']['nav'];
  icon: LucideIcon;
  roles?: Role[];
  /** Extra condition on the signed-in user (e.g. teachers who belong to an organization). */
  when?: (user: UserDto) => boolean;
}

const STAFF_ROLES: Role[] = ['ADMIN', 'TEACHER'];
const NAV: NavItem[] = [
  { href: '/', label: 'home', icon: Home },
  { href: '/bank', label: 'bank', icon: Library, roles: STAFF_ROLES },
  { href: '/classes', label: 'classes', icon: School, roles: STAFF_ROLES },
  { href: '/my-class', label: 'myClass', icon: School, roles: ['STUDENT'] },
  { href: '/practice', label: 'practice', icon: Dumbbell, roles: ['STUDENT'] },
  { href: '/progress', label: 'progress', icon: NotebookPen, roles: ['STUDENT'] },
  { href: '/import', label: 'import', icon: FileUp, roles: STAFF_ROLES },
  { href: '/integrity', label: 'integrity', icon: ShieldAlert, roles: STAFF_ROLES },
  {
    href: '/organizations',
    label: 'organizations',
    icon: Building2,
    roles: STAFF_ROLES,
    when: (u) => u.role === 'ADMIN' || u.organizations.length > 0,
  },
  { href: '/submissions', label: 'submissions', icon: Send },
  { href: '/admin/users', label: 'users', icon: Users, roles: ['ADMIN'] },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const t = useTranslations('shell');
  const tRole = useTranslations('enums.role');

  const menuButton = useRef<HTMLButtonElement>(null);

  // A page that sets no title of its own must not keep the previous page's (M9). Layout effects run before the
  // page's own effects, so a page's usePageTitle still wins.
  useLayoutEffect(() => {
    document.title = pageTitle(null);
  }, [pathname]);

  // The menu floats over the page, so it must not stay open on the next page or block the keyboard.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus(); // L6: back where the keyboard user was.
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const items = NAV.filter((i) => !i.roles || (user && i.roles.includes(user.role) && (!i.when || i.when(user))));
  // Up to seven items plus the language switch fit on one line from lg (1024px), in both languages. The administrator's
  // eight do not (measured: 58px too wide in Vietnamese), so for them the inline menu starts at xl (1280px).
  // The name block and the sign-out label join once there is room: xl for seven items, 2xl for eight.
  // Exactly seven (a teacher in an organization) is 40px short at 1280 to 1319px: the brand and the name wrapped onto
  // two lines there (UAT M4), so for seven they join at 1320px instead of xl.
  const bp = items.length > 7
    ? { show: 'xl:flex', hide: 'xl:hidden', brand: 'hidden sm:inline', who: 'hidden 2xl:block', signOut: 'hidden 2xl:inline' }
    : items.length === 7
      ? { show: 'lg:flex', hide: 'lg:hidden', brand: 'hidden sm:inline lg:hidden min-[82.5rem]:inline', who: 'hidden min-[82.5rem]:block', signOut: 'hidden min-[82.5rem]:inline' }
      : { show: 'lg:flex', hide: 'lg:hidden', brand: 'hidden sm:inline lg:hidden xl:inline', who: 'hidden xl:block', signOut: 'hidden xl:inline' };

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const signOut = () => {
    setConfirmSignOut(false);
    logout();
    router.replace('/login');
  };
  // "Sign out" is a button, not a link, so the editors' leave guard never sees it; and sign-out also deletes problem
  // drafts. Ask first, or a half-written problem is gone with no warning (review of OJ-13).
  const doLogout = () => (hasUnsavedChanges() ? setConfirmSignOut(true) : signOut());

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header no-print sticky top-0 z-40 border-b border-slate-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold whitespace-nowrap text-slate-900" aria-label={t('homeLink')}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-solid text-white">
              <Code2 className="h-4 w-4" />
            </span>
            {/* Hidden at lg, where the full menu needs the room; back from xl. */}
            <span className={bp.brand}>Online Judge</span>
          </Link>

          {/* Inline from lg or xl (see bp above); below that the menu button opens the same items. */}
          <nav className={cn('hidden flex-1 items-center gap-1', bp.show)}>
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors xl:px-3',
                  isActive(pathname, i.href)
                    ? 'bg-ink-50 text-ink-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <i.icon className="h-4 w-4 shrink-0" />
                <span>{t(`nav.${i.label}`)}</span>
              </Link>
            ))}
          </nav>

          <div className={cn('ml-auto hidden items-center gap-3', bp.show)}>
            <ThemeSwitch />
            <LocaleSwitch />
            {user && (
              <div className={cn('text-right leading-tight', bp.who)}>
                <div className="max-w-40 truncate text-sm font-medium text-slate-800" title={user.displayName}>
                  {user.displayName}
                </div>
                <div className="text-xs whitespace-nowrap text-slate-500">{tRole(user.role)}</div>
              </div>
            )}
            <button
              type="button"
              onClick={doLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              title={t('signOut')}
              aria-label={t('signOut')}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={cn('whitespace-nowrap', bp.signOut)}>{t('signOut')}</span>
            </button>
          </div>

          <button
            ref={menuButton}
            type="button"
            className={cn('ml-auto rounded-lg p-2 text-slate-600 hover:bg-slate-100', bp.hide)}
            onClick={() => setOpen((o) => !o)}
            aria-label={t('menu')}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          // Floats over the page (the sticky header is its positioning context) instead of pushing the content down.
          <nav
            className={cn(
              'motion-drop absolute inset-x-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-slate-200 bg-surface px-4 py-2 shadow-lg',
              bp.hide,
            )}
          >
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive(pathname, i.href) ? 'bg-ink-50 text-ink-700' : 'text-slate-700',
                )}
              >
                <i.icon className="h-4 w-4 shrink-0" />
                {t(`nav.${i.label}`)}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="min-w-0 truncate text-sm text-slate-600">
                {user?.displayName}, {user && tRole(user.role)}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <ThemeSwitch />
                <LocaleSwitch />
              </span>
            </div>
            <button
              type="button"
              onClick={doLogout}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-mark-600 hover:bg-mark-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {t('signOut')}
            </button>
          </nav>
        )}
      </header>
      {open && (
        // Dims the page under the menu; tapping it closes the menu. Outside the header: its backdrop-blur would
        // make it the containing block of a fixed element and shrink this to the header's height.
        <div
          className={cn('motion-fade fixed inset-x-0 bottom-0 top-14 z-30 bg-scrim/20', bp.hide)}
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <main className="flex-1">{children}</main>
      <ConfirmDialog
        open={confirmSignOut}
        title={t('signOutUnsaved.title')}
        message={t('signOutUnsaved.body')}
        confirmLabel={t('signOut')}
        cancelLabel={t('signOutUnsaved.stay')}
        onConfirm={signOut}
        onClose={() => setConfirmSignOut(false)}
      />
    </div>
  );
}

/** Standard page container. */
export function Container({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn('mx-auto w-full px-4 py-6', wide ? 'max-w-[1400px]' : 'max-w-6xl', className)}>
      {children}
    </div>
  );
}
