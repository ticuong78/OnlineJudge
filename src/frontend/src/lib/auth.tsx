'use client';

import type { AuthResponse, LoginRequest, Role, UserDto } from '@oj/contracts';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { api, ApiError, getToken, setToken, UNAUTHORIZED_EVENT } from './api';
import { forgetAllLastProblems } from './last-problem';
import { clearCachedUser, readCachedUser, writeCachedUser } from './me-cache';
import { forgetDraftsOnSignOut } from './unsaved';

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  login: (body: LoginRequest) => Promise<UserDto>;
  /** Store the token from any endpoint that returns AuthResponse (verify, reset, accept invitation). */
  signIn: (res: AuthResponse) => UserDto;
  logout: () => void;
  /** Reloads the signed-in account, e.g. after joining or leaving an organization. */
  refresh: () => Promise<void>;
  isStaff: boolean;
  isAdmin: boolean;
  /** AI features: administrators, VIP teachers and members of an active organization with AI. */
  canUseAi: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// L5: after "Sign out" the sign-in page must not carry ?next= to the page the previous person was on. A session that
// expired is different: the same person signs in again and continues where they were.
let signedOutOnPurpose = false;

/** True between "Sign out" and the next sign-in in this tab. */
export function signedOutDeliberately(): boolean {
  return signedOutOnPurpose;
}

export function isStaffRole(role: Role | undefined | null) {
  return role === 'ADMIN' || role === 'TEACHER';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Before the first paint (a layout effect, so there is no blank frame and no hydration mismatch): show the cached
  // account at once, then confirm it with /auth/me in the background (OJ-16). Pages start loading their own data at
  // the same time instead of after the check.
  useLayoutEffect(() => {
    const cached = readCachedUser(getToken());
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      clearCachedUser();
      setLoading(false);
      return;
    }
    const hadCache = !!readCachedUser(token);
    api
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        writeCachedUser(getToken(), u);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A rejected token (401) signs out, as before. A network error keeps the cached account, so the page shows its
        // own "cannot reach the server" message instead of sending the user to sign-in; without a cache it signs out.
        const rejected = error instanceof ApiError && error.status === 401;
        if (rejected) clearCachedUser();
        if (rejected || !hadCache) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      clearCachedUser();
      setUser(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    const res = await api.login(body);
    signedOutOnPurpose = false;
    setToken(res.accessToken);
    writeCachedUser(res.accessToken, res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const signIn = useCallback((res: AuthResponse) => {
    signedOutOnPurpose = false;
    setToken(res.accessToken);
    writeCachedUser(res.accessToken, res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    signedOutOnPurpose = true;
    clearCachedUser();
    setToken(null);
    setUser(null);
    // Shared computers: the next person must not be offered this account's last problem (K-2).
    forgetAllLastProblems();
    forgetDraftsOnSignOut();
  }, []);

  const refresh = useCallback(async () => {
    const u = await api.me();
    writeCachedUser(getToken(), u);
    setUser(u);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      signIn,
      logout,
      refresh,
      isStaff: isStaffRole(user?.role),
      isAdmin: user?.role === 'ADMIN',
      canUseAi: !!user?.canUseAi,
    }),
    [user, loading, login, signIn, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
