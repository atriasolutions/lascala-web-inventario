/**
 * Sesión persistente solo en PWA móvil instalada.
 * Chrome/Edge de escritorio en ventana standalone NO cuenta (TTL 12 h).
 */
export function isPersistentPwaClient(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { mobile?: boolean };
  };

  const iosStandalone = Boolean(nav.standalone);
  const displayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (!iosStandalone && !displayStandalone) return false;

  if (typeof nav.userAgentData?.mobile === 'boolean') {
    return nav.userAgentData.mobile;
  }
  if (iosStandalone) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Body extra para POST /api/auth/login y /api/auth/refresh. */
export function persistentSessionHints(): { client: 'pwa'; persistent: true } | Record<string, never> {
  if (!isPersistentPwaClient()) return {};
  return { client: 'pwa', persistent: true };
}
