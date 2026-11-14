'use client';

import type { BankScope, ProblemSummaryDto, SourceRefDto } from '@oj/contracts';
import { Building2, Globe2, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Badge } from './ui';

/** "Bài tập | Đề" tabs shared by the bank pages. */
export function BankTabs() {
  const t = useTranslations('bank.tabs');
  const pathname = usePathname() ?? '';
  const onSets = pathname.startsWith('/bank/sets');
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
        active ? 'border-ink-600 text-ink-700' : 'border-transparent text-slate-500 hover:text-slate-800',
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {tab('/bank', t('problems'), !onSets)}
      {tab('/bank/sets', t('sets'), onSets)}
    </div>
  );
}

/** "Của tôi / Công khai / Tổ chức / Tất cả" switch. `withOrganization`: problems only, for teachers in an organization. */
export function ScopeSwitch({
  value,
  onChange,
  withOrganization = false,
}: {
  value: BankScope;
  onChange: (s: BankScope) => void;
  withOrganization?: boolean;
}) {
  const t = useTranslations('bank.scope');
  const tc = useTranslations('common');
  const { user, isAdmin } = useAuth();
  const options: { v: BankScope; label: string }[] = [
    { v: 'mine', label: t('mine') },
    { v: 'public', label: t('public') },
  ];
  if (withOrganization && user?.role === 'TEACHER' && user.organizations.length > 0) options.push({ v: 'organization', label: t('organization') });
  if (isAdmin) options.push({ v: 'all', label: tc('all') });
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-control bg-slate-100 p-1 text-sm" role="radiogroup" aria-label={t('label')}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'rounded-[4px] px-3 py-1 whitespace-nowrap',
            value === o.v ? 'bg-surface font-medium ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SharingBadge({ isPublic, organizationCount = 0 }: { isPublic: boolean; organizationCount?: number }) {
  const t = useTranslations('bank.badge');
  if (!isPublic && organizationCount > 0) {
    return (
      <Badge className="bg-ink-50 text-ink-700 ring-1 ring-ink-200">
        <Building2 className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{t('organization')}</span>
      </Badge>
    );
  }
  return isPublic ? (
    <Badge className="bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200">
      <Globe2 className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
      {t('public')}
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-600">
      <Lock className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
      {t('private')}
    </Badge>
  );
}

export function CopiedFrom({ src }: { src: SourceRefDto | null }) {
  const t = useTranslations('bank');
  if (!src) return null;
  return <span className="text-xs text-slate-500">{t('copiedFrom', { code: src.code, owner: src.ownerName })}</span>;
}

/** Owner line for blueprints that are not mine. */
export function OwnerNote({ p }: { p: Pick<ProblemSummaryDto, 'ownerId' | 'ownerName'> }) {
  const t = useTranslations('bank');
  const { user } = useAuth();
  if (p.ownerId === user?.id) return null;
  return <span className="text-xs text-slate-500">{t('ownedBy', { name: p.ownerName })}</span>;
}
