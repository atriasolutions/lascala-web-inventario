import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  dismissPushBanner,
  getPushSupportState,
  isPushBannerDismissed,
  prefetchVapidPublicKey,
  subscribeToPushAlerts,
} from '../lib/pushNotifications';

/**
 * Banner para administradores: activar alertas push en este dispositivo.
 * iOS: exige PWA en pantalla de inicio (16.4+).
 */
export function PushAlertsBanner() {
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (isPushBannerDismissed()) return;

    const support = getPushSupportState();
    if (!support.supported) return;
    if (support.permission === 'granted') return;

    void prefetchVapidPublicKey().catch(() => {});
    setIosHint(support.iosNeedInstall);
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    dismissPushBanner();
    setVisible(false);
  }, []);

  const activate = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await subscribeToPushAlerts();
      if (result === 'subscribed') {
        dismissPushBanner();
        setVisible(false);
        return;
      }
      if (result === 'denied') {
        setMessage('Permiso denegado. Puedes activarlo después en Ajustes → Alertas.');
        return;
      }
      if (result === 'ios-need-install') {
        setIosHint(true);
        setMessage('En iPhone/iPad agrega L\'Scala a la pantalla de inicio antes de activar alertas.');
        return;
      }
      if (result === 'server-disabled') {
        setMessage('Las alertas push aún no están configuradas en el servidor.');
        return;
      }
      setMessage('No pudimos activar las alertas en este dispositivo.');
    } catch {
      setMessage('Error al activar alertas. Intenta de nuevo en Ajustes → Alertas.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!visible) return null;

  return (
    <aside className="push-alerts-banner" role="region" aria-label="Alertas en el celular">
      <div className="push-alerts-banner-copy">
        <strong>Alertas en este dispositivo</strong>
        {iosHint ? (
          <p>
            En iPhone/iPad: Safari → <strong>Compartir</strong> → <em>Agregar a inicio</em>. Luego
            abre la app desde el ícono y activa las alertas.
          </p>
        ) : (
          <p>
            Recibe avisos de mermas, cambios y devoluciones aunque tengas el celular bloqueado
            (Administrador/a).
          </p>
        )}
        {message ? <p className="muted push-alerts-banner-msg">{message}</p> : null}
      </div>
      <div className="push-alerts-banner-actions">
        {!iosHint ? (
          <button type="button" className="btn push-alerts-banner-btn" disabled={busy} onClick={() => void activate()}>
            {busy ? 'Activando…' : 'Activar alertas'}
          </button>
        ) : null}
        <Link to="/admin/alertas" className="btn ghost push-alerts-banner-btn" onClick={dismiss}>
          Ver en Ajustes
        </Link>
        <button type="button" className="btn ghost push-alerts-banner-btn" onClick={dismiss}>
          Ahora no
        </button>
      </div>
    </aside>
  );
}
