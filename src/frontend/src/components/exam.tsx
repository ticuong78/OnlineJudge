'use client';

import {
  LanguageLabels,
  Languages,
  type Language,
  type SessionDto,
  type SessionSettingsDto,
} from '@oj/contracts';
import { Bell, BellOff, BellRing, ChevronDown, ChevronRight, Hourglass, ShieldCheck, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { api, errorMessage } from '@/lib/api';
import { isMuted, playChime, setMuted, unlockAudio, type ChimeKind } from '@/lib/chime';
import { FEEDBACK_MODES, feedbackLabel, formatClock, integritySummary, isExamLike, settingsSummary, TEST_PRESET } from '@/lib/exam';
import { cn, formatDateTime } from '@/lib/utils';
import { useCanUseAi, VipOnly } from './ai-access';
import { useToast } from './toast';
import { Button, ConfirmDialog, inputClass } from './ui';

// ---------- settings form ----------
const DURATION_PRESETS = [15, 45, 90];

export function SessionSettingsFields({
  value,
  onChange,
}: {
  value: SessionSettingsDto;
  onChange: (v: SessionSettingsDto) => void;
}) {
  const t = useTranslations('assign.settings');
  const tc = useTranslations('common');
  const canUseAi = useCanUseAi();
  const [open, setOpen] = useState(() => isExamLike(value) || value.checkPlagiarism || value.checkAiUsage);
  const examLike = isExamLike(value);
  // Prefilled exam settings (OJ-11) arrive after the first render; show them rather than a closed panel.
  useEffect(() => {
    if (examLike) setOpen(true);
  }, [examLike]);
  const set = <K extends keyof SessionSettingsDto>(k: K, v: SessionSettingsDto[K]) => onChange({ ...value, [k]: v });
  const allLangs = value.allowedLanguages.length === 0;

  const toggleLang = (l: Language) => {
    const cur = value.allowedLanguages.length ? value.allowedLanguages : [...Languages];
    const next = cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l];
    // Picking every language again means "all".
    set('allowedLanguages', next.length === Languages.length ? [] : next);
  };

  return (
    <div className="rounded-panel border border-rule">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="shrink-0 font-medium">{t('heading')}</span>
        <span className="ml-auto min-w-0 truncate text-xs text-slate-500">
          {isExamLike(value) ? settingsSummary(value).slice(0, 2).join(' · ') : t('defaultSummary')}
        </span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-rule px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onChange({ ...value, ...TEST_PRESET })}>
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t('testPreset')}
            </Button>
            <span className="text-xs text-slate-500">{t('testPresetHint')}</span>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('duration')}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={!value.durationMinutes} onChange={() => set('durationMinutes', null)} />
                {t('unlimited')}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={!!value.durationMinutes}
                  onChange={() => set('durationMinutes', value.durationMinutes || 45)}
                />
                <input
                  type="number"
                  min={1}
                  max={600}
                  className={cn(inputClass, 'w-20 py-1')}
                  value={value.durationMinutes ?? ''}
                  placeholder="45"
                  onChange={(e) => set('durationMinutes', e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)}
                  aria-label={t('minutesLabel')}
                />
                {t('minutesUnit')}
              </label>
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('durationMinutes', m)}
                  className={cn(
                    'rounded-full px-3 py-1 text-sm whitespace-nowrap ring-1',
                    value.durationMinutes === m ? 'bg-ink-600 text-white ring-ink-600' : 'bg-white text-slate-700 ring-rule hover:bg-ink-50',
                  )}
                >
                  {t('minutes', { count: m })}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('durationHint')}</p>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('languages')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={allLangs} onChange={() => set('allowedLanguages', allLangs ? ['cpp'] : [])} />
                {tc('all')}
              </label>
              {Languages.map((l) => (
                <label key={l} className={cn('flex items-center gap-1.5 text-sm', allLangs && 'text-slate-400')}>
                  <input
                    type="checkbox"
                    checked={allLangs || value.allowedLanguages.includes(l)}
                    disabled={allLangs}
                    onChange={() => toggleLang(l)}
                  />
                  {LanguageLabels[l]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('maxSubmissions')}</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={!value.maxSubmissionsPerProblem}
                  onChange={() => set('maxSubmissionsPerProblem', null)}
                />
                {t('unlimited')}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={!!value.maxSubmissionsPerProblem}
                  onChange={() => set('maxSubmissionsPerProblem', value.maxSubmissionsPerProblem || 3)}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={cn(inputClass, 'w-20 py-1')}
                  value={value.maxSubmissionsPerProblem ?? ''}
                  placeholder="3"
                  onChange={(e) =>
                    set('maxSubmissionsPerProblem', e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null)
                  }
                  aria-label={t('submissionsLabel')}
                />
                {t('submissionsUnit')}
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('feedback')}</legend>
            <div className="space-y-2">
              {FEEDBACK_MODES.map((f) => (
                <label key={f} className="flex items-start gap-2 text-sm">
                  <input type="radio" className="mt-1" checked={value.feedback === f} onChange={() => set('feedback', f)} />
                  <span>
                    <span className="font-medium">{feedbackLabel(f).label}</span>
                    <span className="block text-xs text-slate-500">{feedbackLabel(f).hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('feedbackNote')}</p>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">{t('integrity')}</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={value.checkPlagiarism}
                  onChange={(e) => set('checkPlagiarism', e.target.checked)}
                />
                <span>
                  <span className="font-medium">{t('plagiarism')}</span>
                  <span className="block text-xs text-slate-500">{t('plagiarismHint')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={value.checkAiUsage}
                  // Regular accounts may turn an existing check off, never on.
                  disabled={!canUseAi && !value.checkAiUsage}
                  onChange={(e) => set('checkAiUsage', e.target.checked)}
                />
                <span>
                  <span className="font-medium">{t('aiUsage')}</span>
                  {!canUseAi && <VipOnly className="ml-2" />}
                  <span className="block text-xs text-slate-500">{t('aiUsageHint')}</span>
                </span>
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('integrityNote')}</p>
          </fieldset>
        </div>
      )}
    </div>
  );
}

/** Compact rules line on the session page. */
export function SettingsInfo({ settings, manager }: { settings: SessionSettingsDto; manager?: boolean }) {
  const chips = [...(isExamLike(settings) ? settingsSummary(settings) : []), ...(manager ? integritySummary(settings) : [])];
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((t) => (
        <li key={t} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-rule">
          {t}
        </li>
      ))}
    </ul>
  );
}

// ---------- clock ----------
/** Offset (ms) to add to Date.now() to get the server's clock, from SessionDto.serverNow at fetch time. */
export function useServerOffset(serverNow: string | undefined) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!serverNow) return;
    const t = new Date(serverNow).getTime();
    if (!Number.isNaN(t)) setOffset(t - Date.now());
  }, [serverNow]);
  return offset;
}

const THRESHOLDS: ChimeKind[] = [15, 5, 1, 0];

function firedKey(id: string, endsAt: number) {
  return `oj:timer:${id}:${endsAt}`;
}
function readFired(key: string): Set<number> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as number[]);
  } catch {
    return new Set();
  }
}
function writeFired(key: string, s: Set<number>) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

/**
 * Countdown to `endsAt` (server time). Calm ink while there is time, amber in the last 5 minutes,
 * red-pen in the last minute. Chimes and toasts at 15, 5, 1 minutes and at time-up (each once).
 */
export function ExamTimer({
  id,
  endsAt,
  offset,
  kind,
  onTimeUp,
  size = 'md',
}: {
  id: string;
  endsAt: number;
  offset: number;
  kind: 'attempt' | 'deadline';
  onTimeUp?: () => void;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('assign.timer');
  const tc = useTranslations('common');
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now() + offset);
  const [muted, setMutedState] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;
  // Read through a ref so the countdown effect does not restart when the translator's identity changes.
  const textRef = useRef({ t, appName: tc('appName') });
  textRef.current = { t, appName: tc('appName') };

  useEffect(() => {
    setMutedState(isMuted());
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const key = firedKey(id, endsAt);
    const fired = readFired(key);
    // Thresholds already passed when the page opened are skipped silently (except time-up handling).
    const startLeft = endsAt - (Date.now() + offset);
    for (const t of THRESHOLDS) if (t > 0 && startLeft < t * 60_000 - 2000) fired.add(t);
    if (startLeft <= 0) {
      fired.add(0);
      onTimeUpRef.current?.();
    }
    writeFired(key, fired);

    const tick = () => {
      const n = Date.now() + offset;
      setNow(n);
      const left = endsAt - n;
      const { t: text, appName } = textRef.current;
      for (const th of THRESHOLDS) {
        if (left <= th * 60_000 && !fired.has(th)) {
          fired.add(th);
          writeFired(key, fired);
          playChime(th);
          const message = text(`chime.m${th}`);
          if (th === 0) {
            toast.error(kind === 'attempt' ? message : text('sessionClosed'));
            onTimeUpRef.current?.();
          } else toast.info(message);
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
              new Notification(appName, { body: message, tag: key });
            }
          } catch {
            /* ignore */
          }
        }
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [id, endsAt, offset, kind, toast]);

  const left = endsAt - now;
  const over = left <= 0;
  const tone = over || left <= 60_000 ? 'mark' : left <= 5 * 60_000 ? 'amber' : 'ink';
  const minutesLeft = Math.ceil(Math.max(0, left) / 60_000);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-panel border px-3',
        size === 'md' ? 'py-1.5' : 'py-1',
        tone === 'ink' && 'border-ink-200 bg-ink-50 text-ink-800',
        tone === 'amber' && 'border-amber-300 bg-amber-50 text-amber-900',
        tone === 'mark' && 'border-mark-300 bg-mark-50 text-mark-800',
      )}
      role="timer"
      aria-label={over ? t('timeUp') : t('ariaLeft', { minutes: minutesLeft })}
    >
      {over ? (
        <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="text-xs whitespace-nowrap">{over ? '' : kind === 'attempt' ? t('left') : t('closesIn')}</span>
      <span
        className={cn(
          'font-mono font-semibold whitespace-nowrap tabular-nums',
          size === 'md' ? 'text-xl' : 'text-base',
          !over && left <= 60_000 && 'motion-safe:animate-pulse',
        )}
        aria-hidden="true"
      >
        {over ? t('timeUp') : formatClock(left)}
      </span>
      <button
        type="button"
        onClick={() => {
          unlockAudio();
          setMuted(!muted);
          setMutedState(!muted);
        }}
        className="rounded p-1 hover:bg-white/70"
        aria-label={muted ? t('soundOn') : t('soundOff')}
        title={muted ? t('soundOn') : t('soundOff')}
      >
        {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </button>
      {perm === 'default' && !over && (
        <button
          type="button"
          onClick={async () => {
            try {
              setPerm(await Notification.requestPermission());
            } catch {
              /* ignore */
            }
          }}
          className="rounded p-1 hover:bg-white/70"
          aria-label={t('notify')}
          title={t('notify')}
        >
          <BellRing className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------- start screen ----------
export function StartScreen({ session, onStarted }: { session: SessionDto; onStarted: (s: SessionDto) => void }) {
  const t = useTranslations('assign.start');
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const minutes = session.settings.durationMinutes ?? 0;
  const start = async () => {
    setBusy(true);
    try {
      unlockAudio();
      const s = await api.startSession(session.id);
      setConfirm(false);
      onStarted(s);
      toast.success(t('started'));
    } catch (e) {
      toast.error(e instanceof Error && e.message ? errorMessage(e) : t('failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid-paper mx-auto max-w-xl rounded-panel border border-rule px-6 py-8 text-center">
      <Timer className="mx-auto h-8 w-8 text-ink-500" aria-hidden="true" />
      <h2 className="mt-3 text-xl font-semibold">{t('title')}</h2>
      <p className="mt-1 text-slate-700">
        {session.closesAt
          ? t.rich('introWithClose', {
              minutes,
              at: formatDateTime(session.closesAt),
              m: (c) => <b className="text-ink-700">{c}</b>,
              b: (c) => <b>{c}</b>,
            })
          : t.rich('intro', { minutes, m: (c) => <b className="text-ink-700">{c}</b> })}
      </p>
      <ul className="mx-auto mt-5 max-w-sm space-y-1.5 text-left text-sm text-slate-700">
        {settingsSummary(session.settings)
          .slice(1)
          .map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true">•</span>
              {line}
            </li>
          ))}
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          {t('size', { count: session.problems.length, points: session.totalPoints })}
        </li>
      </ul>
      <Button className="mt-6" onClick={() => setConfirm(true)} disabled={session.state !== 'OPEN'}>
        {t('button')}
      </Button>
      {session.state === 'UPCOMING' && (
        <p className="mt-2 text-sm text-amber-800">
          {session.opensAt
            ? t.rich('opensAt', { at: formatDateTime(session.opensAt), b: (c) => <b>{c}</b> })
            : t('notOpen')}
        </p>
      )}
      {session.state === 'CLOSED' && <p className="mt-2 text-sm text-amber-800">{t('closed')}</p>}
      <StartConfirm open={confirm} busy={busy} minutes={minutes} onClose={() => setConfirm(false)} onStart={start} />
    </div>
  );
}

function StartConfirm({
  open,
  busy,
  minutes,
  onClose,
  onStart,
}: {
  open: boolean;
  busy: boolean;
  minutes: number;
  onClose: () => void;
  onStart: () => void;
}) {
  const t = useTranslations('assign.start');
  return (
    <ConfirmDialog
      open={open}
      title={t('confirmTitle')}
      danger={false}
      confirmLabel={t('confirmLabel')}
      loading={busy}
      message={t.rich('confirmBody', { minutes, b: (c) => <b>{c}</b> })}
      onConfirm={onStart}
      onClose={onClose}
    />
  );
}
