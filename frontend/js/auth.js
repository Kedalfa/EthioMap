// Shared auth helper used by all protected pages
const API_BASE = window.ETHIOMAP_API_BASE || 'http://localhost:4000';

const TOKEN_KEY = 'ethiomap_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// fetch with Authorization header automatically attached
export function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  return fetch(`${API_BASE}${url}`, { ...options, headers });
}

// Returns user object from /api/auth/me or null
export async function getMe() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetchWithAuth('/api/auth/me');
    if (!res.ok) { clearToken(); return null; }
    const data = await res.json();
    return data.user;
  } catch { return null; }
}

// Redirect to login if not authenticated
export async function requireAuth(redirectTo = 'login.html') {
  const user = await getMe();
  if (!user) { window.location.href = redirectTo; return null; }
  return user;
}

// Redirect to login if not admin
export async function requireAdmin(redirectTo = 'login.html') {
  const user = await getMe();
  if (!user) { window.location.href = redirectTo; return null; }
  if (user.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
  return user;
}

export async function logout() {
  try { await fetchWithAuth('/api/auth/logout', { method: 'POST' }); } catch {}
  clearToken();
  window.location.href = 'login.html';
}
