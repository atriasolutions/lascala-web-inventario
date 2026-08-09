type BoutiqueMoodProps = {
  image?: string;
  kicker?: string;
  title: string;
  copy?: string;
  className?: string;
};

/** Panel visual de boutique para llenar huecos en desktop (sin ser marketing genérico). */
export function BoutiqueMood({
  image = '/brand/ingresos-mood.jpg',
  kicker = "Boutique L'Scala",
  title,
  copy,
  className = '',
}: BoutiqueMoodProps) {
  return (
    <aside className={`boutique-mood ${className}`.trim()} aria-hidden="true">
      <img className="boutique-mood-img" src={image} alt="" />
      <div className="boutique-mood-veil" />
      <div className="boutique-mood-copy">
        <p className="boutique-mood-kicker">{kicker}</p>
        <p className="boutique-mood-title">{title}</p>
        {copy ? <p className="boutique-mood-text">{copy}</p> : null}
      </div>
    </aside>
  );
}
