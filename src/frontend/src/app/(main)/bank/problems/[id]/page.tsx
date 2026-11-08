'use client';

import { LanguageLabels, type ProblemDetailDto } from '@oj/contracts';
import { BookmarkPlus, Send, Trash2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ProblemForm } from '@/components/admin/problem-form';
import { SolutionEditor } from '@/components/admin/solution-editor';
import { TestCaseManager } from '@/components/admin/test-case-manager';
import { Container } from '@/components/app-shell';
import { CopiedFrom, SharingBadge } from '@/components/bank';
import { CodeBlock } from '@/components/code-block';
import { RequireRole, STAFF } from '@/components/guards';
import { Markdown } from '@/components/markdown';
import { ProblemStatement } from '@/components/problem-statement';
import { CreateSessionDialog } from '@/components/sessions';
import { SharingPanel } from '@/components/sharing-panel';
import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, ErrorState, InlineAlert, LoadingState, PageHeader, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/use-async';

type Tab = 'statement' | 'info' | 'solution';

/** Someone else's public problem: read-only view and "save to my bank". */
function PublicProblemView({ p }: { p: ProblemDetailDto }) {
  const router = useRouter();
  const toast = useToast();
  const [copying, setCopying] = useState(false);
  const samples = p.testCases.filter((t) => t.isSample).sort((a, b) => a.order - b.order);
  const hidden = p.testCases.filter((t) => !t.isSample);
  const missing: string[] = [];
  if (!p.sharing.publicTests) missing.push('test ẩn');
  if (!p.sharing.publicSolution) missing.push('lời giải');

  const copy = async () => {
    setCopying(true);
    try {
      const c = await api.copyProblem(p.id);
      toast.success(`Đã lưu vào ngân hàng của bạn với mã ${c.code}`);
      router.push(`/bank/problems/${c.id}${p.sharing.publicTests ? '' : '#tests'}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setCopying(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="p-6">
        <ProblemStatement problem={p} samples={samples} />
        {p.sharing.publicTests && hidden.length > 0 && (
          <p className="mt-6 text-sm text-slate-600">Kèm {hidden.length} test ẩn khi lưu về ngân hàng.</p>
        )}
        {p.solution && (p.solution.explanation?.trim() || p.solution.code?.trim()) && (
          <section className="mt-8 border-t border-rule pt-5">
            <h2 className="mb-2 text-base font-semibold">Lời giải</h2>
            <Markdown>{p.solution.explanation}</Markdown>
            {p.solution.code?.trim() && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-500">
                  Code mẫu {p.solution.language ? `(${LanguageLabels[p.solution.language]})` : ''}
                </div>
                <CodeBlock code={p.solution.code} language={p.solution.language} />
              </div>
            )}
          </section>
        )}
      </Card>
      <Card className="self-start p-5">
        <h2 className="font-semibold">Lưu vào ngân hàng của tôi</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bản sao thuộc về bạn: sửa tự do, giao cho lớp của bạn. Bài gốc của {p.ownerName} không thay đổi.
        </p>
        {missing.length > 0 && (
          <div className="mt-3">
            <InlineAlert kind="warning">
              Bài này không chia sẻ {missing.join(' và ')}.{' '}
              {!p.sharing.publicTests &&
                'Bản sao chỉ có test ví dụ, bạn cần thêm test chấm trước khi giao bài.'}
            </InlineAlert>
          </div>
        )}
        <Button className="mt-4 w-full" onClick={copy} loading={copying}>
          <BookmarkPlus className="h-4 w-4" />
          Lưu vào ngân hàng của tôi
        </Button>
      </Card>
    </div>
  );
}

function ProblemPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  // Old links used ?tab=tests; the tests now sit under the statement on the "info" tab.
  const initialTab = (params.get('tab') as Tab) || 'info';
  const [tab, setTab] = useState<Tab>(['statement', 'info', 'solution'].includes(initialTab) ? initialTab : 'info');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { data, error, loading, reload, setData } = useAsync<ProblemDetailDto>(() => api.getProblem(id), [id]);

  if (loading && !data) return <LoadingState />;
  if (error || !data)
    return (
      <Container>
        <ErrorState message={error ?? 'Không tìm thấy bài'} onRetry={reload} />
      </Container>
    );

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProblem(id);
      toast.success('Đã xóa bài');
      router.replace('/bank');
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(false);
    }
  };

  const title = (
    <>
      <span className="mr-2 text-base font-medium text-slate-400 tabular-nums">{data.code}</span>
      {data.title}
    </>
  );
  const subtitle = (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <SharingBadge isPublic={data.sharing.isPublic} organizationCount={data.sharing.organizationIds.length} />
      <span>Của {data.ownerName}</span>
      <CopiedFrom src={data.copiedFrom} />
    </span>
  );

  if (!data.canEdit) {
    return (
      <Container wide>
        <PageHeader back={{ href: '/bank', label: 'Ngân hàng' }} title={title} subtitle={subtitle} />
        <PublicProblemView p={data} />
      </Container>
    );
  }

  const samples = data.testCases.filter((t) => t.isSample).sort((a, b) => a.order - b.order);

  return (
    <Container>
      <PageHeader
        back={{ href: '/bank', label: 'Ngân hàng' }}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {(isAdmin || data.canEdit) && (
              <Button onClick={() => setAssigning(true)}>
                <Send className="h-4 w-4" />
                Giao bài
              </Button>
            )}
            <Button variant="secondary" className="text-mark-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Xóa bài
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <SharingPanel problem={data} onChange={(p) => setData((prev) => ({ ...p, testCases: p.testCases ?? prev?.testCases ?? [] }))} />
      </div>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'info', label: `Đề bài & bộ test (${data.testCases.length})` },
          { value: 'statement', label: 'Xem như học sinh' },
          { value: 'solution', label: data.solution ? 'Lời giải ✓' : 'Lời giải' },
        ]}
      />

      {tab === 'statement' && (
        <Card className="p-6">
          <ProblemStatement problem={data} samples={samples} />
        </Card>
      )}
      {tab === 'info' && (
        <ProblemForm
          key={data.id}
          initial={{
            title: data.title,
            difficulty: data.difficulty,
            tags: data.tags,
            statement: data.statement,
            inputFormat: data.inputFormat,
            outputFormat: data.outputFormat,
            constraints: data.constraints,
            timeLimitMs: data.timeLimitMs,
            memoryLimitMb: data.memoryLimitMb,
          }}
          submitLabel="Lưu bài"
          onSubmit={async (v) => {
            const p = await api.updateProblem(id, v);
            setData((prev) => ({ ...p, testCases: p.testCases ?? prev?.testCases ?? [], solution: p.solution ?? prev?.solution }));
            toast.success('Đã lưu bài');
          }}
        />
      )}
      {tab === 'info' && (
        <div id="tests" className="mt-6 scroll-mt-20">
          <TestCaseManager
            problemId={id}
            testCases={data.testCases}
            onChange={(testCases) => setData((prev) => ({ ...(prev as ProblemDetailDto), testCases, testCaseCount: testCases.length }))}
          />
        </div>
      )}
      {tab === 'solution' && (
        <SolutionEditor
          problemId={id}
          solution={data.solution}
          onChange={(solution) => setData((prev) => ({ ...(prev as ProblemDetailDto), solution, hasSolution: !!solution }))}
        />
      )}

      <CreateSessionDialog
        open={assigning}
        onClose={() => setAssigning(false)}
        source={{ kind: 'PROBLEM', problemId: data.id }}
        defaultTitle={data.title}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Xóa bài này?"
        message={
          <>
            Bài <b>{data.title}</b> sẽ bị xóa khỏi ngân hàng và khỏi các đề của bạn. Các phiên đã giao vẫn giữ bản chốt
            của bài nên học sinh làm tiếp được.
          </>
        }
        loading={deleting}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </Container>
  );
}

export default function BankProblemPage() {
  return (
    <RequireRole roles={STAFF}>
      <Suspense fallback={<LoadingState />}>
        <ProblemPage />
      </Suspense>
    </RequireRole>
  );
}
