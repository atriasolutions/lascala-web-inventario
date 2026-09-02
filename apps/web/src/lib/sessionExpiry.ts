/**
 * Sesión JWT expirada / no autorizada: una sola vez limpia storage y manda a login.
 * Evita spam de toasts/navegaciones ante varios 401 en paralelo.
 */

const SESSION_EXPIRED_FLAG = 'lscala_session_expired';

let handling = false;

export function markSessionExpiredNotice() {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function consumeSessionExpiredNotice(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_FLAG) !== '1') return false;
    sessionStorage.removeItem(SESSION_EXPIRED_FLAG);
    return true;
  } catch {
    return false;
  }
}

function clearAuthStorage() {
  try {
    localStorage.removeItem('lscala_token');
    localStorage.removeItem('lscala_branch');
    localStorage.removeItem('lscala_pos');
  } catch {
    /* ignore */
  }
}

/** true si ya estamos en login (no redirigir de nuevo). */
function onLoginPath() {
  if (typeof window === 'undefined') return true;
  const path = window.location.pathname || '';
  return path === '/login' || path.startsWith('/login/');
}

/**
 * Llamar ante el primer 401 de una petición autenticada.
 * Idempotente: llamadas concurrentes no re-disparan.
 */
export function handleSessionExpired() {
  if (handling) return;
  if (typeof window === 'undefined') return;
  if (onLoginPath()) {
    clearAuthStorage();
    return;
  }
  handling = true;
  clearAuthStorage();
  markSessionExpiredNotice();
  window.location.assign('/login');
}
