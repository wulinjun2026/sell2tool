const TOKEN_KEY = 'uca_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function maskPhone(phone = '') {
  const p = String(phone);
  if (p.length !== 11) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}
