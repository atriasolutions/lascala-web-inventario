import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNetworkStatus } from '../lib/networkStatus';

type Props = {
  children: ReactNode;
};

/**
 * Bloquea módulos que exigen red (todo excepto Caja / login).
 */
export function RequireOnline({ children }: Props) {
  const { online, checking, refresh } = useNetworkStatus();

  if (checking && !online) {
    return (
      <div className="net-blocked" role="status">
        <p className="muted">Comprobando la conexión…</p>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="net-blocked" role="alert">
        <h2 className="net-blocked-title">Se necesita conexión</h2>
        <p className="net-blocked-copy">
          Este módulo solo funciona con internet. Mientras tanto puedes seguir en{' '}
          <strong>Caja</strong> con el catálogo guardado en este equipo.
        </p>
        <div className="net-blocked-actions">
          <Link to="/vender" className="btn">
            Ir a Caja
          </Link>
          <button type="button" className="btn secondary" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return children;
}
