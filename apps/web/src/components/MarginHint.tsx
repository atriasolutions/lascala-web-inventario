import { money } from '../lib/api';
import { computeMargin, MIN_SALE_COST_MULTIPLIER } from '../lib/margin';

type Props = {
  cost: number | null | undefined;
  sale: number | null | undefined;
  className?: string;
};

/** Margen en vivo al ingresar Precio costo / p. venta. */
export function MarginHint({ cost, sale, className = '' }: Props) {
  const info = computeMargin(cost, sale);
  // Siempre el mismo root (<div>) para no remountar hermanos del input al tipiar.
  if (!info) {
    return (
      <div className={`margin-hint${className ? ` ${className}` : ''}`}>
        <p className="ing-hint margin-hint">
          Con Precio costo y p. venta verás el margen. Sugerido ≈ 2× Precio costo.
        </p>
      </div>
    );
  }

  const markupLabel = `${info.markupPct >= 0 ? '+' : ''}${Math.round(info.markupPct)}% sobre costo`;
  return (
    <div className={`margin-hint${info.isLow ? ' is-low' : ''}${className ? ` ${className}` : ''}`}>
      <p className="ing-hint" style={{ marginBottom: info.isLow ? '0.25rem' : undefined }}>
        Margen {money(info.amount)} ({markupLabel})
        {info.ratio >= MIN_SALE_COST_MULTIPLIER
          ? ` · sugerido ${money(info.suggestedSale)}`
          : null}
      </p>
      {info.isLow ? (
        <p className="error margin-hint-warn" role="status">
          Margen bajo: la venta está bajo {MIN_SALE_COST_MULTIPLIER}× el Precio costo. Revisa antes de
          guardar.
        </p>
      ) : null}
    </div>
  );
}
