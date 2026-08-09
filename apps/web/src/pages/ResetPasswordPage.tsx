import { type FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

export function ResetPasswordPage() {
  const { token: sessionToken, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const resetToken = useMemo(() => (params.get('token') || '').trim(), [params]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!loading && sessionToken) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!resetToken) {
      setError('Falta el enlace de restablecimiento. Solicita uno nuevo desde el ingreso.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      const data = await api<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: { token: resetToken, password },
      });
      setDone(true);
      toast.success(data.message || 'Contraseña actualizada.');
      window.setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar la contraseña';
      setError(msg);
      toast.error(msg);
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

      {!resetToken && !done && (
        <div className="login-card" role="alert">
          <div className="login-card-glow" aria-hidden="true" />
          <div className="login-card-inner">
            <div className="login-intro">
              <p className="login-card-kicker">Enlace inválido</p>
              <h1 className="login-card-title">No hay token</h1>
              <p className="login-card-copy">
                Este enlace no incluye un token válido. Solicita uno nuevo desde el ingreso.
              </p>
            </div>
            <Link to="/login" className="btn block login-cta">
              Ir al ingreso
            </Link>
          </div>
        </div>
      )}

      {resetToken && !done && (
        <form className="login-card" onSubmit={onSubmit} aria-label="Nueva contraseña">
          <div className="login-card-glow" aria-hidden="true" />
          <div className="login-card-inner">
            <div className="login-brand">
              <img className="login-logo" src="/brand/lscala-logo-mark.png" alt="L'Scala" />
              <div className="login-brand-text">
                <p className="login-brand-name">L'Scala</p>
                <p className="login-eyebrow">Gestión · Boutique Calama</p>
              </div>
            </div>

            <div className="login-intro">
              <p className="login-card-kicker">Recuperación</p>
              <h1 className="login-card-title">Nueva contraseña</h1>
              <p className="login-card-copy">Elige una contraseña nueva para tu cuenta (mínimo 6 caracteres).</p>
            </div>

            <div className="login-fields">
              <div className="field login-field">
                <label htmlFor="reset-password">Nueva contraseña</label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                />
              </div>
              <div className="field login-field">
                <label htmlFor="reset-confirm">Confirmar contraseña</label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && <p className="error login-error">{error}</p>}

            <button className="btn block login-cta" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>

            <Link to="/login" className="login-forgot-link">
              Volver al ingreso
            </Link>
          </div>
        </form>
      )}

      {done && (
        <div className="login-card" role="status" aria-live="polite">
          <div className="login-card-glow" aria-hidden="true" />
          <div className="login-card-inner">
            <div className="login-intro">
              <p className="login-card-kicker">Listo</p>
              <h1 className="login-card-title">Contraseña actualizada</h1>
              <p className="login-card-copy">Ya puedes ingresar con tu nueva contraseña.</p>
            </div>
            <Link to="/login" className="btn block login-cta">
              Ir al ingreso
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
