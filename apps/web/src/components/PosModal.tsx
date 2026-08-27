import {
  type MouseEventHandler,
  type ReactNode,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { usePosModalViewport } from '../hooks/usePosModalViewport';

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
 * - Evita fixed atrapado por `.main-content { overflow }`
 * - En iOS: anclado a visualViewport (teclado no empuja el panel fuera de pantalla)
 * - Solo el body interno scrollea hacia el input enfocado
 */
export function PosModal({
  open = true,
  className = '',
  children,
  onClick,
  role = 'presentation',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  useModalScrollLock(open);
  usePosModalViewport(open, rootRef);

  if (!open || typeof document === 'undefined') return null;

  const classes = ['pos-modal', 'open', className].filter(Boolean).join(' ');

  return createPortal(
    <div ref={rootRef} className={classes} role={role} onClick={onClick}>
      {children}
    </div>,
    document.body,
  );
}
