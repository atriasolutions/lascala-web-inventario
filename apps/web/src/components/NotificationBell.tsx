import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAlerts } from '../lib/alerts';
import { IconAlertTriangle, IconBell, IconClose, IconSwap } from './icons';

const CATEGORY_ICON = {
  stock: IconAlertTriangle,
  rotacion: IconSwap,
  voucher: IconAlertTriangle,
};

export function NotificationBell({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { items, unreadCount, loading, error, markRead, markAllRead, dismiss } = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (variant !== 'desktop') return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [variant]);

  useEffect(() => {
    if (variant !== 'mobile' || !open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [variant, open]);

  const panel = (
    <>
      <div className="notif-panel-head">
        <h3 id={titleId}>Alertas de la tienda</h3>
        <div className="notif-panel-actions">
          {unreadCount > 0 ? (
            <button type="button" className="btn ghost notif-mark-all" onClick={() => markAllRead()}>
              Marcar todas como leídas
            </button>
          ) : null}
          {variant === 'mobile' && (
            <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setOpen(false)}>
              <IconClose />
            </button>
          )}
        </div>
      </div>
      {loading && <p className="muted notif-status">Cargando alertas…</p>}
      {error && <p className="error notif-status">{error}</p>}
      {!loading && !error && !items.length && (
        <div className="notif-empty" role="status">
          <strong>Sin alertas</strong>
          <p className="muted">Cuando haya stock bajo o prendas sin movimiento, aparecen acá.</p>
        </div>
      )}
      <div className="notif-list">
        {items.map((item) => {
          const Icon = CATEGORY_ICON[item.category];
          return (
            <div
              key={item.id}
              className={`notif-item sev-${item.severity}${item.read ? ' is-read' : ' is-unread'}`}
            >
              <Link
                to={item.to}
                className="notif-item-main"
                onClick={() => {
                  markRead(item.alertKey);
                  setOpen(false);
                }}
              >
                <span className="notif-ico" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="notif-body">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </span>
                {!item.read ? <span className="notif-dot" aria-label="No leída" /> : null}
              </Link>
              <button
                type="button"
                className="icon-btn notif-dismiss"
                aria-label="Ocultar alerta"
                onClick={() => dismiss(item.alertKey)}
              >
                <IconClose size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );

  if (variant === 'mobile') {
    const sheet =
      open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="notif-sheet mobile-only open"
              onClick={() => setOpen(false)}
              role="presentation"
            >
              <div
                className="notif-sheet-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
              >
                {panel}
              </div>
            </div>,
            document.body,
          )
        : null;

    return (
      <>
        <button
          className="icon-btn"
          type="button"
          data-help="header.campana"
          aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <IconBell />
          {unreadCount > 0 && (
            <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
        {sheet}
      </>
    );
  }

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        className="icon-btn"
        type="button"
        data-help="header.campana"
        aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && <div className="notif-panel">{panel}</div>}
    </div>
  );
}
