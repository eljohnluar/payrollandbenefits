const TOKEN_KEY = 'payroll.jwt';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

/** Notify the app when the server rejects the token (401) — used for idle/session handling. */
const authLostListeners = new Set();
export const onAuthLost = (fn) => {
  authLostListeners.add(fn);
  return () => authLostListeners.delete(fn);
};
const notifyAuthLost = () => authLostListeners.forEach((fn) => fn());

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      notifyAuthLost();
    }
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status);
  }
  return payload;
}

export const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

/**
 * Exchanges a Supabase access token for an app JWT. Returns {status, payload}
 * without throwing — callers branch on needs_registration_code / needs_password.
 */
async function supabaseLogin(accessToken, extra = {}) {
  const response = await fetch(`${BASE}/api/auth/supabase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ access_token: accessToken, ...extra }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: 'Unexpected server response.' };
  }
  return { status: response.status, payload };
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  register: (payload) => request('POST', '/api/auth/register', payload),
  supabaseLogin,
  health: () => request('GET', '/api/health'),
};
