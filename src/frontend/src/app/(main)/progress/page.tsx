'use client';

import type { LearningRecordDto } from '@oj/contracts';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Container } from '@/components/app-shell';
import { Badge, Card, EmptyState, ErrorState, LinkButton, LoadingState, ProblemSetTypeBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { sessionHref, solveHref } from '@/lib/sessions';
import { useAsync } from '@/lib/use-async';
import { cn, formatDate, formatPoints } from '@/lib/utils';

type Group = LearningRecordDto['groups'][number];
type Rec = Group['sessions'][number];

const groupOrder = (g: Group) =>
  g.classId === null ? 3 : g.classStatus === 'ACTIVE' ? 0 : g.classStatus === 'ARCHIVED' ? 1 : 2;

/** One notebook cell per problem: filled = solved, red edge = tried but not accepted yet, empty = not tried. */
function ProblemCell({ rec, p }: { rec: Rec; p: Rec['problems'][number] }) {
  const tried = !p.solved && p.bestScore > 0;
  const cell = (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center border text-[10px] font-semibold tabular-nums',
        p.solved ? 'border-chalk-600 bg-chalk-600 text-white' : tried ? 'border-mark-300 bg-white text-mark-600' : 'border-rule bg-white text-slate-300',
      )}
    >
      {p.solved ? '' : tried ? `${Math.round(p.bestScore)}%` : ''}
    </span>
  );
  const title = `${p.title}: ${p.solved ? `đã giải${p.solvedAt ? ` ngày ${formatDate(p.solvedAt)}` : ''}` : tried ? `cao nhất ${formatPoints(p.bestScore)}% số điểm` : 'chưa làm'}`;
  return rec.available ? (
    <Link href={solveHref(rec.sessionId, p.key)} title={title} aria-label={title} className="focus-visible:outline-2">
      {cell}
    </Link>
  ) : (
    <span title={title} aria-label={title}>
      {cell}
    </span>
  );
}

function SessionRow({ rec }: { rec: Rec }) {
  const titleEl = rec.available ? (
    <Link href={sessionHref(rec.sessionId)} className="font-medium text-slate-900 hover:text-ink-700">
      {rec.title}
    </Link>
  ) : (
    <span className="font-medium text-slate-600">{rec.title}</span>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          {titleEl}
          {rec.completed && !rec.resultsHidden && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-chalk-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Hoàn thành{rec.completedAt ? ` ${formatDate(rec.completedAt)}` : ''}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <ProblemSetTypeBadge type={rec.type} />
          {rec.resultsHidden ? (
            <span>Kết quả hiện sau khi phiên đóng</span>
          ) : (
            <span className="tabular-nums">
              Giải {rec.solvedProblems}/{rec.totalProblems} bài, {formatPoints(rec.earnedPoints)}/{rec.totalPoints} điểm
            </span>
          )}
        </div>
      </div>
      {rec.resultsHidden ? null : (
      <div className="grid-paper flex flex-wrap gap-[3px] rounded-control p-1">
        {rec.problems.map((p) => (
          <ProblemCell key={p.key} rec={rec} p={p} />
        ))}
      </div>
      )}
    </li>
  );
}

function GroupCard({ g }: { g: Group }) {
  const deleted = g.classStatus === 'DELETED';
  const solved = g.sessions.reduce((n, s) => n + s.solvedProblems, 0);
  return (
    <Card className={cn('mb-6', deleted && 'border-dashed')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-5 py-3">
        <h2 className="text-lg font-semibold">
          {g.classId === null ? (
            'Luyện tập tự do'
          ) : deleted ? (
            `Lớp ${g.className ?? ''}`
          ) : (
            <Link href={`/my-class/${g.classId}`} className="hover:text-ink-700">
              Lớp {g.className ?? ''}
            </Link>
          )}
        </h2>
        {g.classStatus === 'ARCHIVED' && <Badge className="bg-amber-100 text-amber-800 ring-1 ring-amber-200">Đã lưu trữ</Badge>}
        {deleted && <Badge className="bg-slate-100 text-slate-600">Lớp đã bị xóa</Badge>}
        <span className="ml-auto text-sm text-slate-500 tabular-nums">{solved} bài đã giải</span>
      </div>
      {deleted && (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">Lớp đã bị xóa — chỉ còn kết quả, không mở lại được đề.</p>
      )}
      <ul className="divide-y divide-slate-100">
        {g.sessions.map((s) => (
          <SessionRow key={s.sessionId} rec={s} />
        ))}
      </ul>
    </Card>
  );
}

export default function ProgressPage() {
  const { data, error, loading, reload } = useAsync(() => api.myProgress(), []);
  if (loading && !data) return <LoadingState />;
  if (error || !data)
    return (
      <Container>
        <ErrorState message={error ?? 'Không tải được học bạ'} onRetry={reload} />
      </Container>
    );

  const groups = [...data.groups].filter((g) => g.sessions.length > 0).sort((a, b) => groupOrder(a) - groupOrder(b));
  const t = data.totals;

  return (
    <Container>
      <header className="mb-8">
        <h1 className="text-[1.75rem] leading-tight font-bold text-slate-900">Học bạ</h1>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-lg text-slate-700">
          <span>
            Đã giải <span className="mx-1 font-hand text-5xl leading-none text-chalk-700">{t.solvedProblems}</span> bài
          </span>
          <span>
            Hoàn thành <span className="mx-1 font-hand text-5xl leading-none text-chalk-700">{t.completedSessions}</span>
            {' '}/ {t.startedSessions} phiên đã bắt đầu
          </span>
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 border border-chalk-600 bg-chalk-600" /> Đã giải
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 border border-mark-300 bg-white" /> Đã thử, chưa đúng hết
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 border border-rule bg-white" /> Chưa làm
          </span>
        </p>
      </header>

      {groups.length === 0 ? (
        <Card>
          <EmptyState title="Học bạ còn trống">
            Mỗi bài bạn giải đúng sẽ được tô một ô ở đây.
            <div className="mt-3 flex justify-center gap-2">
              <LinkButton href="/my-class">Vào lớp của tôi</LinkButton>
              <LinkButton href="/practice" variant="secondary">
                Luyện tập
              </LinkButton>
            </div>
          </EmptyState>
        </Card>
      ) : (
        groups.map((g) => <GroupCard key={g.classId ?? 'public'} g={g} />)
      )}
    </Container>
  );
}
