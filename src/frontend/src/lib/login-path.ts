/**
 * Where the sign-in guard sends a signed-out visitor. An expired session keeps `?next=` so the same person carries on
 * where they were; after "Sign out" it is dropped, or the next person on that computer would be sent to the previous
 * user's page (UAT L5).
 */
export function loginPath(pathname: string | null, signedOutDeliberately: boolean): string {
  if (!pathname || pathname === '/' || signedOutDeliberately) return '/login';
  return `/login?next=${encodeURIComponent(pathname)}`;
}
