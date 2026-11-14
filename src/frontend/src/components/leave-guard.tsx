'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { leavesPage } from '@/lib/unsaved';
import { ConfirmDialog } from './ui';

/**
 * H1: while `dirty`, leaving the page asks first. A link inside the app opens a dialog; a reload or closing the tab
 * gets the browser's own prompt (browsers do not allow custom text there). Next.js has no route-change event, so
 * the browser's Back button is not caught here: forms that matter most keep a draft as well (see ProblemForm).
 */
/** Guards that currently hold unsaved changes. Read by actions that leave without a link, such as "Sign out". */
const holding = new Set<symbol>();

/** Whether any form on screen has unsaved changes right now. */
export function hasUnsavedChanges(): boolean {
  return holding.size > 0;
}

export function LeaveGuard({ dirty }: { dirty: boolean }) {
  const t = useTranslations('common.leave');
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const token = Symbol('unsaved');
    holding.add(token);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // On window, in the capture phase: before React (rooted at the document) runs next/link's own click handler.
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!a) return;
      const to = leavesPage(
        {
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          download: a.hasAttribute('download'),
          button: e.button,
          modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
          defaultPrevented: e.defaultPrevented,
        },
        new URL(window.location.href),
      );
      if (!to) return;
      e.preventDefault();
      // Immediate: another guard listening on window must not open a second dialog for the same click.
      e.stopImmediatePropagation();
      setPending(`${to.pathname}${to.search}${to.hash}`);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, true);
    return () => {
      holding.delete(token);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  return (
    <ConfirmDialog
      open={pending !== null}
      title={t('title')}
      message={t('body')}
      confirmLabel={t('leave')}
      cancelLabel={t('stay')}
      onConfirm={() => {
        const to = pending;
        setPending(null);
        if (to) router.push(to);
      }}
      onClose={() => setPending(null)}
    />
  );
}
