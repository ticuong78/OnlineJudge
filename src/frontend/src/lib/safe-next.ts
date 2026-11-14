/**
 * Where to go after signing in, from the `?next=` parameter: a path on this site, never another origin (review B1).
 * Browsers read `/\evil.com` and `/<TAB>/evil.com` as `//evil.com`, so a "starts with / but not //" check is not enough:
 * backslashes and control characters are refused outright, and what is left must resolve to this origin, both as
 * given and after the URL parser has normalised it.
 */
export function safeNext(next: string | null | undefined, origin: string): string {
  if (!next || !next.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(next)) return '/';
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return '/';
  }
  if (url.origin !== new URL(origin).origin) return '/';
  // Checked again after normalising: dot segments collapse, so `/.//evil.com` becomes the path `//evil.com`, which the
  // router reads as another site (found by the security-verifier).
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith('//') || new URL(path, origin).origin !== url.origin) return '/';
  return path;
}
