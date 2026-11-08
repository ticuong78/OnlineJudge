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
import { useState, type ReactNode } from 'react';
import { RoleLabels, useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  /** Extra condition on the signed-in user (e.g. teachers who belong to an organization). */
  when?: (user: UserDto) => boolean;
}

const STAFF_ROLES: Role[] = ['ADMIN', 'TEACHER'];
const NAV: NavItem[] = [
  { href: '/', label: 'Trang chủ', icon: Home },
  { href: '/bank', label: 'Ngân hàng', icon: Library, roles: STAFF_ROLES },
  { href: '/classes', label: 'Lớp', icon: School, roles: STAFF_ROLES },
  { href: '/my-class', label: 'Lớp của tôi', icon: School, roles: ['STUDENT'] },
  { href: '/practice', label: 'Luyện tập', icon: Dumbbell, roles: ['STUDENT'] },
  { href: '/progress', label: 'Học bạ', icon: NotebookPen, roles: ['STUDENT'] },
  { href: '/import', label: 'Nhập đề', icon: FileUp, roles: STAFF_ROLES },
  { href: '/integrity', label: 'Cần xem lại', icon: ShieldAlert, roles: STAFF_ROLES },
  {
    href: '/organizations',
    label: 'Tổ chức',
    icon: Building2,
    roles: STAFF_ROLES,
    when: (u) => u.role === 'ADMIN' || u.organizations.length > 0,
  },
  { href: '/submissions', label: 'Bài nộp', icon: Send },
  { href: '/admin/users', label: 'Người dùng', icon: Users, roles: ['ADMIN'] },
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

  const items = NAV.filter((i) => !i.roles || (user && i.roles.includes(user.role) && (!i.when || i.when(user))));

  const doLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-600 text-white">
              <Code2 className="h-4 w-4" />
            </span>
            {/* Hidden at lg, where the full menu needs the room; back from xl. */}
            <span className="hidden sm:inline lg:hidden xl:inline">Online Judge</span>
          </Link>

          {/* Inline from lg (1024px): with seven items (admin) the labels do not fit on one line below that. */}
          <nav className="hidden flex-1 items-center gap-1 lg:flex">
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
                <i.icon className="h-4 w-4" />
                <span>{i.label}</span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 lg:flex">
            {user && (
              <div className="hidden text-right leading-tight xl:block">
                <div className="text-sm font-medium text-slate-800">{user.displayName}</div>
                <div className="text-xs text-slate-500">{RoleLabels[user.role]}</div>
              </div>
            )}
            <button
              type="button"
              onClick={doLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden xl:inline">Đăng xuất</span>
            </button>
          </div>

          <button
            type="button"
            className="ml-auto rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <nav className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden">
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
                <i.icon className="h-4 w-4" />
                {i.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-sm text-slate-600">
                {user?.displayName}, {user && RoleLabels[user.role]}
              </span>
              <button type="button" onClick={doLogout} className="flex items-center gap-1 text-sm text-mark-600">
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </button>
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
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
