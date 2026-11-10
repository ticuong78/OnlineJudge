'use client';

import { LanguageLabels, type ProblemDetailDto } from '@oj/contracts';
import { BookmarkPlus, Send, Trash2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useTranslations } from 'use-intl';
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
  const t = useTranslations('bank');
  const router = useRouter();
  const toast = useToast();
  const [copying, setCopying] = useState(false);
  const samples = p.testCases.filter((t) => t.isSample).sort((a, b) => a.order - b.order);
  const hidden = p.testCases.filter((t) => !t.isSample);
  const notShared =
    !p.sharing.publicTests && !p.sharing.publicSolution
      ? t('problem.notSharedBoth')
      : !p.sharing.publicTests
        ? t('problem.notSharedTests')
        : !p.sharing.publicSolution
          ? t('problem.notSharedSolution')
          : null;

  const copy = async () => {
    setCopying(true);
    try {
      const c = await api.copyProblem(p.id);
      toast.success(t('problem.copied', { code: c.code }));
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
          <p className="mt-6 text-sm text-slate-600">{t('problem.hiddenTestsIncluded', { count: hidden.length })}</p>
        )}
        {p.solution && (p.solution.explanation?.trim() || p.solution.code?.trim()) && (
          <section className="mt-8 border-t border-rule pt-5">
            <h2 className="mb-2 text-base font-semibold">{t('problem.solution')}</h2>
            <Markdown>{p.solution.explanation}</Markdown>
            {p.solution.code?.trim() && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-500">
                  {p.solution.language
                    ? t('problem.sampleCodeIn', { language: LanguageLabels[p.solution.language] })
                    : t('problem.sampleCode')}
                </div>
                <CodeBlock code={p.solution.code} language={p.solution.language} />
              </div>
            )}
          </section>
        )}
      </Card>
      <Card className="self-start p-5">
        <h2 className="font-semibold">{t('saveToMyBank')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('problem.copyBody', { owner: p.ownerName })}</p>
        {notShared && (
          <div className="mt-3">
            <InlineAlert kind="warning">
              {notShared} {!p.sharing.publicTests && t('problem.samplesOnly')}
            </InlineAlert>
          </div>
        )}
        <Button className="mt-4 w-full" onClick={copy} loading={copying}>
          <BookmarkPlus className="h-4 w-4 shrink-0" />
          {t('saveToMyBank')}
        </Button>
      </Card>
    </div>
  );
}

function ProblemPage() {
  const t = useTranslations('bank');
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
        <ErrorState message={error ?? t('problem.notFound')} onRetry={reload} />
      </Container>
    );

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProblem(id);
      toast.success(t('problem.deleted'));
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
      <span>{t('ownedBy', { name: data.ownerName })}</span>
      <CopiedFrom src={data.copiedFrom} />
    </span>
  );

  if (!data.canEdit) {
    return (
      <Container wide>
        <PageHeader back={{ href: '/bank', label: t('title') }} title={title} subtitle={subtitle} />
        <PublicProblemView p={data} />
      </Container>
    );
  }

  const samples = data.testCases.filter((t) => t.isSample).sort((a, b) => a.order - b.order);

  return (
    <Container>
      <PageHeader
        back={{ href: '/bank', label: t('title') }}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {(isAdmin || data.canEdit) && (
              <Button onClick={() => setAssigning(true)}>
                <Send className="h-4 w-4 shrink-0" />
                {t('assign')}
              </Button>
            )}
            <Button variant="secondary" className="text-mark-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4 shrink-0" />
              {t('problem.delete')}
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
          { value: 'info', label: t('problem.tabInfo', { count: data.testCases.length }) },
          { value: 'statement', label: t('problem.tabStudentView') },
          { value: 'solution', label: data.solution ? t('problem.tabSolutionDone') : t('problem.tabSolution') },
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
          submitLabel={t('problem.save')}
          onSubmit={async (v) => {
            const p = await api.updateProblem(id, v);
            setData((prev) => ({ ...p, testCases: p.testCases ?? prev?.testCases ?? [], solution: p.solution ?? prev?.solution }));
            toast.success(t('problem.saved'));
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
        title={t('problem.deleteTitle')}
        message={t.rich('problem.deleteBody', { title: data.title, b: (c) => <b>{c}</b> })}
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
