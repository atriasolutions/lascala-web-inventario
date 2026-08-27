import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { IconClose } from './icons';

type Props = {
  onClose: () => void;
  disabled?: boolean;
  children: ReactNode;
};

type CloseHost = {
  children?: ReactNode;
};

/**
 * X como último hijo del host (shell/panel), sin recorrer ni clonar el <form>.
 *
 * Importante: un walk con cloneElement/Children.toArray sobre el formulario
 * re-creaba el árbol en cada keystroke y en iOS el input de Precio venta
 * perdía el foco (remount). Solo tocamos el wrapper externo.
 */
export function ModalOverlayClose({ onClose, disabled, children }: Props) {
  const closeBtn = (
    <button
      type="button"
      className="modal-overlay-close"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onClose();
      }}
      disabled={disabled}
      aria-label="Cerrar"
    >
      <IconClose size={18} />
    </button>
  );

  if (!isValidElement(children)) {
    return (
      <>
        {children}
        {closeBtn}
      </>
    );
  }

  const host = children as ReactElement<CloseHost>;
  return cloneElement(host, {
    children: (
      <>
        {host.props.children}
        {closeBtn}
      </>
    ),
  });
}
