'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { emptyProblem, ProblemForm } from '@/components/admin/problem-form';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PROBLEM_DRAFT_PREFIX } from '@/lib/unsaved';

export default function NewProblemPage() {
  const t = useTranslations('bank');
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader
          back={{ href: '/bank', label: t('title') }}
          title={t('problems.create')}
          subtitle={t('problemNew.subtitle')}
        />
        <ProblemForm
          initial={emptyProblem}
          submitLabel={t('problemNew.submit')}
          withTests
          draftKey={user ? `${PROBLEM_DRAFT_PREFIX}${user.id}` : undefined}
          onSubmit={async (v, testCases) => {
            const p = await api.createProblem({ ...v, testCases });
            toast.success(t('problemNew.created', { code: p.code, count: p.testCases.length }));
            router.push(`/bank/problems/${p.id}`);
          }}
        />
      </Container>
    </RequireRole>
  );
}
