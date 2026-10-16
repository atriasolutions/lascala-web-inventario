import { money } from '../lib/api';
import {
  NON_TAX_DISCLAIMER,
  SALE_BUSINESS,
  THERMAL_PAPER_WIDTH_MM,
  escPosBarcodeMarker,
  fmtPrintDateTime,
  thermalPadLine,
} from '../lib/salePrint';
import { paymentMethodLabel } from '../lib/paymentMethod';
import { ThermalBarcode } from './ThermalBarcode';

export type DepositPrintSlip = {
  number: string;
  customerName: string | null;
  paid: number;
  total: number;
  paymentMethod: string;
  branchName?: string | null;
  posName?: string | null;
  sellerName?: string | null;
  createdAt: string;
  reprint?: boolean;
  items: Array<{
    name: string;
    code: string;
    size?: string | null;
    quantity: number;
    lineTotal: number;
  }>;
};

const RULE = '------------------------------------------------';
const DOTS = '················································';

export function DepositThermalPrint({ slip }: { slip: DepositPrintSlip }) {
  const pending = Math.max(0, Math.round(slip.total) - Math.round(slip.paid));
  const pct = slip.total > 0 ? Math.round((slip.paid / slip.total) * 100) : 0;

  return (
    <div className="sale-print-root" aria-hidden data-paper={`${THERMAL_PAPER_WIDTH_MM}mm`}>
      <article className="sale-print-block sale-receipt-print">
        <header className="sale-print-header sale-print-header-compact">
          <p className="sale-print-wordmark">L&apos;SCALA</p>
          <p className="sale-print-legal">{SALE_BUSINESS.legalName}</p>
          <p className="sale-print-rut">
            RUT {SALE_BUSINESS.rut} · {SALE_BUSINESS.city}
          </p>
          <p className="sale-print-address">{SALE_BUSINESS.address}</p>
        </header>
        <p className="sale-print-sep mono">{RULE}</p>
        <h1 className="sale-print-title">COMPROBANTE DE ABONO</h1>
        {slip.reprint ? <p className="sale-print-tag">Reimpresión</p> : null}
        <p className="sale-print-disclaimer sale-print-disclaimer-dense">{NON_TAX_DISCLAIMER}</p>
        <p className="sale-print-kv">
          Folio: {slip.number} · {fmtPrintDateTime(slip.createdAt)}
        </p>
        <p className="sale-print-kv">
          {[
            slip.branchName ? `Suc: ${slip.branchName}` : null,
            slip.posName ? `Caja: ${slip.posName}` : null,
            slip.sellerName ? `Vend: ${slip.sellerName}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {slip.customerName ? (
          <p className="sale-print-kv">Reserva: {slip.customerName}</p>
        ) : null}
        <p className="sale-print-sep mono">{DOTS}</p>
        {slip.items.map((item, i) => {
          const detail = [item.code, item.size ? `T.${item.size}` : null].filter(Boolean).join(' · ');
          const right = `${String(item.quantity).padStart(2, ' ')} ${money(item.lineTotal)}`;
          return (
            <div key={`${item.code}-${i}`} className="sale-print-item">
              <p className="sale-print-item-name mono">{thermalPadLine(item.name.slice(0, 28), right)}</p>
              {detail ? <p className="sale-print-item-meta">{detail}</p> : null}
            </div>
          );
        })}
        <p className="sale-print-sep mono">{DOTS}</p>
        <p className="sale-print-total-line mono">{thermalPadLine('Total', money(slip.total))}</p>
        <p className="sale-print-total-line sale-print-total-em mono">
          {thermalPadLine('Abonado', money(slip.paid))}
        </p>
        <p className="sale-print-total-line mono">{thermalPadLine('Pendiente', money(pending))}</p>
        <p className="sale-print-total-line mono">{thermalPadLine('Avance', `${pct}%`)}</p>
        <p className="sale-print-total-line mono">
          {thermalPadLine('Pago', paymentMethodLabel(slip.paymentMethod))}
        </p>
        <p className="sale-print-sep mono">{RULE}</p>
        <p className="sale-print-barcode-marker mono" aria-hidden>
          {escPosBarcodeMarker(slip.number)}
        </p>
        <ThermalBarcode value={slip.number} compact />
        <p className="sale-print-foot">{slip.number}</p>
        <p className="sale-print-foot">Gracias · L&apos;Scala {SALE_BUSINESS.city}</p>
      </article>
    </div>
  );
}
