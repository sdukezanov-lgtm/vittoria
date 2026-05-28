import { useCallback, useEffect, useRef, useState } from 'react';
import { setAuthHandlers } from '../api/client';
import { getMe, logout as logoutApi, refresh as refreshApi, verifyCode } from '../api/auth.api';
import type { AuthUser } from '../api/types';
import { AuthContext, type AuthStatus } from './useAuth';

const REFRESH_KEY = 'vittoria_refresh';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const accessTokenRef = useRef<string | null>(null);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Register handlers for apiFetch (token access, refresh, auth-fail).
  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      refresh: async () => {
        const rt = localStorage.getItem(REFRESH_KEY);
        if (!rt) throw new Error('no refresh token');
        const res = await refreshApi(rt);
        accessTokenRef.current = res.access_token;
        localStorage.setItem(REFRESH_KEY, res.refresh_token);
        return res.access_token;
      },
      onAuthFail: () => clearSession(),
    });
  }, [clearSession]);

  // Boot: restore session if a refresh token exists.
  useEffect(() => {
    const rt = localStorage.getItem(REFRESH_KEY);
    if (!rt) {
      setStatus('unauthenticated');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await refreshApi(rt);
        accessTokenRef.current = res.access_token;
        localStorage.setItem(REFRESH_KEY, res.refresh_token);
        const me = await getMe();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (phone: string, code: string) => {
    const res = await verifyCode(phone, code);
    accessTokenRef.current = res.access_token;
    localStorage.setItem(REFRESH_KEY, res.refresh_token);
    setUser({ id: res.user.id, phone: res.user.phone, role: res.user.role });
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // best-effort
    }
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
  );
}
