import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, onAuthLost, setToken } from '../api/client.js';

const AuthContext = createContext(null);

const DEFAULT_IDLE_MS = 5 * 60 * 1000; // 5-minute screen time limit

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState(
    () => sessionStorage.getItem('payroll.logoutMsg') || ''
  );

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get('/api/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  const endSession = useCallback((message) => {
    clearToken();
    setUser(null);
    if (message) {
      sessionStorage.setItem('payroll.logoutMsg', message);
      setLogoutMessage(message);
    }
  }, []);

  const logout = useCallback(() => {
    api.post('/api/auth/logout').catch(() => {});
    endSession('');
  }, [endSession]);

  // Server-side session/token expiry: surface a message on the login screen.
  useEffect(() => onAuthLost(() => {
    if (user) endSession('Your session ended. Please sign in again.');
  }), [user, endSession]);

  // Screen-time watchdog: 5 minutes without any mouse/keyboard activity logs out.
  useEffect(() => {
    if (!user) return undefined;
    let idleLimitMs = DEFAULT_IDLE_MS;
    api.get('/api/settings')
      .then((s) => {
        const mins = Number(s?.idle_timeout_minutes);
        if (mins > 0) idleLimitMs = mins * 60 * 1000;
      })
      .catch(() => {});

    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const timer = setInterval(() => {
      if (Date.now() - lastActivity > idleLimitMs) {
        api.post('/api/auth/logout').catch(() => {});
        const mins = Math.round(idleLimitMs / 60000);
        endSession(`You were logged out automatically after ${mins} minute${mins === 1 ? '' : 's'} of inactivity.`);
      }
    }, 10_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [user, endSession]);

  const login = useCallback(async (email, password) => {
    const result = await api.login(email, password);
    if (result?.otp_required) {
      // Password accepted; the session only starts after the email code.
      return result;
    }
    setToken(result.token);
    sessionStorage.removeItem('payroll.logoutMsg');
    setLogoutMessage('');
    setUser(result.user);
    return result.user;
  }, []);

  /** Signs the app into a {token, user} result returned by /api/auth/supabase. */
  const adoptSession = useCallback((result) => {
    setToken(result.token);
    sessionStorage.removeItem('payroll.logoutMsg');
    setLogoutMessage('');
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, logout, logoutMessage, adoptSession }),
    [user, ready, login, logout, logoutMessage, adoptSession]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
