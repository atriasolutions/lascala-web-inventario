import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type Props = {
  /** Valor a codificar (barcode del producto o, si falta, código interno). */
  value: string;
  className?: string;
  /** Etiqueta 50×25 mm: barras más bajas. */
  compact?: boolean;
};

/** Code128 compacto para voucher térmico 80 mm o etiqueta 50×25. */
export function ThermalBarcode({ value, className, compact }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const code = value.trim();

  useEffect(() => {
    if (!svgRef.current || !code) return;
    try {
      JsBarcode(svgRef.current, code, {
        format: 'CODE128',
        width: compact ? 1 : 1.15,
        height: compact ? 18 : 28,
        displayValue: true,
        fontSize: compact ? 8 : 9,
        textMargin: 0,
        margin: 0,
        marginTop: 0,
        marginBottom: 0,
      });
    } catch {
      /* valor no codificable: se muestra texto plano abajo */
    }
  }, [code, compact]);

  if (!code) return null;

  return (
    <div className={className ?? 'sale-print-barcode'}>
      <svg ref={svgRef} role="img" aria-label={`Código ${code}`} />
    </div>
  );
}
