import { useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { fileToDataUrl } from '../pages/compras/purchaseFormTypes';
import { ProductPhotoInput } from './ProductPhotoInput';

type Props = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
};

/** Adjuntar una imagen (comprobante/foto). Galería o cámara. */
export function AttachImageField({
  value,
  onChange,
  disabled,
  label = 'Comprobante (foto)',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = value ? mediaUrl(value) : null;

  async function onPick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('La imagen debe ser JPG o PNG');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const image = await fileToDataUrl(file);
      const data = await api<{ url: string }>('/api/uploads', {
        method: 'POST',
        body: { image },
      });
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field attach-image-field">
      <span className="attach-image-label">{label}</span>
      {preview ? (
        <div className="attach-image-preview">
          <img src={preview} alt="" />
          {!disabled ? (
            <div className="attach-image-actions">
              <ProductPhotoInput
                hasPhoto
                busy={busy}
                disabled={disabled}
                onPick={(file) => void onPick(file)}
              />
              <button
                type="button"
                className="btn ghost"
                disabled={disabled || busy}
                onClick={() => onChange('')}
              >
                Quitar
              </button>
            </div>
          ) : null}
        </div>
      ) : disabled ? (
        <p className="muted">Sin imagen</p>
      ) : (
        <ProductPhotoInput
          hasPhoto={false}
          busy={busy}
          disabled={disabled}
          onPick={(file) => void onPick(file)}
        />
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
