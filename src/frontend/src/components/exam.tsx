'use client';

import {
  LanguageLabels,
  Languages,
  type FeedbackMode,
  type Language,
  type SessionDto,
  type SessionSettingsDto,
} from '@oj/contracts';
import { Bell, BellOff, BellRing, ChevronDown, ChevronRight, Hourglass, ShieldCheck, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { isMuted, playChime, setMuted, unlockAudio, type ChimeKind } from '@/lib/chime';
import { FeedbackLabels, formatClock, integritySummary, isExamLike, settingsSummary, TEST_PRESET } from '@/lib/exam';
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
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium">Chế độ thi / Cài đặt</span>
        <span className="ml-auto truncate text-xs text-slate-500">
          {isExamLike(value) ? settingsSummary(value).slice(0, 2).join(', ') : 'Mặc định: không giới hạn'}
        </span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-rule px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onChange({ ...value, ...TEST_PRESET })}>
              <ShieldCheck className="h-4 w-4" />
              Bài kiểm tra
            </Button>
            <span className="text-xs text-slate-500">45 phút, 3 lần nộp mỗi bài, chỉ hiện điểm</span>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Thời gian làm bài</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={!value.durationMinutes} onChange={() => set('durationMinutes', null)} />
                Không giới hạn
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
                  aria-label="Số phút"
                />
                phút
              </label>
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('durationMinutes', m)}
                  className={cn(
                    'rounded-full px-3 py-1 text-sm ring-1',
                    value.durationMinutes === m ? 'bg-ink-600 text-white ring-ink-600' : 'bg-white text-slate-700 ring-rule hover:bg-ink-50',
                  )}
                >
                  {m} phút
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Mỗi học sinh bấm “Bắt đầu làm bài” và có đúng chừng ấy phút, nhưng không quá giờ đóng phiên.
            </p>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Ngôn ngữ được phép</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={allLangs} onChange={() => set('allowedLanguages', allLangs ? ['cpp'] : [])} />
                Tất cả
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
            <legend className="mb-1 text-sm font-medium text-slate-700">Số lần nộp tối đa mỗi bài</legend>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={!value.maxSubmissionsPerProblem}
                  onChange={() => set('maxSubmissionsPerProblem', null)}
                />
                Không giới hạn
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
                  aria-label="Số lần nộp"
                />
                lần
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Hiển thị kết quả cho học sinh</legend>
            <div className="space-y-2">
              {(Object.keys(FeedbackLabels) as FeedbackMode[]).map((f) => (
                <label key={f} className="flex items-start gap-2 text-sm">
                  <input type="radio" className="mt-1" checked={value.feedback === f} onChange={() => set('feedback', f)} />
                  <span>
                    <span className="font-medium">{FeedbackLabels[f].label}</span>
                    <span className="block text-xs text-slate-500">{FeedbackLabels[f].hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Giáo viên luôn thấy đầy đủ. Khi phiên đóng, học sinh thấy hết.</p>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Kiểm tra liêm chính</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={value.checkPlagiarism}
                  onChange={(e) => set('checkPlagiarism', e.target.checked)}
                />
                <span>
                  <span className="font-medium">Kiểm tra đạo văn</span>
                  <span className="block text-xs text-slate-500">So sánh code giữa các học sinh trong phiên này.</span>
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
                  <span className="font-medium">Kiểm tra dùng AI</span>
                  {!canUseAi && <VipOnly className="ml-2" />}
                  <span className="block text-xs text-slate-500">
                    Claude xem từng bài nộp. Cần khóa API trên máy chủ và tốn một khoản phí nhỏ.
                  </span>
                </span>
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Kết quả chỉ là gợi ý cho giáo viên: học sinh không bao giờ thấy, và điểm không bị thay đổi.
            </p>
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
const MESSAGES: Record<ChimeKind, string> = {
  15: 'Còn 15 phút.',
  5: 'Còn 5 phút. Kiểm tra lại và nộp bài.',
  1: 'Còn 1 phút. Nộp bài ngay nếu chưa nộp.',
  0: 'Đã hết giờ. Không nộp bài được nữa.',
};

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
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now() + offset);
  const [muted, setMutedState] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

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
      for (const t of THRESHOLDS) {
        if (left <= t * 60_000 && !fired.has(t)) {
          fired.add(t);
          writeFired(key, fired);
          playChime(t);
          if (t === 0) {
            toast.error(kind === 'attempt' ? MESSAGES[0] : 'Phiên đã đóng. Không nộp bài được nữa.');
            onTimeUpRef.current?.();
          } else toast.info(MESSAGES[t]);
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
              new Notification('Online Judge', { body: t === 0 ? MESSAGES[0] : MESSAGES[t], tag: key });
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
      aria-label={over ? 'Đã hết giờ' : `Còn khoảng ${minutesLeft} phút`}
    >
      {over ? <Hourglass className="h-4 w-4" aria-hidden="true" /> : <Timer className="h-4 w-4" aria-hidden="true" />}
      <span className="text-xs">{over ? '' : kind === 'attempt' ? 'Còn' : 'Đóng sau'}</span>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          size === 'md' ? 'text-xl' : 'text-base',
          !over && left <= 60_000 && 'motion-safe:animate-pulse',
        )}
        aria-hidden="true"
      >
        {over ? 'Đã hết giờ' : formatClock(left)}
      </span>
      <button
        type="button"
        onClick={() => {
          unlockAudio();
          setMuted(!muted);
          setMutedState(!muted);
        }}
        className="rounded p-1 hover:bg-white/70"
        aria-label={muted ? 'Bật âm báo' : 'Tắt âm báo'}
        title={muted ? 'Bật âm báo' : 'Tắt âm báo'}
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
          aria-label="Nhận thông báo của trình duyệt khi sắp hết giờ"
          title="Nhận thông báo của trình duyệt khi sắp hết giờ"
        >
          <BellRing className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------- start screen ----------
export function StartScreen({ session, onStarted }: { session: SessionDto; onStarted: (s: SessionDto) => void }) {
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
      toast.success('Đã bắt đầu. Chúc bạn làm bài tốt!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không bắt đầu được. Thử lại.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid-paper mx-auto max-w-xl rounded-panel border border-rule px-6 py-8 text-center">
      <Timer className="mx-auto h-8 w-8 text-ink-500" aria-hidden="true" />
      <h2 className="mt-3 text-xl font-semibold">Phiên này tính giờ</h2>
      <p className="mt-1 text-slate-700">
        Bạn có <b className="text-ink-700">{minutes} phút</b> kể từ lúc bấm bắt đầu
        {session.closesAt ? (
          <>
            , nhưng không quá giờ đóng phiên <b>{formatDateTime(session.closesAt)}</b>
          </>
        ) : null}
        .
      </p>
      <ul className="mx-auto mt-5 max-w-sm space-y-1.5 text-left text-sm text-slate-700">
        {settingsSummary(session.settings)
          .slice(1)
          .map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden="true">•</span>
              {t}
            </li>
          ))}
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          {session.problems.length} bài, tổng {session.totalPoints} điểm
        </li>
      </ul>
      <Button className="mt-6" onClick={() => setConfirm(true)} disabled={session.state !== 'OPEN'}>
        Bắt đầu làm bài
      </Button>
      {session.state === 'UPCOMING' && (
        <p className="mt-2 text-sm text-amber-800">
          {session.opensAt ? <>Phiên mở lúc <b>{formatDateTime(session.opensAt)}</b>.</> : 'Phiên chưa mở.'}
        </p>
      )}
      {session.state === 'CLOSED' && <p className="mt-2 text-sm text-amber-800">Phiên đã đóng, không nhận bài nộp mới.</p>}
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
  return (
    <ConfirmDialog
      open={open}
      title="Bắt đầu tính giờ?"
      danger={false}
      confirmLabel="Bắt đầu"
      loading={busy}
      message={
        <>
          Đồng hồ {minutes} phút chạy ngay và <b>không tạm dừng được</b>, kể cả khi bạn đóng trang. Hết giờ thì không nộp bài
          được nữa.
        </>
      }
      onConfirm={onStart}
      onClose={onClose}
    />
  );
}
