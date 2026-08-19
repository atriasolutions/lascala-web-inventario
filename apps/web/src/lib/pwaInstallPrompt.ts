/**
 * Captura temprana de beforeinstallprompt (puede dispararse antes del AppShell).
 * Importar desde main.tsx antes de render.
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn(deferred);
}

export function capturePwaInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function getDeferredPwaInstall() {
  return deferred;
}

export function clearDeferredPwaInstall() {
  deferred = null;
  notify();
}

export function subscribePwaInstall(listener: Listener) {
  listeners.add(listener);
  listener(deferred);
  return () => {
    listeners.delete(listener);
  };
}
