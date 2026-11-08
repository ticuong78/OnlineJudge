'use client';

import { LanguageLabels, type Language } from '@oj/contracts';
import { ChevronLeft, ChevronRight, Lock, RotateCcw, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CodeEditor } from '@/components/code-editor';
import { ExamTimer, useServerOffset } from '@/components/exam';
import { ProblemStatement } from '@/components/problem-statement';
import { ProblemQuestions } from '@/components/threads';
import { SessionStateBadge } from '@/components/sessions';
import { SubmissionSummary, useSubmissionPolling } from '@/components/submission-result';
import { SubmissionsTable } from '@/components/submissions-table';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, EmptyState, ErrorState, InlineAlert, inputClass, LinkButton, LoadingState, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { allowedLanguages, timerTarget } from '@/lib/exam';
import { cannotSubmitReason, sessionHref, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, CodeTemplates, MonacoLanguage, storageGet, storageSet, type LastProblem } from '@/lib/utils';
import { forgetLastProblem, writeLastProblem } from '@/lib/last-problem';
import { useAuth } from '@/lib/auth';

const LANG_KEY = 'oj:lang';
const draftKey = (sessionId: string, key: string, lang: Language) => `oj:draft:${sessionId}:${key}:${lang}`;

type LeftTab = 'statement' | 'mine';

function MySubmissions({ sessionId, problemKey, refreshKey }: { sessionId: string; problemKey: string; refreshKey: number }) {
  const { data, error, loading, reload } = useAsync(
    () => api.listSubmissions({ sessionId, problemKey, mine: true, pageSize: 50 }),
    [sessionId, problemKey, refreshKey],
  );
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.items.length === 0) return <EmptyState title="Bạn chưa nộp bài này trong phiên" />;
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
  const toast = useToast();
  const router = useRouter();

  const session = useAsync(() => api.getSession(sessionId), [sessionId]);
  const problem = useAsync(() => api.getSessionProblem(sessionId, key), [sessionId, key]);
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
  const [resultOpen, setResultOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data: result, error: pollError } = useSubmissionPolling(submissionId);

  const allowedKey = allowed.join(',');
  useEffect(() => {
    if (!session.data) return;
    const saved = storageGet(LANG_KEY) as Language | null;
    const lang = saved && allowed.includes(saved) ? saved : allowed.includes('cpp') ? 'cpp' : allowed[0];
    setLanguage(lang);
    setCode(storageGet(draftKey(sessionId, key, lang)) ?? CodeTemplates[lang]);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, key, allowedKey, !!session.data]);

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
    [sessionId, key, language],
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
      toast.error('Mã nguồn đang trống. Viết lời giải vào trình soạn thảo rồi nộp bài.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      storageSet(draftKey(sessionId, key, language), code);
      const sub = await api.submit({ sessionId, problemKey: key, language, sourceCode: code });
      setSubmissionId(sub.id);
      setResultOpen(true);
      toast.success('Đã nộp bài. Kết quả sẽ hiện bên dưới trình soạn thảo.');
      setRefreshKey((k) => k + 1);
      session.reload();
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if ((problem.loading && !problem.data) || (session.loading && !session.data) || mustStart) return <LoadingState />;
  const err = problem.error || session.error;
  if (err || !problem.data || !session.data) {
    const notFound = !!err && /không tìm thấy|not found|đã bị xóa/i.test(err);
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <ErrorState
          message={
            notFound
              ? 'Không mở được bài này. Có thể phiên đã bị xóa hoặc lớp đã bị xóa; kết quả của bạn vẫn còn trong học bạ.'
              : (err ?? 'Không tìm thấy bài')
          }
          onRetry={notFound ? undefined : () => (problem.reload(), session.reload())}
        />
        <div className="flex justify-center gap-2">
          <LinkButton href="/progress" variant="secondary">
            Mở học bạ
          </LinkButton>
          <LinkButton href="/" variant="ghost">
            Về trang chủ
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
  const target = timerTarget(s, Date.now() + offset);
  const over = timeUp && !s.canManage;
  const canSubmitNow = s.canSubmit && !over;
  const blockedReason = over
    ? 'Đã hết giờ. Bài làm của bạn vẫn hiện ở đây nhưng không nộp được nữa.'
    : s.canSubmit
      ? null
      : cannotSubmitReason(s);
  const limit = s.settings?.maxSubmissionsPerProblem ?? null;
  const used = s.myProgress?.submissionCounts?.[key] ?? 0;

  return (
    <div className="grid grid-cols-1 lg:h-[calc(100vh-3.5rem)] lg:grid-cols-2">
      {/* Left: statement */}
      <div className="flex min-h-0 flex-col border-slate-200 bg-white lg:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 pt-3 pb-2">
          <Link
            href={sessionHref(s.id)}
            className="inline-flex min-w-0 items-center gap-1 text-sm text-slate-600 hover:text-ink-700"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.title}</span>
          </Link>
          <SessionStateBadge state={s.state} />
          {solved && !s.myProgress?.resultsHidden && <span className="text-sm font-semibold text-chalk-700">Đã giải ✓</span>}
          {target && (
            <ExamTimer id={s.id} endsAt={target.endsAt} offset={offset} kind={target.kind} size="sm" onTimeUp={() => setTimeUp(true)} />
          )}
          <span className="ml-auto flex items-center gap-1">
            {prev && (
              <Link href={solveHref(s.id, prev.key)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title={`Bài trước: ${prev.title}`}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            )}
            <span className="text-xs text-slate-500 tabular-nums">
              Bài {idx + 1}/{ordered.length}
            </span>
            {next && (
              <Link href={solveHref(s.id, next.key)} className="rounded p-1 text-slate-500 hover:bg-slate-100" title={`Bài sau: ${next.title}`}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </span>
        </div>
        <Tabs
          tabs={[
            { value: 'statement', label: 'Đề bài' },
            { value: 'mine', label: 'Bài nộp của tôi' },
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

      {/* Right: editor */}
      <div className="flex min-h-0 flex-col bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
          <select
            className={cn(inputClass, 'w-auto py-1.5')}
            value={language}
            onChange={(e) => changeLanguage(e.target.value as Language)}
            aria-label="Ngôn ngữ"
          >
            {allowed.map((l) => (
              <option key={l} value={l}>
                {LanguageLabels[l]}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} title="Khôi phục mã mẫu">
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Mã mẫu</span>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {limit && !s.canManage && s.state === 'OPEN' && (
              <span className={cn('text-xs tabular-nums', used >= limit ? 'text-mark-700' : 'text-slate-500')}>
                Còn {Math.max(0, limit - used)}/{limit} lần nộp
              </span>
            )}
            {submissionId && !resultOpen && (
              <Button variant="secondary" size="sm" onClick={() => setResultOpen(true)}>
                Xem kết quả
              </Button>
            )}
            <Button onClick={submit} loading={submitting} disabled={!ready || !canSubmitNow} title={blockedReason ?? undefined}>
              {canSubmitNow ? <Send className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              Nộp bài
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
        <div className="h-[60vh] min-h-0 lg:h-auto lg:flex-1">
          {ready && (
            <CodeEditor value={code} onChange={onCodeChange} language={MonacoLanguage[language]} readOnly={over} />
          )}
        </div>

        {submissionId && resultOpen && (
          <div className="max-h-[50%] min-h-[140px] overflow-y-auto border-t-2 border-ink-200 bg-slate-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Kết quả chấm</h3>
              <div className="flex items-center gap-2">
                <Link href={`/submissions/${submissionId}`} className="text-xs text-ink-600 hover:underline">
                  Chi tiết
                </Link>
                <button
                  type="button"
                  onClick={() => setResultOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200"
                  aria-label="Đóng"
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
              <LoadingState label="Đang gửi bài..." />
            )}
            {result?.status === 'DONE' && result.verdict === 'AC' && next && (
              <div className="mt-3">
                <LinkButton href={solveHref(s.id, next.key)} size="sm">
                  Sang bài tiếp theo
                  <ChevronRight className="h-4 w-4" />
                </LinkButton>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Khôi phục mã mẫu?"
        message={`Mã hiện tại cho ${LanguageLabels[language]} sẽ bị thay bằng mã mẫu.`}
        confirmLabel="Khôi phục"
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

