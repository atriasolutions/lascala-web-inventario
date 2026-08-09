import { type FormEvent, useId, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

type Mode = 'login' | 'forgot' | 'forgot-done';

export function LoginPage() {
  const { login, token, loading } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('admin@lscala.cl');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const forgotTitleId = useId();

  if (!loading && token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setMode('forgot-done');
      toast.success(data.message || 'Revisa tu correo si está registrado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo enviar la solicitud';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function openForgot() {
    setError('');
    setMode('forgot');
  }

  function backToLogin() {
    setError('');
    setMode('login');
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

      {mode === 'login' && (
        <form className="login-card" onSubmit={onSubmit} aria-label="Ingreso al sistema">
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
                  autoComplete="username"
                  inputMode="email"
                  required
                />
              </div>
              <div className="field login-field">
                <label htmlFor="login-password">Contraseña</label>
                <input
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && <p className="error login-error">{error}</p>}

            <button className="btn block login-cta" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>

            <button type="button" className="login-forgot-link" onClick={openForgot}>
              Olvidé mi contraseña
            </button>

            <p className="login-foot">Boutique L'Scala · Calama</p>
          </div>
        </form>
      )}

      {mode === 'forgot' && (
        <form className="login-card" onSubmit={onForgot} aria-labelledby={forgotTitleId}>
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
              <h1 className="login-card-title" id={forgotTitleId}>
                Olvidé mi contraseña
              </h1>
              <p className="login-card-copy">
                Ingresa el correo de tu cuenta. Si está registrado, te enviaremos instrucciones.
              </p>
            </div>

            <div className="login-fields">
              <div className="field login-field">
                <label htmlFor="forgot-email">Correo</label>
                <input
                  id="forgot-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="error login-error">{error}</p>}

            <button className="btn block login-cta" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar instrucciones'}
            </button>

            <button type="button" className="login-forgot-link" onClick={backToLogin}>
              Volver al ingreso
            </button>
          </div>
        </form>
      )}

      {mode === 'forgot-done' && (
        <div className="login-card" role="status" aria-live="polite">
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
              <p className="login-card-kicker">Listo</p>
              <h1 className="login-card-title">Revisa tu correo</h1>
              <p className="login-card-copy">
                Si el correo está registrado, recibirás instrucciones para restablecer tu
                contraseña.
              </p>
            </div>

            <button type="button" className="btn block login-cta" onClick={backToLogin}>
              Volver al ingreso
            </button>
            <p className="login-dev-hint muted">
              En desarrollo sin correo, el enlace aparece en la consola de la API.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
