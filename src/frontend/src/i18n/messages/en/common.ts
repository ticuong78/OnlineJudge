import type { common as vi } from '../vi/common';
import type { Dict } from '../types';

export const common = {
  appName: 'Online Judge',
  appTagline: 'Programming judge for the classroom',
  appDescription: 'An online programming judge for classrooms',
  loading: 'Loading...',
  retry: 'Try again',
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving...',
  delete: 'Delete',
  edit: 'Edit',
  create: 'Create',
  add: 'Add',
  confirm: 'Confirm',
  back: 'Back',
  search: 'Search',
  all: 'All',
  none: '—',
  empty: '(empty)',
  yes: 'Yes',
  no: 'No',
  home: 'Back to home',
  copy: 'Copy',
  copied: 'Copied',
  pagination: {
    summary: 'Page {page}/{pages}, {total, plural, one {# result} other {# results}}',
    previous: 'Previous page',
    next: 'Next page',
  },
  status: {
    pending: 'Queued',
    judging: 'Judging',
  },
  score: {
    percentSpoken: '{value}% of the points',
    pointsSpoken: 'Score {value} out of {of}',
  },
  editorLoading: 'Loading the editor...',
  checkingSignIn: 'Checking your sign-in...',
  noPermission: 'You do not have access to this page',
  notFound: {
    title: 'Page not found',
    body: 'The link may be wrong, or the content has been deleted.',
  },
  ai: {
    vipHint: 'AI features are for VIP teacher accounts only. Ask an administrator to upgrade your account.',
    vipOnly: '{label} · VIP only',
  },
  network: {
    offline: 'Cannot reach the server. Check your connection and try again; if it still fails, tell your teacher.',
    httpError: 'Error {status}',
    generic: 'Something went wrong',
  },
  language: {
    label: 'Language',
    vi: 'Tiếng Việt',
    en: 'English',
  },
} satisfies Dict<typeof vi>;
