/** Asset público: prenda realista muted + label “Sin foto”. */
export const PRODUCT_NO_PHOTO_SRC = '/brand/product-no-photo.png';

type Props = {
  className?: string;
  /** Decorative: sin alt (el contexto ya comunica). */
  decorative?: boolean;
  /** Mostrar label “Sin foto” (false en empty stage de Caja). */
  showLabel?: boolean;
};

/**
 * Placeholder único cuando una prenda no tiene foto cargada.
 * No usar para empty state de “aún no hay producto seleccionado”.
 */
export function ProductPhotoPlaceholder({
  className = '',
  decorative = true,
  showLabel = true,
}: Props) {
  return (
    <span
      className={`product-no-photo${className ? ` ${className}` : ''}`}
      aria-hidden={decorative || undefined}
    >
      <img
        src={PRODUCT_NO_PHOTO_SRC}
        alt={decorative ? '' : 'Sin foto'}
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      {showLabel ? <span className="product-no-photo-label">Sin foto</span> : null}
    </span>
  );
}
