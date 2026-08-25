type Props = {
  /** Mensaje corto bajo el logo. Por defecto «Cargando…». */
  label?: string;
  /** `page` = ruta completa; `block` = zona de lista/panel. */
  variant?: 'page' | 'block';
  className?: string;
};

/**
 * Loading boutique L'Scala: monograma animado + copy corto.
 * Para Suspense de ruta y bloques de lista (no splash eterno de app).
 */
export function BoutiqueLoader({
  label = 'Cargando…',
  variant = 'page',
  className = '',
}: Props) {
  return (
    <div
      className={`boutique-loader boutique-loader--${variant}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="boutique-loader-mark" aria-hidden="true">
        <img src="/brand/lscala-logo-mark.png" alt="" />
        <span className="boutique-loader-ring" />
      </div>
      <p className="boutique-loader-label">{label}</p>
    </div>
  );
}
