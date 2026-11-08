'use client';

import type { BankScope, ProblemSummaryDto, SourceRefDto } from '@oj/contracts';
import { Building2, Globe2, Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Badge } from './ui';

/** "Bài tập | Đề" tabs shared by the bank pages. */
export function BankTabs() {
  const pathname = usePathname() ?? '';
  const onSets = pathname.startsWith('/bank/sets');
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
        active ? 'border-ink-600 text-ink-700' : 'border-transparent text-slate-500 hover:text-slate-800',
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {tab('/bank', 'Bài tập', !onSets)}
      {tab('/bank/sets', 'Đề', onSets)}
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
  const { user, isAdmin } = useAuth();
  const options: { v: BankScope; label: string }[] = [
    { v: 'mine', label: 'Của tôi' },
    { v: 'public', label: 'Công khai' },
  ];
  if (withOrganization && user?.role === 'TEACHER' && user.organizations.length > 0) options.push({ v: 'organization', label: 'Tổ chức' });
  if (isAdmin) options.push({ v: 'all', label: 'Tất cả' });
  return (
    <div className="inline-flex rounded-control bg-slate-100 p-1 text-sm" role="radiogroup" aria-label="Phạm vi">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'rounded-[4px] px-3 py-1',
            value === o.v ? 'bg-white font-medium ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SharingBadge({ isPublic, organizationCount = 0 }: { isPublic: boolean; organizationCount?: number }) {
  if (!isPublic && organizationCount > 0) {
    return (
      <Badge className="bg-ink-50 text-ink-700 ring-1 ring-ink-200">
        <Building2 className="mr-1 h-3 w-3" aria-hidden="true" />
        <span>Trong tổ chức</span>
      </Badge>
    );
  }
  return isPublic ? (
    <Badge className="bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200">
      <Globe2 className="mr-1 h-3 w-3" aria-hidden="true" />
      Công khai
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-600">
      <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
      Riêng tư
    </Badge>
  );
}

export function CopiedFrom({ src }: { src: SourceRefDto | null }) {
  if (!src) return null;
  return (
    <span className="text-xs text-slate-500">
      Dựa trên {src.code} của {src.ownerName}
    </span>
  );
}

/** Owner line for blueprints that are not mine. */
export function OwnerNote({ p }: { p: Pick<ProblemSummaryDto, 'ownerId' | 'ownerName'> }) {
  const { user } = useAuth();
  if (p.ownerId === user?.id) return null;
  return <span className="text-xs text-slate-500">Của {p.ownerName}</span>;
}
