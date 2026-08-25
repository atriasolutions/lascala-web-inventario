import { type FormEvent, useId, useState } from 'react';
import { api, userFacingError, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

/**
 * Pantalla bloqueante de primer ingreso / clave temporal.
 * No permite navegar a módulos hasta cambiar la contraseña.
 * API: POST /api/auth/change-password { currentPassword, newPassword }
 */
export function ForceChangePasswordPage() {
  const { refreshUser, logout } = useAuth();
  const titleId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!currentPassword.trim()) {
      setError('Ingresa la contraseña temporal con la que entraste');
      return;
    }
    if (password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password === currentPassword) {
      setError('La nueva contraseña debe ser distinta a la actual');
      return;
    }
    setBusy(true);
    try {
      await api<{ user: User }>('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword: password },
      });
      await refreshUser();
      toast.success('Contraseña actualizada');
    } catch (err) {
      setError(userFacingError(err, 'No se pudo actualizar la contraseña'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-stage" aria-hidden="true">
        <img className="login-banner" src="/brand/login-banner.jpg" alt="" />
        <div className="login-stage-veil" />
        <div className="login-stage-mark">
          <span className="login-stage-name">L'Scala</span>
          <span className="login-stage-place">Boutique · Calama</span>
        </div>
      </section>

      <form
        className="login-card"
        onSubmit={(e) => void onSubmit(e)}
        aria-labelledby={titleId}
      >
        <div className="login-card-glow" aria-hidden="true" />
        <div className="login-card-inner">
          <div className="login-brand">
            <img className="login-logo" src="/brand/lscala-logo-mark.png" alt="L'Scala" />
            <div className="login-brand-text">
              <p className="login-brand-name">L'Scala</p>
              <p className="login-eyebrow">Primer ingreso</p>
            </div>
          </div>

          <div className="login-intro">
            <p className="login-card-kicker">Seguridad</p>
            <h1 className="login-card-title" id={titleId}>
              Crea tu nueva contraseña
            </h1>
            <p className="login-card-copy">
              Por seguridad, confirma la clave temporal y elige una nueva antes de entrar.
            </p>
          </div>

          <div className="login-fields">
            <div className="field login-field">
              <label htmlFor="force-pwd-current">Contraseña actual</label>
              <input
                id="force-pwd-current"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="field login-field">
              <label htmlFor="force-pwd">Nueva contraseña</label>
              <input
                id="force-pwd"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field login-field">
              <label htmlFor="force-pwd-confirm">Repite la nueva</label>
              <input
                id="force-pwd-confirm"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>

          {error ? <p className="error login-error">{error}</p> : null}

          <button className="btn block login-cta" disabled={busy} type="submit">
            {busy ? 'Guardando…' : 'Guardar y continuar'}
          </button>

          <button type="button" className="login-forgot-link" onClick={() => logout()}>
            Cerrar sesión
          </button>
        </div>
      </form>
    </div>
  );
}
