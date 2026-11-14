import { useEffect } from 'react';
import { tr } from '@/i18n/runtime';

/** "Title | Online Judge", like the root layout's metadata template, so tabs and history tell pages apart (M9). */
export function pageTitle(title: string | null | undefined): string {
  const app = tr()('common.appName');
  const t = title?.trim();
  return t ? `${t} | ${app}` : app;
}

/**
 * Sets the tab title while the page is shown. Pages that use PageHeader get this from it.
 * Next.js writes the root layout's metadata title again on some navigations (seen after `router.replace` to the same
 * path), after this page's effects have run; the observer puts the page's title back when that happens.
 */
export function usePageTitle(title: string | null | undefined) {
  const wanted = pageTitle(title);
  useEffect(() => {
    // The newest mounted owner sets the title; when it goes, the one below it takes over again. Only the top one acts,
    // so two headers on one screen can never undo each other in a loop.
    const entry = { title: wanted };
    owners.push(entry);
    const apply = () => {
      const top = owners[owners.length - 1];
      if (top && document.title !== top.title) document.title = top.title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      owners.splice(owners.indexOf(entry), 1);
      apply();
    };
  }, [wanted]);
}

const owners: { title: string }[] = [];
