import { PageSkeleton } from '@/components/ui';

/** Shown by Next.js at once while the next page of the app loads (OJ-16), instead of the old page doing nothing. */
export default function Loading() {
  return <PageSkeleton />;
}
