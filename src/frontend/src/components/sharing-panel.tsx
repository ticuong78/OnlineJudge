'use client';

import type { ProblemDetailDto, SharingDto } from '@oj/contracts';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useToast } from './toast';
import { Card, Spinner } from './ui';

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-chalk-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

/** Public sharing (three levels) and, for teachers in organizations, sharing with each organization (OJ-8). */
export function SharingPanel({ problem, onChange }: { problem: ProblemDetailDto; onChange: (p: ProblemDetailDto) => void }) {
  const t = useTranslations('bank.sharing');
  const toast = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const s = problem.sharing;
  const myOrganizations = user?.organizations ?? [];

  const save = async (next: SharingDto) => {
    if (!next.isPublic) next = { ...next, publicTests: false, publicSolution: false };
    setBusy(true);
    try {
      const p = await api.updateProblemSharing(problem.id, next);
      onChange(p);
      toast.success(next.isPublic || next.organizationIds.length ? t('saved') : t('madePrivate'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold">{t('title')}</h2>
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Toggle
          checked={s.isPublic}
          disabled={busy}
          onChange={(v) => save({ ...s, isPublic: v })}
          label={t('publicLabel')}
          hint={t('publicHint')}
        />
        <Toggle
          checked={s.publicTests}
          disabled={busy || !s.isPublic}
          onChange={(v) => save({ ...s, publicTests: v })}
          label={t('testsLabel')}
          hint={t('testsHint')}
        />
        <Toggle
          checked={s.publicSolution}
          disabled={busy || !s.isPublic}
          onChange={(v) => save({ ...s, publicSolution: v })}
          label={t('solutionLabel')}
          hint={t('solutionHint')}
        />
      </div>
      {myOrganizations.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">{t('orgTitle')}</h3>
          <p className="mb-3 text-xs text-slate-500">{t('orgHint')}</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {myOrganizations.map((o) => {
              const on = s.organizationIds.includes(o.organizationId);
              return (
                <Toggle
                  key={o.organizationId}
                  checked={on}
                  disabled={busy}
                  onChange={(v) =>
                    save({
                      ...s,
                      organizationIds: v
                        ? [...s.organizationIds, o.organizationId]
                        : s.organizationIds.filter((id) => id !== o.organizationId),
                    })
                  }
                  label={o.organizationName}
                  hint={on ? t('orgOn') : t('orgOff')}
                />
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
