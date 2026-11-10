'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { emptyProblem, ProblemForm } from '@/components/admin/problem-form';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

export default function NewProblemPage() {
  const t = useTranslations('bank');
  const router = useRouter();
  const toast = useToast();
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
