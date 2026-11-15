'use client';

import { LanguageLabels, type Language } from '@oj/contracts';
import { ChevronLeft, ChevronRight, FlaskConical, Lock, RotateCcw, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { CodeEditor } from '@/components/code-editor';
import { ExamTimer, useServerOffset } from '@/components/exam';
import { ProblemStatement } from '@/components/problem-statement';
import { ProblemQuestions } from '@/components/threads';
import { SessionStateBadge } from '@/components/sessions';
import { SubmissionSummary, useSubmissionPolling } from '@/components/submission-result';
import { TrialResult, useTrialPolling } from '@/components/trial-run';
import { SubmissionsTable } from '@/components/submissions-table';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, EmptyState, ErrorState, InlineAlert, inputClass, LinkButton, ListSkeleton, LoadingState, PageSkeleton, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { allowedLanguages, timerTarget } from '@/lib/exam';
import { cannotSubmitReason, sessionHref, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, CodeTemplates, MonacoLanguage, storageGet, storageSet, type LastProblem } from '@/lib/utils';
import { forgetLastProblem, writeLastProblem } from '@/lib/last-problem';
import { usePageTitle } from '@/lib/page-title';
import { clampSplit, FONT_SIZES, readFontSize, readSplit, saveFontSize, saveSplit, SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN, stepFontSize } from '@/lib/editor-prefs';
import { codeDraftKey } from '@/lib/unsaved';
import { useAuth } from '@/lib/auth';

const LANG_KEY = 'oj:lang';

type LeftTab = 'statement' | 'mine';

function MySubmissions({ sessionId, problemKey, refreshKey }: { sessionId: string; problemKey: string; refreshKey: number }) {
  const { data, error, loading, reload } = useAsync(
    () => api.listSubmissions({ sessionId, problemKey, mine: true, pageSize: 50 }),
    [sessionId, problemKey, refreshKey],
  );
  const t = useTranslations('session.solve');
  if (loading && !data) return <ListSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.items.length === 0) return <EmptyState title={t('noSubmissions')} />;
  return (
    <div className="-mx-5">
      <SubmissionsTable items={data.items} showProblem={false} dim={loading} />
    </div>
  );
}

export default function SolvePage() {
  const params = useParams<{ id: string; key: string }>();
  const sessionId = params.id;
  const key = decodeURIComponent(params.key);
  const { user } = useAuth();
  // Drafts belong to the signed-in student (shared lab computers). The page is behind the sign-in check, so the
  // account is known here.
  const userId = user?.id ?? '';
  const draftKey = (sessionId: string, key: string, lang: Language) => codeDraftKey(userId, sessionId, key, lang);
  const toast = useToast();
  const router = useRouter();
  const t = useTranslations('session');
  const tc = useTranslations('common');

  const session = useAsync(() => api.getSession(sessionId), [sessionId]);
  const problem = useAsync(() => api.getSessionProblem(sessionId, key), [sessionId, key]);
  usePageTitle(problem.data?.title);
  const offset = useServerOffset(session.data?.serverNow);
  const [timeUp, setTimeUp] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const allowed = allowedLanguages(session.data?.settings);

  // Timed session not started yet: statements are locked (403), go back to the start screen.
  const mustStart = !!session.data?.needsStart && !session.data.canManage;
  useEffect(() => {
    if (mustStart) router.replace(sessionHref(sessionId));
  }, [mustStart, router, sessionId]);

  const [tab, setTab] = useState<LeftTab>('statement');
  const [language, setLanguage] = useState<Language>('cpp');
  const [code, setCode] = useState('');
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // One panel under the editor at a time: the last submission's result or the last trial run (OJ-18).
  const [panel, setPanel] = useState<'submission' | 'trial' | null>(null);
  const resultOpen = panel === 'submission';
  const [trialId, setTrialId] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultPanel = useRef<HTMLDivElement>(null);
  // Editor comfort (OJ-17): font size and the statement/editor split, remembered on this computer.
  const [fontSize, setFontSize] = useState(14);
  const [split, setSplit] = useState(SPLIT_DEFAULT);
  useEffect(() => {
    setFontSize(readFontSize());
    setSplit(readSplit());
  }, []);
  // Functional updates: two presses within one frame must both count (a stale value counted them once).
  const changeFont = (direction: 1 | -1) =>
    setFontSize((current) => {
      const next = stepFontSize(current, direction);
      saveFontSize(next);
      return next;
    });
  const grid = useRef<HTMLDivElement>(null);
  // The key hint on Submit names the key the student will press: ⌘ on a Mac, Ctrl elsewhere (both work).
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  /** Drag the divider: the statement's share of the width follows the pointer, within SPLIT_MIN..SPLIT_MAX. */
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setSplit(clampSplit(((ev.clientX - box.left) / box.width) * 100));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveSplit(clampSplit(((ev.clientX - box.left) / box.width) * 100));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resizeByKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0;
    if (!step) return;
    e.preventDefault();
    setSplit((current) => {
      const next = clampSplit(current + step);
      saveSplit(next);
      return next;
    });
  };
  const { data: result, error: pollError } = useSubmissionPolling(submissionId);
  const { data: trial, error: trialError, slow: trialSlow } = useTrialPolling(trialId);

  // Below lg the result renders under the editor, off screen: bring it into view after Submit (UAT M1). On wide
  // screens it is docked in view already, and moving focus there would take it away from the editor.
  useEffect(() => {
    if (!panel || !resultPanel.current) return;
    if (!window.matchMedia('(max-width: 1023.98px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultPanel.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    resultPanel.current.focus({ preventScroll: true });
  }, [panel, submissionId, trialId]);

  // The finished result is taller than the "judging" placeholder scrolled to above: show all of it once it is in.
  const judged = (panel === 'submission' && result?.status === 'DONE') || (panel === 'trial' && trial?.status === 'DONE');
  useEffect(() => {
    if (!judged || !resultPanel.current) return;
    if (!window.matchMedia('(max-width: 1023.98px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultPanel.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [judged]);

  const allowedKey = allowed.join(',');
  useEffect(() => {
    if (!session.data) return;
    const saved = storageGet(LANG_KEY) as Language | null;
    const lang = saved && allowed.includes(saved) ? saved : allowed.includes('cpp') ? 'cpp' : allowed[0];
    setLanguage(lang);
    setCode(storageGet(draftKey(sessionId, key, lang)) ?? CodeTemplates[lang]);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, key, allowedKey, !!session.data, userId]);

  useEffect(() => {
    if (problem.data && session.data && user) {
      const last: LastProblem = { sessionId, key, title: problem.data.title, sessionTitle: session.data.title };
      writeLastProblem(user.id, last);
    }
  }, [problem.data, session.data, sessionId, key, user]);

  // If this problem can no longer be opened, drop it from the dashboard's "Làm tiếp" shortcut.
  useEffect(() => {
    if (problem.error && user) forgetLastProblem(user.id, sessionId, key);
  }, [problem.error, sessionId, key, user]);

  // A finished judgement may change "solved": refresh the session and my submissions.
  useEffect(() => {
    if (result?.status === 'DONE') {
      setRefreshKey((k) => k + 1);
      session.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.status]);

  const onCodeChange = useCallback(
    (v: string) => {
      setCode(v);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => storageSet(draftKey(sessionId, key, language), v), 400);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, key, language, userId],
  );

  const changeLanguage = (lang: Language) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    storageSet(draftKey(sessionId, key, language), code);
    setLanguage(lang);
    storageSet(LANG_KEY, lang);
    setCode(storageGet(draftKey(sessionId, key, lang)) ?? CodeTemplates[lang]);
  };

  const submit = async () => {
    if (!code.trim()) {
      toast.error(t('solve.emptyCode'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      storageSet(draftKey(sessionId, key, language), code);
      const sub = await api.submit({ sessionId, problemKey: key, language, sourceCode: code });
      setSubmissionId(sub.id);
      setPanel('submission');
      toast.success(t('solve.submittedToast'));
      setRefreshKey((k) => k + 1);
      session.reload();
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  /** Runs the code on the sample tests only; nothing is recorded (OJ-18). */
  const runTrial = async () => {
    if (!code.trim()) {
      toast.error(t('solve.emptyCode'));
      return;
    }
    setTrying(true);
    setSubmitError(null);
    try {
      storageSet(draftKey(sessionId, key, language), code);
      const started = await api.startTrialRun(sessionId, key, { language, sourceCode: code });
      setTrialId(started.id);
      setPanel('trial');
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setTrying(false);
    }
  };

  if ((problem.loading && !problem.data) || (session.loading && !session.data) || mustStart) return <PageSkeleton />;
  const err = problem.error || session.error;
  if (err || !problem.data || !session.data) {
    // By status, not by the error text: the text depends on the interface language.
    const notFound = (problem.error ? problem.errorStatus : session.errorStatus) === 404;
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <ErrorState
          message={
            notFound
              ? t('solve.cannotOpen')
              : (err ?? t('solve.problemNotFound'))
          }
          onRetry={notFound ? undefined : () => (problem.reload(), session.reload())}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton href="/progress" variant="secondary">
            {t('solve.openProgress')}
          </LinkButton>
          <LinkButton href="/" variant="ghost">
            {tc('home')}
          </LinkButton>
        </div>
      </div>
    );
  }
  const p = problem.data;
  const s = session.data;
  const ordered = [...s.problems].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((x) => x.key === key);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const solved = s.myProgress?.solvedKeys.includes(key);
  // No timer until the server clock is known: its first check must use server time (OJ-15 F3).
  const target = offset === null ? null : timerTarget(s, Date.now() + offset);
  const over = timeUp && !s.canManage;
  const canSubmitNow = s.canSubmit && !over;
  const blockedReason = over
    ? t('solve.timeUp')
    : s.canSubmit
      ? null
      : cannotSubmitReason(s);
  const limit = s.settings?.maxSubmissionsPerProblem ?? null;
  const used = s.myProgress?.submissionCounts?.[key] ?? 0;
  const hasSamples = p.samples.length > 0;
  const trialBusy = trying || (!!trial && trial.status !== 'DONE' && !trialError);

  return (
    <div
      ref={grid}
      className="grid grid-cols-1 lg:h-[calc(100vh-3.5rem)] lg:[grid-template-columns:var(--split)_6px_minmax(0,1fr)]"
      style={{ '--split': `${split}%` } as React.CSSProperties}
    >
      {/* Left: statement */}
      <div className="flex min-h-0 flex-col border-slate-200 bg-surface lg:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 pt-3 pb-2">
          <Link
            href={sessionHref(s.id)}
            className="inline-flex min-h-7 min-w-0 items-center gap-1 text-sm text-slate-600 hover:text-ink-700"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.title}</span>
          </Link>
          <SessionStateBadge state={s.state} />
          {solved && !s.myProgress?.resultsHidden && (
            <span className="text-sm font-semibold whitespace-nowrap text-chalk-700">{t('solvedMark')}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {prev && (
              <Link
                href={solveHref(s.id, prev.key)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                title={t('solve.prevProblem', { title: prev.title })}
                aria-label={t('solve.prevProblem', { title: prev.title })}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <span className="text-xs whitespace-nowrap text-slate-500 tabular-nums">
              {t('solve.position', { n: idx + 1, total: ordered.length })}
            </span>
            {next && (
              <Link
                href={solveHref(s.id, next.key)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                title={t('solve.nextProblem', { title: next.title })}
                aria-label={t('solve.nextProblem', { title: next.title })}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </span>
        </div>
        <Tabs
          tabs={[
            { value: 'statement', label: t('solve.tabStatement') },
            { value: 'mine', label: t('solve.tabMine') },
          ]}
          value={tab}
          onChange={setTab}
          className="px-3"
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {tab === 'statement' && (
            <>
              <ProblemStatement problem={p} samples={p.samples} points={p.points} />
              {s.audience === 'CLASS' && s.classId && (
                <ProblemQuestions
                  classId={s.classId}
                  sessionId={s.id}
                  problemKey={key}
                  canAsk={s.classStatus === 'ACTIVE'}
                  isManager={s.canManage}
                />
              )}
            </>
          )}
          {tab === 'mine' && <MySubmissions sessionId={s.id} problemKey={key} refreshKey={refreshKey} />}
        </div>
      </div>

      {/* Divider (lg and up): drag, or arrow keys when focused, to give the statement or the code more room (OJ-17). */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('solve.resizeSplit')}
        aria-valuemin={SPLIT_MIN}
        aria-valuemax={SPLIT_MAX}
        aria-valuenow={Math.round(split)}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeByKey}
        onDoubleClick={() => {
          setSplit(SPLIT_DEFAULT);
          saveSplit(SPLIT_DEFAULT);
        }}
        className="hidden cursor-col-resize touch-none bg-slate-100 transition-colors hover:bg-ink-200 focus-visible:bg-ink-200 lg:block"
      />

      {/* Right: editor */}
      <div className="flex min-h-0 flex-col bg-surface">
        {/* Below lg the columns stack, so the toolbar (with the exam clock) sticks under the header while the student
            scrolls to and through the editor (UAT M2). One timer only: it also plays the chimes. */}
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-surface px-3 py-2 lg:static">
          <select
            className={cn(inputClass, 'w-auto py-1.5')}
            value={language}
            onChange={(e) => changeLanguage(e.target.value as Language)}
            aria-label={tc('language.code')}
          >
            {allowed.map((l) => (
              <option key={l} value={l}>
                {LanguageLabels[l]}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmReset(true)}
            title={t('solve.resetHint')}
            aria-label={t('solve.resetHint')}
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('solve.template')}</span>
          </Button>
          <span className="flex items-center" role="group" aria-label={t('solve.fontSize')}>
            <Button variant="ghost" size="sm" onClick={() => changeFont(-1)} disabled={fontSize <= FONT_SIZES[0]} aria-label={t('solve.fontSmaller')} title={t('solve.fontSmaller')}>
              <span aria-hidden="true" className="text-xs font-semibold">A−</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => changeFont(1)} disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]} aria-label={t('solve.fontLarger')} title={t('solve.fontLarger')}>
              <span aria-hidden="true" className="text-sm font-semibold">A+</span>
            </Button>
          </span>
          {target && (
            <ExamTimer id={s.id} endsAt={target.endsAt} offset={offset ?? 0 /* target is null until the offset is known */} kind={target.kind} size="sm" onTimeUp={() => setTimeUp(true)} />
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {limit && !s.canManage && s.state === 'OPEN' && (
              <span className={cn('text-xs whitespace-nowrap tabular-nums', used >= limit ? 'text-mark-700' : 'text-slate-500')}>
                {t('attemptsLeft', { left: Math.max(0, limit - used), limit })}
              </span>
            )}
            {submissionId && !resultOpen && (
              <Button variant="secondary" size="sm" onClick={() => setPanel('submission')}>
                {t('solve.viewResult')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={runTrial}
              loading={trialBusy}
              disabled={!ready || !hasSamples}
              title={hasSamples ? t('trial.runHint') : t('trial.noSamples')}
            >
              <FlaskConical className="h-4 w-4 shrink-0" />
              {t('trial.run')}
            </Button>
            <Button
              onClick={submit}
              loading={submitting}
              disabled={!ready || !canSubmitNow}
              title={blockedReason ?? t('solve.submitShortcut')}
              aria-keyshortcuts="Control+Enter Meta+Enter"
            >
              {canSubmitNow ? <Send className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
              {t('solve.submit')}
              <kbd className="ml-1 hidden rounded border border-white/30 px-1 font-sans text-[11px] font-normal text-white/90 lg:inline">
                {isMac ? t('solve.submitKeysMac') : t('solve.submitKeys')}
              </kbd>
            </Button>
          </div>
        </div>
        {blockedReason && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{blockedReason}</div>
        )}
        {submitError && (
          <div className="border-b border-rule px-3 py-2">
            <InlineAlert>{submitError}</InlineAlert>
          </div>
        )}
        {/* Shorter than the screen on phones so there is page above and below it to scroll by (UAT M3). */}
        <div className="h-[50vh] min-h-0 sm:h-[60vh] lg:h-auto lg:flex-1">
          {ready && (
            <CodeEditor
              value={code}
              onChange={onCodeChange}
              language={MonacoLanguage[language]}
              readOnly={over}
              fontSize={fontSize}
              onSubmitShortcut={() => {
                if (ready && canSubmitNow && !submitting) void submit();
              }}
            />
          )}
        </div>

        {submissionId && resultOpen && (
          <div
            ref={resultPanel}
            tabIndex={-1}
            className="motion-rise max-h-[50%] min-h-[140px] scroll-mt-28 overflow-y-auto border-t-2 border-ink-200 bg-slate-50 px-4 py-3 focus:outline-none"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">{t('solve.judgeResult')}</h3>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/submissions/${submissionId}`} className="text-xs text-ink-600 hover:underline">
                  {t('solve.details')}
                </Link>
                <button
                  type="button"
                  onClick={() => setPanel(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                  aria-label={tc('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {result ? (
              <SubmissionSummary sub={result} compact points={problem.data?.points} />
            ) : pollError ? (
              <p className="text-sm text-mark-600">{pollError}</p>
            ) : (
              <LoadingState label={t('solve.sending')} />
            )}
            {result?.status === 'DONE' && result.verdict === 'AC' && next && (
              <div className="mt-3">
                <LinkButton href={solveHref(s.id, next.key)} size="sm">
                  {t('solve.goNext')}
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </LinkButton>
              </div>
            )}
          </div>
        )}

        {trialId && panel === 'trial' && (
          <div
            ref={resultPanel}
            tabIndex={-1}
            className="motion-rise max-h-[50%] min-h-[140px] scroll-mt-28 overflow-y-auto border-t-2 border-ink-200 bg-surface px-4 py-3 focus:outline-none"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">{t('trial.title')}</h3>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-200"
                aria-label={tc('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {trial ? (
              <TrialResult trial={trial} slow={trialSlow} />
            ) : trialError ? (
              <p className="text-sm text-mark-600">{trialError}</p>
            ) : (
              <LoadingState label={t('trial.pending')} />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t('solve.resetTitle')}
        message={t('solve.resetMessage', { language: LanguageLabels[language] })}
        confirmLabel={t('solve.resetConfirm')}
        onConfirm={() => {
          setCode(CodeTemplates[language]);
          storageSet(draftKey(sessionId, key, language), CodeTemplates[language]);
          setConfirmReset(false);
        }}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}

