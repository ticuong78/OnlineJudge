'use client';

import type {
  ClassroomDto,
  ProblemSetDto,
  ProblemSummaryDto,
  SessionDto,
  ProblemSetType,
  SessionSource,
  SessionSettingsDto,
  SessionState,
} from '@oj/contracts';
import { AlarmClock, Globe2, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { api, ApiError, errorMessage } from '@/lib/api';
import { DEFAULT_SETTINGS, defaultSettingsFor } from '@/lib/exam';
import { formatRemaining, formatUntil, isClosingSoon, sessionHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatDateTime, isoToLocalInput, localInputToIso } from '@/lib/utils';
import { SessionSettingsFields } from './exam';
import { MarkdownField } from './form-fields';
import { useToast } from './toast';
import {
  Badge,
  Button,
  DifficultyBadge,
  EmptyState,
  Field,
  InlineAlert,
  inputClass,
  LoadingState,
  Modal,
  ProblemSetTypeBadge,
  Tabs,
} from './ui';
import { useNow } from './verification';

// ---------- small pieces ----------
const stateClass: Record<SessionState, string> = {
  UPCOMING: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  OPEN: 'bg-chalk-50 text-chalk-700 ring-1 ring-chalk-200',
  CLOSED: 'bg-slate-100 text-slate-600',
};

export function SessionStateBadge({ state }: { state: SessionState }) {
  const t = useTranslations('enums.sessionState');
  return <Badge className={stateClass[state]}>{t(state)}</Badge>;
}

export function AudienceLabel({ s }: { s: Pick<SessionDto, 'audience' | 'className' | 'classStatus'> }) {
  const t = useTranslations('assign.audience');
  if (s.audience === 'PUBLIC')
    return (
      <span className="inline-flex items-center gap-1">
        <Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t('public')}
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t('class', { name: s.className ?? '' })}
      {s.classStatus === 'ARCHIVED' && <span className="text-slate-400">{t('archived')}</span>}
    </span>
  );
}

/** "Hạn 23:59 10/11/2026, còn 2 ngày" / "Mở lúc …" / "Đã đóng lúc …" / "Không giới hạn thời gian". */
export function SessionWindow({ s, now }: { s: Pick<SessionDto, 'state' | 'opensAt' | 'closesAt'>; now: number }) {
  const t = useTranslations('assign.window');
  if (s.state === 'UPCOMING' && s.opensAt)
    return (
      <span>
        {t('opensAt', {
          at: formatDateTime(s.opensAt),
          remaining: formatUntil(new Date(s.opensAt).getTime() - now),
        })}
      </span>
    );
  if (s.state === 'CLOSED') return <span>{s.closesAt ? t('closedAt', { at: formatDateTime(s.closesAt) }) : t('closed')}</span>;
  if (s.closesAt) {
    const soon = isClosingSoon(s, now);
    return (
      <span className={cn(soon && 'font-medium text-mark-700')}>
        {t('due', { at: formatDateTime(s.closesAt), remaining: formatRemaining(new Date(s.closesAt).getTime() - now) })}
      </span>
    );
  }
  return <span>{t('noLimit')}</span>;
}

/** One exercise-book cell per problem: filled chalk when solved (see DESIGN.md). */
export function ProgressCells({
  total,
  solved,
  size = 'sm',
  label,
}: {
  total: number;
  solved: number;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const t = useTranslations('assign.list');
  return (
    <span className="inline-flex flex-wrap gap-[3px]" role="img" aria-label={label ?? t('solvedLabel', { solved, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'border',
            size === 'sm' ? 'h-3 w-3' : 'h-5 w-5',
            i < solved ? 'border-chalk-600 bg-chalk-600' : 'border-rule bg-white',
          )}
        />
      ))}
    </span>
  );
}

/** Manager view: how many students completed the session (fetches results lazily). */
export function ClassCompletion({ sessionId, highlightIfSoon }: { sessionId: string; highlightIfSoon?: boolean }) {
  const t = useTranslations('assign.list');
  const { data, loading } = useAsync(() => api.getSessionResults(sessionId), [sessionId]);
  if (loading || !data) return <span className="text-xs text-slate-400">…</span>;
  const total = data.rows.length;
  const done = data.rows.filter((r) => r.completed).length;
  const lagging = highlightIfSoon && total > 0 && done / total < 0.5;
  return (
    <span className={cn('text-sm whitespace-nowrap tabular-nums', lagging ? 'font-semibold text-mark-700' : 'text-slate-600')}>
      {t('completion', { done, total })}
    </span>
  );
}

/** List of sessions for a class, practice page, or dashboard. */
export function SessionList({
  sessions,
  showAudience,
  managerProgress,
  emptyTitle,
  emptyHint,
}: {
  sessions: SessionDto[];
  showAudience?: boolean;
  /** Show "x/y học sinh hoàn thành" (managers) instead of my own progress. */
  managerProgress?: boolean;
  emptyTitle: string;
  emptyHint?: React.ReactNode;
}) {
  const t = useTranslations('assign.list');
  const now = useNow(30_000);
  if (sessions.length === 0) return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>;
  return (
    <ul className="divide-y divide-slate-100">
      {sessions.map((s) => {
        const soon = isClosingSoon(s, now);
        const total = s.problems.length;
        const solved = s.myProgress?.solvedKeys.length ?? 0;
        return (
          <li key={s.id} className={cn(soon && 'bg-mark-50/40')}>
            <Link href={sessionHref(s.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 font-semibold break-words text-slate-900">{s.title}</span>
                  <SessionStateBadge state={s.state} />
                  {soon && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-mark-700">
                      <AlarmClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t('closingSoon')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <ProblemSetTypeBadge type={s.type} />
                  {showAudience && <AudienceLabel s={s} />}
                  <span>{t('size', { count: total, points: s.totalPoints })}</span>
                  <SessionWindow s={s} now={now} />
                </div>
              </div>
              {managerProgress ? (
                <ClassCompletion sessionId={s.id} highlightIfSoon={soon} />
              ) : (
                s.needsStart ? (
                  <span className="text-sm font-medium whitespace-nowrap text-mark-700">
                    {s.settings.durationMinutes
                      ? t('notStartedTimed', { minutes: s.settings.durationMinutes })
                      : t('notStarted')}
                  </span>
                ) : s.myProgress?.resultsHidden ? (
                  <span className="text-sm text-slate-500">{t('resultsHidden')}</span>
                ) : (
                <span className="flex items-center gap-2">
                  <ProgressCells total={total} solved={solved} />
                  {s.myProgress?.completed ? (
                    <span className="text-sm font-semibold whitespace-nowrap text-chalk-700">{t('completed')}</span>
                  ) : (
                    <span className="text-sm text-slate-500 tabular-nums">
                      {solved}/{total}
                    </span>
                  )}
                </span>
                )
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- create / edit session ----------
const PRESET_DAYS: (number | null)[] = [7, 10, null];

function TimeFields({
  opensAt,
  closesAt,
  setOpensAt,
  setClosesAt,
}: {
  opensAt: string;
  closesAt: string;
  setOpensAt: (v: string) => void;
  setClosesAt: (v: string) => void;
}) {
  const t = useTranslations('assign.time');
  const applyPreset = (days: number | null) => {
    if (days === null) {
      setOpensAt('');
      setClosesAt('');
      return;
    }
    const start = opensAt ? new Date(opensAt) : new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 0, 0);
    setClosesAt(isoToLocalInput(end.toISOString()));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">{t('quick')}</span>
        {PRESET_DAYS.map((days) => (
          <button
            key={days ?? 'none'}
            type="button"
            onClick={() => applyPreset(days)}
            className="rounded-full bg-white px-3 py-1 whitespace-nowrap text-slate-700 ring-1 ring-rule hover:bg-ink-50 hover:text-ink-700"
          >
            {days ? t('presetDays', { days }) : t('noLimit')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('opensAt')} hint={t('opensAtHint')}>
          <input type="datetime-local" className={inputClass} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </Field>
        <Field label={t('closesAt')} hint={t('closesAtHint')}>
          <input type="datetime-local" className={inputClass} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

/** True when both times are set and the session would close before it opens. */
function closesBeforeOpen(opensAt: string, closesAt: string): boolean {
  const o = localInputToIso(opensAt);
  const c = localInputToIso(closesAt);
  return !!(o && c && new Date(c) <= new Date(o));
}

/** "Giao bài": create a session from a set or a single problem, for a class or for everyone. */
export function CreateSessionDialog({
  open,
  onClose,
  source,
  defaultTitle,
  defaultClassId,
  lockClass,
  setType,
}: {
  open: boolean;
  onClose: () => void;
  source: SessionSource | null;
  defaultTitle: string;
  defaultClassId?: string | null;
  /** Type of the set being assigned: exam and test sets start from exam settings (OJ-11). */
  setType?: ProblemSetType;
  /** Hide the class choice (e.g. when assigning from a class page). */
  lockClass?: boolean;
}) {
  const t = useTranslations('assign.create');
  const tt = useTranslations('assign.time');
  const tc = useTranslations('common');
  const toast = useToast();
  const router = useRouter();
  const classes = useAsync(() => api.listClasses(), [], open);
  const active = useMemo(() => (classes.data ?? []).filter((c) => c.status === 'ACTIVE'), [classes.data]);
  const [target, setTarget] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [settings, setSettings] = useState<SessionSettingsDto>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  // The session this problem or set was already given in, when the API refuses to assign it again.
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSettings(defaultSettingsFor(setType));
    setTitle(defaultTitle);
    setDescription('');
    setOpensAt('');
    setClosesAt('');
    setError(null);
    setExistingId(null);
    setTarget(defaultClassId ?? '');
  }, [open, defaultTitle, defaultClassId, setType]);

  useEffect(() => {
    if (open && !target && !defaultClassId && active.length > 0) setTarget(active[0].id);
  }, [open, target, defaultClassId, active]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!source || saving) return;
    setError(null);
    setExistingId(null);
    if (!target) return setError(t('needTarget'));
    if (closesBeforeOpen(opensAt, closesAt)) return setError(tt('closeAfterOpen'));
    setSaving(true);
    try {
      const s = await api.createSession({
        source,
        classId: target === 'PUBLIC' ? null : target,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        opensAt: localInputToIso(opensAt),
        closesAt: localInputToIso(closesAt),
        settings,
      });
      toast.success(s.audience === 'PUBLIC' ? t('assignedPublic') : t('assignedClass', { name: s.className ?? '' }));
      onClose();
      router.push(sessionHref(s.id));
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'assessment.already_assigned') setExistingId(err.details?.sessionId ?? null);
    } finally {
      setSaving(false);
    }
  };

  const chosenClass = active.find((c) => c.id === target);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('title')}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => submit()} loading={saving} disabled={!source}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">{t('frozenNote')}</p>
        {lockClass && chosenClass ? (
          <p className="text-sm">{t.rich('lockedClass', { name: chosenClass.name, b: (c) => <b>{c}</b> })}</p>
        ) : (
          <Field label={t('target')}>
            {classes.loading && !classes.data ? (
              <LoadingState label={t('loadingClasses')} />
            ) : (
              <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="" disabled>
                  {t('pickClass')}
                </option>
                {active.map((c: ClassroomDto) => (
                  <option key={c.id} value={c.id}>
                    {t('classOption', { name: c.name })}
                  </option>
                ))}
                <option value="PUBLIC">{t('publicOption')}</option>
              </select>
            )}
          </Field>
        )}
        <Field label={t('sessionTitle')}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <MarkdownField label={t('instructions')} value={description} onChange={setDescription} rows={3} />
        <TimeFields opensAt={opensAt} closesAt={closesAt} setOpensAt={setOpensAt} setClosesAt={setClosesAt} />
        {(setType === 'EXAM' || setType === 'TEST') && (
          <p className="text-xs text-slate-500">{setType === 'EXAM' ? t('prefilledExam') : t('prefilledTest')}</p>
        )}
        <SessionSettingsFields value={settings} onChange={setSettings} />
        {error && (
          <InlineAlert>
            {error}
            {existingId && (
              <Link href={sessionHref(existingId)} onClick={onClose} className="ml-1 font-medium underline">
                {t('openExisting')}
              </Link>
            )}
          </InlineAlert>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function EditSessionDialog({
  open,
  onClose,
  session,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  session: SessionDto;
  onSaved: (s: SessionDto) => void;
}) {
  const t = useTranslations('assign.edit');
  const tCreate = useTranslations('assign.create');
  const tt = useTranslations('assign.time');
  const tc = useTranslations('common');
  const toast = useToast();
  const [title, setTitle] = useState(session.title);
  const [description, setDescription] = useState(session.description);
  const [opensAt, setOpensAt] = useState(isoToLocalInput(session.opensAt));
  const [closesAt, setClosesAt] = useState(isoToLocalInput(session.closesAt));
  const [settings, setSettings] = useState<SessionSettingsDto>(session.settings ?? DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(session.title);
    setDescription(session.description);
    setOpensAt(isoToLocalInput(session.opensAt));
    setClosesAt(isoToLocalInput(session.closesAt));
    setSettings(session.settings ?? DEFAULT_SETTINGS);
    setError(null);
  }, [open, session]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!title.trim()) return setError(t('needTitle'));
    if (closesBeforeOpen(opensAt, closesAt)) return setError(tt('closeAfterOpen'));
    setSaving(true);
    try {
      const s = await api.updateSession(session.id, {
        title: title.trim(),
        description,
        opensAt: localInputToIso(opensAt),
        closesAt: localInputToIso(closesAt),
        settings,
      });
      toast.success(t('saved'));
      onSaved(s);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('title')}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={tCreate('sessionTitle')}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <MarkdownField label={t('instructions')} value={description} onChange={setDescription} rows={3} />
        <TimeFields opensAt={opensAt} closesAt={closesAt} setOpensAt={setOpensAt} setClosesAt={setClosesAt} />
        <SessionSettingsFields value={settings} onChange={setSettings} />
        {error && <InlineAlert>{error}</InlineAlert>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ---------- pick something from my bank, then create a session ----------
export function AssignFromBankDialog({
  open,
  onClose,
  classId,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
}) {
  const t = useTranslations('assign.fromBank');
  const tl = useTranslations('assign.list');
  const [tab, setTab] = useState<'sets' | 'problems'>('sets');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ source: SessionSource; title: string } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    if (open) setPicked(null);
  }, [open]);

  const sets = useAsync<ProblemSetDto[]>(() => api.listProblemSets('mine'), [], open && tab === 'sets');
  const problems = useAsync(
    () => api.listProblems({ scope: 'mine', search, pageSize: 30 }),
    [search],
    open && tab === 'problems',
  );
  const filteredSets = (sets.data ?? []).filter((s) => !search || s.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Modal open={open && !picked} onClose={onClose} title={t('title')} wide>
        <Tabs
          className="mb-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'sets', label: t('tabSets') },
            { value: 'problems', label: t('tabProblems') },
          ]}
        />
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(inputClass, 'pl-9')}
            placeholder={tab === 'sets' ? t('searchSets') : t('searchProblems')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {tab === 'sets' ? (
          sets.loading && !sets.data ? (
            <LoadingState />
          ) : filteredSets.length === 0 ? (
            <EmptyState title={t('noSets')}>
              <Link href="/bank/sets/new" className="text-ink-600 hover:underline">
                {t('createSet')}
              </Link>
            </EmptyState>
          ) : (
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-control border border-rule">
              {filteredSets.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
                    onClick={() => setPicked({ source: { kind: 'SET', setId: s.id }, title: s.title })}
                  >
                    <ProblemSetTypeBadge type={s.type} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                    <span className="shrink-0 text-sm whitespace-nowrap text-slate-500">
                      {tl('size', { count: s.items.length, points: s.totalPoints })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : problems.loading && !problems.data ? (
          <LoadingState />
        ) : !problems.data || problems.data.items.length === 0 ? (
          <EmptyState title={t('noProblems')} />
        ) : (
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-control border border-rule">
            {problems.data.items.map((p: ProblemSummaryDto) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50"
                  onClick={() => setPicked({ source: { kind: 'PROBLEM', problemId: p.id }, title: p.title })}
                >
                  <span className="w-14 shrink-0 truncate text-xs text-slate-500 tabular-nums">{p.code}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <DifficultyBadge difficulty={p.difficulty} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <CreateSessionDialog
        open={open && !!picked}
        onClose={() => {
          setPicked(null);
          onClose();
        }}
        source={picked?.source ?? null}
        defaultTitle={picked?.title ?? ''}
        defaultClassId={classId}
        lockClass
      />
    </>
  );
}
