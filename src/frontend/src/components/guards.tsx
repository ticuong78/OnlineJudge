'use client';

import type { Role } from '@oj/contracts';
import { ShieldAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useAuth } from '@/lib/auth';
import { LinkButton, LoadingState } from './ui';

/** Redirects to /login when not authenticated. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) return <LoadingState label={t('checkingSignIn')} />;
  return <>{children}</>;
}

/** Shows a "no permission" message if the user's role is not allowed. Must be inside RequireAuth. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const t = useTranslations('common');
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-semibold">{t('noPermission')}</h1>
        <LinkButton href="/" variant="secondary">
          {t('home')}
        </LinkButton>
      </div>
    );
  }
  return <>{children}</>;
}

export const STAFF: Role[] = ['ADMIN', 'TEACHER'];
export const ADMIN_ONLY: Role[] = ['ADMIN'];
