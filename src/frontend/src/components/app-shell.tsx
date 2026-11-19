'use client';

import {
  Building2,
  ChevronDown,
  Code2,
  Dumbbell,
  Home,
  Library,
  LogOut,
  Menu,
  NotebookPen,
  School,
  Send,
  ShieldAlert,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { accountItems, navItems, refreshDue, type NavKey } from '@/lib/nav';
import { hasUnsavedChanges } from './leave-guard';
import { LocaleSwitch } from './locale-switch';
import { ThemeSwitch } from './theme-switch';
import { ConfirmDialog, CountBadge } from './ui';
import { pageTitle } from '@/lib/page-title';
import { containerClass, PAGE_GUTTER } from '@/lib/layout';
import { cn } from '@/lib/utils';

const ICONS: Record<NavKey, LucideIcon> = {
  home: Home,
  bank: Library,
  classes: School,
  myClass: School,
  practice: Dumbbell,
  progress: NotebookPen,
  integrity: ShieldAlert,
  organizations: Building2,
  submissions: Send,
  users: Users,
};

/** Sent by pages that change the number of open integrity flags, so the menu badge follows without a reload. */
export const INTEGRITY_CHANGED = 'oj:integrity-changed';

/** Window focus refreshes the flag count at most once a minute; a page reporting a change always refreshes it. */
const FOCUS_REFRESH_MS = 60_000;

/**
 * Open integrity flags for the "Cần xem lại" badge (OJ-32). Fetched on mount, when a page reports a change, and on
 * window focus at most once a minute; never on a timer. Only the latest call may set the count, so a slow reply
 * cannot overwrite a newer one. Errors leave the badge off rather than show a wrong number.
 */
function useOpenFlagCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const lastCall = useRef(0);
  const lastAt = useRef(0);
  const load = useCallback(
    (force: boolean) => {
      if (!enabled) return;
      const now = Date.now();
      if (!force && !refreshDue(lastAt.current, now, FOCUS_REFRESH_MS)) return;
      lastAt.current = now;
      const call = ++lastCall.current;
      api.listIntegrityFlags({ status: 'OPEN' }).then(
        (f) => call === lastCall.current && setCount(f.length),
        () => call === lastCall.current && setCount(0),
      );
    },
    [enabled],
  );
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    load(true);
    const onFocus = () => load(false);
    const onChanged = () => load(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener(INTEGRITY_CHANGED, onChanged);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(INTEGRITY_CHANGED, onChanged);
    };
  }, [enabled, load]);
  return count;
}

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

  const items = navItems(user);
  const account = accountItems(user);
  const isStaffUser = user?.role === 'ADMIN' || user?.role === 'TEACHER';
  const openFlags = useOpenFlagCount(isStaffUser);
  // At most five items since OJ-32, so the inline menu fits from lg (1024px) in both languages. The brand name and the
  // name on the account button join at xl, where there is room for them too.
  const bp = { show: 'lg:flex', hide: 'lg:hidden', brand: 'hidden sm:inline lg:hidden xl:inline', who: 'hidden xl:block' };
  const label = (key: NavKey) => (
    <>
      <span>{t(`nav.${key}`)}</span>
      {key === 'integrity' && <CountBadge count={openFlags} label={t('openFlags', { count: openFlags })} />}
    </>
  );

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
        <div className={cn('mx-auto flex h-14 max-w-7xl items-center gap-4', PAGE_GUTTER)}>
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
                <Icon name={i.label} />
                {label(i.label)}
              </Link>
            ))}
          </nav>

          <div className={cn('ml-auto hidden items-center gap-3', bp.show)}>
            <ThemeSwitch />
            <LocaleSwitch />
            {user && account.length > 0 && (
              <AccountMenu
                name={user.displayName}
                role={tRole(user.role)}
                items={account}
                nameClass={bp.who}
                onSignOut={doLogout}
              />
            )}
            {/* Students have nothing else in an account menu, so they keep the name and a one-click sign out. */}
            {user && account.length === 0 && (
              <>
                <div className={cn('text-right leading-tight', bp.who)}>
                  <div className="max-w-40 truncate text-sm font-medium text-slate-800" title={user.displayName}>
                    {user.displayName}
                  </div>
                  <div className="text-xs whitespace-nowrap text-slate-500">{tRole(user.role)}</div>
                </div>
                <button
                  type="button"
                  onClick={doLogout}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  title={t('signOut')}
                  aria-label={t('signOut')}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span className="hidden whitespace-nowrap xl:inline">{t('signOut')}</span>
                </button>
              </>
            )}
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
                <Icon name={i.label} />
                {label(i.label)}
              </Link>
            ))}
            {account.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                {account.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                      isActive(pathname, i.href) ? 'bg-ink-50 text-ink-700' : 'text-slate-700',
                    )}
                  >
                    <Icon name={i.label} />
                    {t(`nav.${i.label}`)}
                  </Link>
                ))}
              </div>
            )}
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

function Icon({ name }: { name: NavKey }) {
  const I = ICONS[name];
  return <I className="h-4 w-4 shrink-0" />;
}

/**
 * Name, role, the links teachers seldom start from, and sign out (OJ-32). A disclosure, not an ARIA menu: plain links
 * in tab order. Escape or a click outside closes it and Escape returns focus to the button.
 */
function AccountMenu({
  name,
  role,
  items,
  nameClass,
  onSignOut,
}: {
  name: string;
  role: string;
  items: { href: string; label: NavKey }[];
  nameClass: string;
  onSignOut: () => void;
}) {
  const t = useTranslations('shell');
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  return (
    <div
      className="relative"
      // Tabbing out of the menu closes it, as a click outside does.
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={t('account', { name })}
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-100"
      >
        <UserRound className="h-5 w-5 shrink-0 text-slate-500" />
        <span className={cn('leading-tight', nameClass)}>
          <span className="block max-w-40 truncate text-sm font-medium text-slate-800">{name}</span>
          <span className="block text-xs whitespace-nowrap text-slate-500">{role}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          ref={panel}
          id="account-menu"
          className="motion-drop absolute right-0 top-full z-50 mt-1 w-60 rounded-panel border border-rule bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 pt-1 pb-2 text-sm">
            <div className="truncate font-medium text-slate-800">{name}</div>
            <div className="text-xs text-slate-500">{role}</div>
          </div>
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              // Closes on a link to the page already open too, where the path does not change.
              onClick={() => setOpen(false)}
              className={cn(
                'mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                isActive(pathname, i.href) ? 'bg-ink-50 text-ink-700' : 'text-slate-700 hover:bg-slate-100',
              )}
            >
              <Icon name={i.label} />
              {t(`nav.${i.label}`)}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-mark-600 hover:bg-mark-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Standard page container (sizes in `containerClass`, OJ-35). The width rule (OJ-34): every page is normal. `wide` is only for a page
 * whose main content is a table or editor that needs it:
 * - the class page, which stays constant across its tabs so they do not jump (OJ-32);
 * - the set editor and the problem editor's wide view;
 * - the results board when the session has more than 4 problems (`resultsWide`).
 */
export function Container({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn(containerClass(!!wide), className)}>
      {children}
    </div>
  );
}
