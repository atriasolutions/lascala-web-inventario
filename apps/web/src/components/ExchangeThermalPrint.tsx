import { money } from '../lib/api';
import { formatDay } from '../lib/civilDate';
import { paymentMethodLabel } from '../lib/paymentMethod';
import {
  NON_TAX_DISCLAIMER,
  SALE_BUSINESS,
  THERMAL_PAPER_WIDTH_MM,
  escPosBarcodeMarker,
  fmtPrintDateTime,
  thermalPadLine,
} from '../lib/salePrint';
import { ThermalBarcode } from './ThermalBarcode';

export type ExchangePrintSlip = {
  kind: 'credit' | 'paid';
  voucherNumber: string;
  branchName?: string | null;
  outName: string;
  outCode: string;
  outSize?: string | null;
  inName: string;
  inCode: string;
  inSize?: string | null;
  quantity: number;
  paidDiff?: number | null;
  paymentMethod?: string | null;
  creditBarcode?: string | null;
  creditFolio?: string | null;
  creditAmount?: number | null;
  expiresAt?: string | null;
  reprint?: boolean;
};

const RULE = '------------------------------------------------';
const DOTS = '················································';

function garmentLine(name: string, code: string, size?: string | null) {
  const bits = [code, size ? `T.${size}` : null].filter(Boolean).join(' · ');
  return bits ? `${name} (${bits})` : name;
}

export function ExchangeThermalPrint({ slip }: { slip: ExchangePrintSlip }) {
  const barcode = slip.kind === 'credit' ? slip.creditBarcode || '' : slip.voucherNumber;
  const title = slip.kind === 'credit' ? 'CRÉDITO POR CAMBIO' : 'COMPROBANTE DE CAMBIO';

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
        <h1 className="sale-print-title">{title}</h1>
        {slip.reprint ? <p className="sale-print-tag">Reimpresión</p> : null}
        <p className="sale-print-disclaimer sale-print-disclaimer-dense">{NON_TAX_DISCLAIMER}</p>
        <p className="sale-print-kv">
          Ticket {slip.voucherNumber}
          {slip.branchName ? ` · ${slip.branchName}` : ''}
        </p>
        <p className="sale-print-kv">{fmtPrintDateTime(new Date().toISOString())}</p>
        <p className="sale-print-sep mono">{DOTS}</p>
        <p className="sale-print-kv">Sale</p>
        <p className="sale-print-item-name mono">
          {garmentLine(slip.outName, slip.outCode, slip.outSize)}
        </p>
        <p className="sale-print-kv">Entra</p>
        <p className="sale-print-item-name mono">
          {garmentLine(slip.inName, slip.inCode, slip.inSize)}
        </p>
        <p className="sale-print-total-line mono">
          {thermalPadLine('Cantidad', String(slip.quantity))}
        </p>
        <p className="sale-print-sep mono">{DOTS}</p>
        {slip.kind === 'credit' ? (
          <>
            <p className="sale-print-total-line sale-print-total-em mono">
              {thermalPadLine('A favor', money(slip.creditAmount || 0))}
            </p>
            {slip.creditFolio ? (
              <p className="sale-print-total-line mono">
                {thermalPadLine('Folio', slip.creditFolio)}
              </p>
            ) : null}
            <p className="sale-print-total-line mono">
              {thermalPadLine('Código', slip.creditBarcode || '')}
            </p>
            <p className="sale-print-total-line mono">
              {thermalPadLine(
                'Vence',
                slip.expiresAt ? formatDay(slip.expiresAt) : '',
              )}
            </p>
            <p className="sale-print-kv">Un solo uso. Pistolea este código en Ventas.</p>
            <p className="sale-print-kv">Si el crédito supera el total, no aplica.</p>
          </>
        ) : (
          <>
            <p className="sale-print-total-line sale-print-total-em mono">
              {thermalPadLine('Diferencia', money(slip.paidDiff || 0))}
            </p>
            <p className="sale-print-total-line mono">
              {thermalPadLine('Pago', paymentMethodLabel(slip.paymentMethod))}
            </p>
            <p className="sale-print-kv">Cambio realizado. Diferencia pagada en caja.</p>
          </>
        )}
        <p className="sale-print-sep mono">{RULE}</p>
        <p className="sale-print-barcode-marker mono" aria-hidden>
          {escPosBarcodeMarker(barcode)}
        </p>
        <ThermalBarcode value={barcode} compact />
        <p className="sale-print-foot">{barcode}</p>
        <p className="sale-print-foot">Gracias · L&apos;Scala {SALE_BUSINESS.city}</p>
      </article>
    </div>
  );
}
