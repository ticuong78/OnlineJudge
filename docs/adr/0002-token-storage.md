# ADR 0002: Where the session token lives

Date: 2026-11-07
Status: proposed (decision owner: Htet Oo Naing)

## Context

The backend issues a JWT (`identity/infrastructure/security.ts`, `JwtTokenService`) with a 7-day lifetime (`JWT_EXPIRES_IN=7d` in `.env.example`). The frontend keeps it in `localStorage` (`src/frontend/src/lib/api.ts`, `TOKEN_KEY`) and sends it as a bearer header.

The pending identity work adds a credential version claim (`cv`, the first 64 bits of a SHA-256 of the password hash): a password change or reset invalidates every token issued before it. There is still no way to sign out one device or revoke a single token, and any script running on the frontend origin can read the token.

The frontend is on Vercel and the API on another origin, so a cookie would be cross-site (`SameSite=None; Secure`) unless the API is moved under the frontend's domain.

## Options

1. Keep bearer token in `localStorage`, shorten the lifetime (e.g. 12 h) and rely on `cv` for revocation on password change. Smallest change; XSS still steals a working token.
2. httpOnly, `Secure`, `SameSite=Lax` cookie with the API served under the same site (a `/api` rewrite on Vercel). Token unreadable by scripts; needs CSRF protection on mutating routes and a proxy change.
3. Short-lived access token in memory plus a rotating refresh token in an httpOnly cookie, with a server-side refresh token table. Strongest; most code (new table, rotation, reuse detection).

## Decision

Pending. Recommendation: option 1 now (one-line config change plus a test), and option 2 before the system is used outside one trusted class.

Why not wait longer: the frontend already renders user-controlled content, which is where XSS would come from. Teacher-written problem statements go through `react-markdown` (with `remark-gfm`, `remark-math`, `rehype-katex`, `rehype-highlight`), and student code goes through `components/code-block.tsx`, which uses `dangerouslySetInnerHTML` on highlight.js output. Both are escaped today (no `rehype-raw`, and highlight.js and the `escapeHtml` fallback escape their input), so there is no known hole. But one added plugin would expose a 7-day token readable from script. Until option 2, keep `rehype-raw` out of the frontend and add a Content-Security-Policy header.

## Consequences

Whatever is chosen becomes a spec; option 2 or 3 touches identity (risky area) and needs the security-verifier agent and a second reviewer.
