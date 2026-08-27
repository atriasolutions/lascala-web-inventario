import {
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

type Props = {
  /** Si false, no renderiza. Default true (útil con `{open && <PosModal>}`). */
  open?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  role?: string;
};

/**
 * Overlay de modal portaleado a `document.body`.
 * Evita el bug iOS: `position:fixed` atrapado por `.main-content { overflow }`,
 * donde el bottom-nav tapa el footer y el scroll va a la página de atrás.
 */
export function PosModal({
  open = true,
  className = '',
  children,
  onClick,
  role = 'presentation',
}: Props) {
  useModalScrollLock(open);

  if (!open || typeof document === 'undefined') return null;

  const classes = ['pos-modal', 'open', className].filter(Boolean).join(' ');

  return createPortal(
    <div className={classes} role={role} onClick={onClick}>
      {children}
    </div>,
    document.body,
  );
}
