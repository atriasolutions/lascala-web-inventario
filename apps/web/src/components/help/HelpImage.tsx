import { useEffect, useId, useRef, useState } from 'react';
import { ModalOverlayClose } from '../ModalOverlayClose';
import { PosModal } from '../PosModal';

type Props = {
  src?: string;
  alt: string;
  shoot?: string;
};

export function HelpImage({ src, alt, shoot }: Props) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const showSlot = !src || failed;
  const captionText = shoot ? shoot.replace(/^Foto:\s*/i, '').trim() : '';
  const caption = captionText ? (
    <p className="help-media-caption">
      <strong>Foto:</strong> {captionText}
    </p>
  ) : null;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const btn = document.querySelector(
        '.help-lightbox .modal-overlay-close',
      ) as HTMLButtonElement | null;
      btn?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (showSlot) {
    return (
      <div className="help-media">
        <div className="help-media-slot help-media-img" role="img" aria-label="Captura pendiente">
          <p className="help-media-kicker">Imagen</p>
          <p>Captura pendiente</p>
        </div>
        {caption}
      </div>
    );
  }

  const close = () => setOpen(false);

  return (
    <>
      <figure className="help-shot">
        <button
          type="button"
          className="help-shot-trigger"
          onClick={() => setOpen(true)}
          aria-label={`Ampliar imagen: ${captionText || alt}`}
        >
          <img src={src} alt={alt} onError={() => setFailed(true)} />
        </button>
        {caption}
      </figure>

      <PosModal
        open={open}
        className="help-lightbox no-print"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <ModalOverlayClose onClose={close}>
          <div
            className="pos-modal-panel help-lightbox-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <p id={titleId} className="help-lightbox-title">
              {captionText || alt || 'Imagen de ayuda'}
            </p>
            <img src={src} alt={alt} className="help-lightbox-img" />
          </div>
        </ModalOverlayClose>
      </PosModal>
    </>
  );
}
