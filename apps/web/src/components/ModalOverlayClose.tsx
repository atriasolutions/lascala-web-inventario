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

/** X como hijo del card blanco (absolute -12px), no del overlay. */
export function ModalOverlayClose({ onClose, disabled, children }: Props) {
  const closeBtn = (
    <button
      type="button"
      className="modal-overlay-close"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
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
        {closeBtn}
        {children}
      </>
    );
  }

  const host = children as ReactElement<CloseHost>;
  return cloneElement(host, {
    children: (
      <>
        {closeBtn}
        {host.props.children}
      </>
    ),
  });
}
