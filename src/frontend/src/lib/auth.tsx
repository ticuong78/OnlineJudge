'use client';

import type { AuthResponse, LoginRequest, Role, UserDto } from '@oj/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, UNAUTHORIZED_EVENT } from './api';
import { forgetAllLastProblems } from './last-problem';

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

export function isStaffRole(role: Role | undefined | null) {
  return role === 'ADMIN' || role === 'TEACHER';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // Invalid/expired token (or backend down): treat as logged out.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    const res = await api.login(body);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const signIn = useCallback((res: AuthResponse) => {
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    // Shared computers: the next person must not be offered this account's last problem (K-2).
    forgetAllLastProblems();
  }, []);

  const refresh = useCallback(async () => {
    setUser(await api.me());
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
