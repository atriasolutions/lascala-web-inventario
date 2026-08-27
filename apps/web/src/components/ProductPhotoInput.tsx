import { useId } from 'react';

type Props = {
  disabled?: boolean;
  busy?: boolean;
  hasPhoto: boolean;
  onPick: (file: File | null) => void;
  className?: string;
};

/** Cámara + galería (sin forzar solo cámara en iPhone). */
export function ProductPhotoInput({ disabled, busy, hasPhoto, onPick, className }: Props) {
  const galleryId = useId();
  const cameraId = useId();
  const blocked = disabled || busy;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    void onPick(e.target.files?.[0] ?? null);
    e.target.value = '';
  }

  return (
    <div className={`prod-photo-input${className ? ` ${className}` : ''}`}>
      <label className="ing-photo-btn" htmlFor={galleryId}>
        {busy ? 'Subiendo…' : hasPhoto ? 'Cambiar foto' : 'Elegir de galería'}
      </label>
      <label className="ing-photo-btn ing-photo-btn-secondary" htmlFor={cameraId}>
        Tomar foto
      </label>
      <input
        id={galleryId}
        type="file"
        accept="image/*"
        hidden
        disabled={blocked}
        onChange={handleChange}
      />
      <input
        id={cameraId}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        disabled={blocked}
        onChange={handleChange}
      />
    </div>
  );
}
