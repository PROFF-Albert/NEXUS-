// NEXUS API client — single place that talks to the backend.

const TOKEN_KEY = 'nexus.token';
const VAULT_KEY = 'nexus.vault';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY) || ''; },
  set token(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },
  get vaultToken() { return sessionStorage.getItem(VAULT_KEY) || ''; },
  set vaultToken(v) { v ? sessionStorage.setItem(VAULT_KEY, v) : sessionStorage.removeItem(VAULT_KEY); },
};

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

async function request(method, path, { body, form, vault, raw } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (vault && auth.vaultToken) headers['X-Vault-Token'] = auth.vaultToken;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    auth.token = '';
    auth.vaultToken = '';
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError(401, 'Session expired');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-json */ }
    throw new ApiError(res.status, detail);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  return type.includes('application/json') ? res.json() : res.text();
}

export const api = {
  get: (p, o) => request('GET', p, o),
  post: (p, body, o) => request('POST', p, { body, ...o }),
  patch: (p, body, o) => request('PATCH', p, { body, ...o }),
  put: (p, body, o) => request('PUT', p, { body, ...o }),
  del: (p, o) => request('DELETE', p, o),
  upload: (p, form, o) => request('POST', p, { form, ...o }),

  // media/download URLs need the token in the query string
  url: (p) => `/api${p}${p.includes('?') ? '&' : '?'}token=${encodeURIComponent(auth.token)}`,

  async download(path, filename) {
    const res = await request('GET', path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  },
};

// ── formatting helpers ────────────────────────────────────────────────
export function bytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 5400) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.round(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.round(diff / 2592000)}mo ago`;
  return `${Math.round(diff / 31536000)}y ago`;
}

export function dateStr(iso, opts) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined,
    opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTimeStr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const STATUS_COLOR = {
  Planning: '#64748b', Design: '#a855f7', Development: '#3b82f6',
  Testing: '#f59e0b', Completed: '#22c55e', Paused: '#6b7280', Archived: '#475569',
  Todo: '#64748b', 'In Progress': '#3b82f6', Blocked: '#f43f5e', Done: '#22c55e',
};

export const PRIORITY_COLOR = {
  Critical: '#f43f5e', High: '#f59e0b', Medium: '#3b82f6', Low: '#64748b',
};
