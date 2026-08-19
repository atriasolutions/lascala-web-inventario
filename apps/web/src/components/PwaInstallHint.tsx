import { useCallback, useEffect, useState } from 'react';
import {
  clearDeferredPwaInstall,
  subscribePwaInstall,
  type BeforeInstallPromptEvent,
} from '../lib/pwaInstallPrompt';

/** v2: el hint anterior casi nunca se veía (evento perdido); reset de “Ahora no”. */
const DISMISS_KEY = 'lscala_pwa_install_dismissed_v2';

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

/** Chrome / Edge / Android Chromium — donde tiene sentido el CTA de instalar. */
function isChromiumLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Firefox|FxiOS/i.test(ua)) return false;
  return /Chrome|Chromium|Edg|CriOS|EdgiOS|SamsungBrowser/i.test(ua);
}

/**
 * Hint de instalación PWA — solo en build de producción (no en Vite dev).
 * Chrome/Edge/Android: botón Instalar si hay beforeinstallprompt; si no, guía amigable.
 * iOS Safari: instrucciones “Agregar a inicio”.
 */
export function PwaInstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Nunca mostrar en desarrollo: el SW no corre y el copy no debe ser técnico.
    if (import.meta.env.DEV) return;
    if (isStandaloneDisplay()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    if (isIosSafari()) {
      setIosHint(true);
      setVisible(true);
      return;
    }

    if (!isChromiumLike()) return;

    setVisible(true);
    return subscribePwaInstall((event) => {
      setDeferred(event);
    });
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    clearDeferredPwaInstall();
    setDeferred(null);
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, [deferred]);

  if (!visible) return null;

  return (
    <aside className="pwa-install-hint" role="region" aria-label="Instalar aplicación">
      <div className="pwa-install-hint-copy">
        {iosHint ? (
          <>
            <strong>Instala L&apos;Scala en este iPhone/iPad</strong>
            <p>
              En Safari: toca <strong>Compartir</strong> → <em>Agregar a inicio</em>. Así abres
              Caja a pantalla completa.
            </p>
          </>
        ) : deferred ? (
          <>
            <strong>Instala L&apos;Scala en este equipo</strong>
            <p>Úsala como app de Caja, sin la barra del navegador.</p>
          </>
        ) : (
          <>
            <strong>Instala L&apos;Scala en este equipo</strong>
            <p>
              Si ves el ícono de instalar en la barra de dirección (monitor con flecha), úsalo. Si
              no, abre el menú <strong>⋮</strong> y elige <em>Instalar L&apos;Scala</em> o{' '}
              <em>Instalar aplicación</em>.
            </p>
          </>
        )}
      </div>
      <div className="pwa-install-hint-actions">
        {!iosHint && deferred ? (
          <button type="button" className="btn pwa-install-hint-btn" onClick={() => void install()}>
            Instalar
          </button>
        ) : null}
        <button type="button" className="btn ghost pwa-install-hint-btn" onClick={dismiss}>
          Ahora no
        </button>
      </div>
    </aside>
  );
}
