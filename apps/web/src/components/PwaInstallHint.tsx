import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  clearDeferredPwaInstall,
  subscribePwaInstall,
  type BeforeInstallPromptEvent,
} from '../lib/pwaInstallPrompt';

/** v2: el hint anterior casi nunca se veía (evento perdido); reset de “Ahora no”. */
const DISMISS_KEY = 'lscala_pwa_install_dismissed_v2';

/** Safari privado puede descartar localStorage: recordar “Ahora no” al menos en la sesión. */
let dismissedThisSession = false;

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS ? 'ios' : 'desktop';
}

function isIosSafariBrowser() {
  const ua = navigator.userAgent;
  return /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
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
  return /Chrome|Chromium|Edg|SamsungBrowser/i.test(ua);
}

function readDismissed() {
  if (dismissedThisSession) return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function persistDismissed() {
  dismissedThisSession = true;
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Formularios donde el banner estorba (compra nueva / edición / detalle). */
function isFormRoute(pathname: string) {
  return /^\/compras\/.+/.test(pathname);
}

/**
 * Hint de instalación PWA — solo en build de producción (no en Vite dev).
 * iOS: “Compartir → Agregar a inicio” (menciona Safari solo si es Safari).
 * Android: botón Instalar si hay beforeinstallprompt; si no, menú ⋮.
 * Escritorio Chrome/Edge: ícono de instalar o menú ⋮.
 */
export function PwaInstallHint() {
  const { pathname } = useLocation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [iosSafari, setIosSafari] = useState(false);

  useEffect(() => {
    // Nunca mostrar en desarrollo: el SW no corre y el copy no debe ser técnico.
    if (import.meta.env.DEV) return;
    if (isStandaloneDisplay()) return;
    if (readDismissed()) return;

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'ios') {
      setIosSafari(isIosSafariBrowser());
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
    persistDismissed();
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
    persistDismissed();
  }, [deferred]);

  if (!visible || isFormRoute(pathname)) return null;

  let title = "Instala L'Scala en este equipo";
  let body: ReactNode;
  if (platform === 'ios') {
    title = "Instala L'Scala en tu iPhone o iPad";
    body = iosSafari ? (
      <>
        En Safari: toca <strong>Compartir</strong> → <em>Agregar a inicio</em>.
      </>
    ) : (
      <>
        Toca <strong>Compartir</strong> → <em>Agregar a inicio</em>.
      </>
    );
  } else if (deferred) {
    if (platform === 'android') title = "Instala L'Scala en este teléfono";
    body = 'Úsala como app, sin la barra del navegador.';
  } else if (platform === 'android') {
    title = "Instala L'Scala en este teléfono";
    body = (
      <>
        Abre el menú <strong>⋮</strong> y elige <em>Instalar aplicación</em> o{' '}
        <em>Agregar a pantalla principal</em>.
      </>
    );
  } else {
    body = (
      <>
        Usa el ícono de instalar en la barra de dirección o el menú <strong>⋮</strong> →{' '}
        <em>Instalar L&apos;Scala</em>.
      </>
    );
  }

  return (
    <aside className="pwa-install-hint" role="region" aria-label="Instalar aplicación">
      <div className="pwa-install-hint-copy">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <div className="pwa-install-hint-actions">
        {deferred ? (
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
