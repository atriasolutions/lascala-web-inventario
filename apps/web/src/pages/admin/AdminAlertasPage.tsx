import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import {
  fetchPushServerStatus,
  getPushSupportState,
  subscribeToPushAlerts,
  syncExistingPushSubscription,
  unsubscribeFromPushAlerts,
} from '../../lib/pushNotifications';

/** /admin/alertas — Web Push para administradores (PWA). */
export function AdminAlertasPage() {
  const { branches } = useAuth();
  const isOwner = branches.some((b) => b.role === 'owner');
  const [support, setSupport] = useState(getPushSupportState());
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [subscriptions, setSubscriptions] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async () => {
    if (!isOwner) return;
    try {
      const status = await fetchPushServerStatus();
      setServerEnabled(status.enabled);
      setSubscriptions(status.subscriptions);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar el estado');
    }
  }, [isOwner]);

  useEffect(() => {
    setSupport(getPushSupportState());
    void refreshStatus();
    void syncExistingPushSubscription()
      .then(() => refreshStatus())
      .catch(() => {});
  }, [refreshStatus]);

  const activate = useCallback(async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await subscribeToPushAlerts();
      if (result === 'subscribed') {
        setMessage('Alertas activadas en este dispositivo.');
        setSupport(getPushSupportState());
        await refreshStatus();
        return;
      }
      if (result === 'denied') {
        setError('Permiso denegado. Revisa la configuración de notificaciones del navegador.');
        return;
      }
      if (result === 'ios-need-install') {
        setError(
          'En iPhone/iPad agrega L\'Scala a la pantalla de inicio (Safari → Compartir → Agregar a inicio) y vuelve a intentar.',
        );
        return;
      }
      if (result === 'server-disabled') {
        setError('El servidor aún no tiene configuradas las claves VAPID.');
        return;
      }
      if (result === 'unsupported') {
        setError('Este navegador no admite alertas push.');
        return;
      }
      setError('No pudimos activar las alertas.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al activar');
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const deactivate = useCallback(async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await unsubscribeFromPushAlerts();
      setMessage('Alertas desactivadas en este dispositivo.');
      setSupport(getPushSupportState());
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al desactivar');
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  if (!isOwner) {
    return (
      <div className="admin-panel" role="tabpanel">
        <p className="muted admin-role-note">Las alertas push las configura Administrador/a.</p>
      </div>
    );
  }

  const permissionGranted = support.permission === 'granted';

  return (
    <div className="admin-panel admin-alertas" role="tabpanel">
      <section className="admin-card">
        <h2 className="admin-card-title">Alertas en el celular</h2>
        <p className="admin-card-lede">
          Avisos de mermas, cambios y devoluciones registrados por el equipo en piso. Funcionan con
          la app instalada (PWA) en Android e iPhone 16.4+.
        </p>

        <ul className="admin-alertas-status muted">
          <li>
            Navegador:{' '}
            {support.supported ? 'compatible' : 'no compatible'}
          </li>
          <li>
            App instalada: {support.standalone ? 'sí' : 'no (recomendado en móvil)'}
          </li>
          <li>
            Permiso: {support.permission === 'unsupported' ? '—' : support.permission}
          </li>
          <li>
            Servidor:{' '}
            {serverEnabled === null ? '…' : serverEnabled ? 'configurado' : 'sin claves VAPID'}
          </li>
          <li>Dispositivos registrados: {subscriptions}</li>
        </ul>

        {support.iosNeedInstall ? (
          <p className="admin-alertas-ios-hint">
            <strong>iPhone/iPad:</strong> en Safari toca <strong>Compartir</strong> →{' '}
            <em>Agregar a inicio</em>. Abre L&apos;Scala desde el ícono y vuelve aquí.
          </p>
        ) : null}

        <div className="admin-alertas-actions">
          {!permissionGranted ? (
            <button type="button" className="btn" disabled={busy || !support.supported} onClick={() => void activate()}>
              {busy ? 'Activando…' : 'Activar alertas en este dispositivo'}
            </button>
          ) : (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void deactivate()}>
              {busy ? 'Desactivando…' : 'Desactivar en este dispositivo'}
            </button>
          )}
        </div>

        {message ? <p className="ok admin-alertas-msg">{message}</p> : null}
        {error ? <p className="error admin-alertas-msg">{error}</p> : null}
      </section>
    </div>
  );
}
