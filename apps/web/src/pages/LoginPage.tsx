import { type FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BoutiqueLoader } from '../components/BoutiqueLoader';
import { userFacingError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { consumeSessionExpiredNotice } from '../lib/sessionExpiry';
import { toast } from '../lib/toast';

/** Login del equipo. Sin recuperación pública de contraseña. */
export function LoginPage() {
  const { login, token, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!consumeSessionExpiredNotice()) return;
    toast.warn('Tu sesión expiró. Ingresa de nuevo.');
  }, []);

  if (!loading && token) return <Navigate to="/" replace />;
  if (loading) return <BoutiqueLoader label="Cargando…" variant="page" />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(userFacingError(err, 'No se pudo iniciar sesión'));
      toast.error(userFacingError(err, 'No se pudo iniciar sesión'));
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
        aria-label="Ingreso al sistema"
        autoComplete="off"
      >
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
            <p className="login-card-kicker">Acceso del equipo</p>
            <h1 className="login-card-title">Ingresar</h1>
            <p className="login-card-copy login-card-copy--desktop">
              Inventario, ventas y caja para dueña y vendedoras.
            </p>
          </div>

          <div className="login-fields">
            <div className="field login-field">
              <label htmlFor="login-email">Correo</label>
              <input
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="off"
                name="lscala-login-email"
                inputMode="email"
                required
              />
            </div>
            <div className="field login-field">
              <label htmlFor="login-password">Contraseña</label>
              <input
                id="login-password"
                name="lscala-login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="off"
                required
              />
            </div>
          </div>

          {error ? <p className="error login-error">{error}</p> : null}

          <button className="btn block login-cta" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="login-foot muted">
            Si olvidaste tu clave, pide a quien administra que la restablezca.
          </p>
          <p className="login-foot">Boutique L'Scala · Calama</p>
        </div>
      </form>
    </div>
  );
}
