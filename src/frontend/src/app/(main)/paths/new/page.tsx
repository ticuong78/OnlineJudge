'use client';

import { useTranslations } from 'use-intl';
import { Container } from '@/components/app-shell';
import { RequireRole, STAFF } from '@/components/guards';
import { PathEditor } from '@/components/path-editor';
import { PageHeader } from '@/components/ui';

export default function NewPathPage() {
  const t = useTranslations('paths.editor');
  const tp = useTranslations('paths.page');
  return (
    <RequireRole roles={STAFF}>
      <Container>
        <PageHeader back={{ href: '/practice', label: tp('back') }} title={t('newTitle')} subtitle={t('subtitle')} />
        <PathEditor />
      </Container>
    </RequireRole>
  );
}
