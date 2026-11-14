'use client';

import type { OrganizationDto, UpsertOrganizationRequest } from '@oj/contracts';
import { Building2, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { cn, formatPlanDate } from '@/lib/utils';
import { Badge, Button, Field, InlineAlert, inputClass, Modal } from './ui';

/** "Until <date>" through the last day of the plan (inclusive), then "Expired since <date>". */
export function OrganizationStatus({ org }: { org: Pick<OrganizationDto, 'active' | 'activeUntil'> }) {
  const t = useTranslations('admin.organizations');
  const date = formatPlanDate(org.activeUntil);
  return (
    <Badge className={org.active ? 'bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200' : 'bg-mark-50 text-mark-700 ring-1 ring-mark-200'}>
      <span>{org.active ? t('activeUntil', { date }) : t('expiredSince', { date })}</span>
    </Badge>
  );
}

export function AiIncludedBadge({ included }: { included: boolean }) {
  const t = useTranslations('admin.organizations');
  if (!included) return null;
  return (
    <Badge className="bg-ink-50 text-ink-700 ring-1 ring-ink-200">
      <Sparkles className="h-3 w-3 shrink-0" />
      <span>{t('aiIncluded')}</span>
    </Badge>
  );
}

export function SeatsMeter({ used, seats }: { used: number; seats: number }) {
  const t = useTranslations('admin.organizations');
  const full = used >= seats;
  return (
    <span className={cn('whitespace-nowrap tabular-nums', full ? 'font-semibold text-mark-700' : 'text-slate-700')}>
      {t(full ? 'seatsFull' : 'seats', { used, seats })}
    </span>
  );
}


export function OrganizationIcon({ className }: { className?: string }) {
  return <Building2 className={className ?? 'h-4 w-4'} aria-hidden="true" />;
}

/** Name, seats, plan end date and AI: create (with the first org admin) or edit. Administrator only. */
export function OrganizationTermsModal({
  open,
  title,
  initial,
  teachers,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: UpsertOrganizationRequest;
  /** Create only: the teacher accounts to pick the first org admin from. */
  teachers?: { id: string; displayName: string; email: string }[];
  onClose: () => void;
  onSubmit: (terms: UpsertOrganizationRequest, adminUserId: string | null) => Promise<void>;
}) {
  const t = useTranslations('admin.organizations.terms');
  const tc = useTranslations('common');
  const [name, setName] = useState(initial?.name ?? '');
  const [seats, setSeats] = useState(String(initial?.seats ?? 10));
  const [activeUntil, setActiveUntil] = useState(initial?.activeUntil ?? defaultEndDate());
  const [aiIncluded, setAiIncluded] = useState(initial?.aiIncluded ?? true);
  const [adminUserId, setAdminUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    const n = Number(seats);
    if (name.trim().length < 2) return setError(t('nameMissing'));
    if (!Number.isInteger(n) || n < 1) return setError(t('seatsInvalid'));
    if (!activeUntil) return setError(t('dateMissing'));
    if (teachers && !adminUserId) return setError(t('managerMissing'));
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), seats: n, activeUntil, aiIncluded }, teachers ? adminUserId : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {error && <InlineAlert>{error}</InlineAlert>}
        <Field label={t('name')}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('seats')}>
            <input type="number" min={1} max={1000} className={inputClass} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </Field>
          <Field label={t('activeUntil')}>
            <input type="date" className={inputClass} value={activeUntil} onChange={(e) => setActiveUntil(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={aiIncluded} onChange={(e) => setAiIncluded(e.target.checked)} />
          <span>{t('ai')}</span>
        </label>
        {teachers && (
          <Field label={t('manager')}>
            <select className={inputClass} value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)}>
              <option value="">{t('pickTeacher')}</option>
              {teachers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
          </Field>
        )}
        <p className="text-xs text-slate-500">{t('note')}</p>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function defaultEndDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

