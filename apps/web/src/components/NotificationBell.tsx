import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAlerts } from '../lib/alerts';
import { IconAlertTriangle, IconBell, IconClose, IconSwap } from './icons';

const CATEGORY_ICON = {
  stock: IconAlertTriangle,
  rotacion: IconSwap,
  voucher: IconAlertTriangle,
};

export function NotificationBell({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { items, loading, error } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant !== 'desktop') return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [variant]);

  const count = items.length;
  const panel = (
    <>
      <div className="notif-panel-head">
        <h3>Alertas operativas</h3>
        {variant === 'mobile' && (
          <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setOpen(false)}>
            <IconClose />
          </button>
        )}
      </div>
      {loading && <p className="muted" style={{ padding: '0 0.2rem' }}>Cargando alertas…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && !count && (
        <p className="muted" style={{ padding: '0 0.2rem' }}>Sin alertas por ahora. Todo bajo control ✓</p>
      )}
      <div className="notif-list">
        {items.map((item) => {
          const Icon = CATEGORY_ICON[item.category];
          return (
            <Link key={item.id} to={item.to} className={`notif-item sev-${item.severity}`} onClick={() => setOpen(false)}>
              <span className="notif-ico"><Icon size={16} /></span>
              <span className="notif-body">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );

  if (variant === 'mobile') {
    return (
      <>
        <button className="icon-btn" type="button" aria-label="Notificaciones" onClick={() => setOpen(true)}>
          <IconBell />
          {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
        </button>
        <div className={`notif-sheet mobile-only ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
          <div className="notif-sheet-panel" onClick={(e) => e.stopPropagation()}>
            {panel}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="icon-btn" type="button" aria-label="Notificaciones" onClick={() => setOpen((v) => !v)}>
        <IconBell />
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && <div className="notif-panel">{panel}</div>}
    </div>
  );
}
