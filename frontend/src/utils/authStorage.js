export const AUTH_CHANGED_EVENT = 'suivi-production:auth-changed';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const WORKSPACE_KEY = 'workspaceId';

function emitAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
  }
}

export function readStoredAuth() {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  const token = window.localStorage.getItem(TOKEN_KEY);
  const rawUser = window.localStorage.getItem(USER_KEY);

  if (!token) {
    return { token: null, user: null };
  }

  if (!rawUser) {
    return { token, user: null };
  }

  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return { token, user: null };
  }
}

export function saveAuthSession(user, token) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  emitAuthChange();
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(WORKSPACE_KEY);
  emitAuthChange();
}
