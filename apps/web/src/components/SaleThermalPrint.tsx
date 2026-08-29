import { money } from '../lib/api';
import {
  CHANGE_TICKET_DAYS,
  ESC_POS_CUT_MARKER,
  NON_TAX_DISCLAIMER,
  RECEIPT_CHANGE_RULES,
  SALE_BUSINESS,
  THERMAL_PAPER_WIDTH_MM,
  escPosBarcodeMarker,
  fmtPrintDateOnly,
  fmtPrintDateTime,
  resolveAccessScanCode,
  resolveVoucherScanCode,
  thermalPadLine,
  ticketModeLabel,
  type SalePrintJob,
} from '../lib/salePrint';
import { paymentMethodLabel } from '../lib/paymentMethod';
import { ThermalBarcode } from './ThermalBarcode';

type Props = {
  job: SalePrintJob;
};

const RULE = '------------------------------------------------';
const DOTS = '················································';

/**
 * Comprobante + vouchers compactos (menos papel).
 * Labels con ":" explícito; cortes ASCII; voucher: barcode boleta + barcode prenda.
 */
export function SaleThermalPrint({ job }: Props) {
  const { sale, items, changeTickets, reprint } = job;

  return (
    <div
      className="sale-print-root"
      aria-hidden
      data-paper={`${THERMAL_PAPER_WIDTH_MM}mm`}
    >
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
        <h1 className="sale-print-title">COMPROBANTE DE VENTA</h1>
        {reprint ? <p className="sale-print-tag">Reimpresión</p> : null}
        <p className="sale-print-disclaimer sale-print-disclaimer-dense">{NON_TAX_DISCLAIMER}</p>

        <p className="sale-print-kv">
          Folio: {sale.receipt_number} · {fmtPrintDateTime(sale.sold_at)}
        </p>
        <p className="sale-print-kv">
          {[sale.branch_name ? `Suc: ${sale.branch_name}` : null, `Caja: ${sale.pos_name}`, `Vend: ${sale.seller_name}`]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <p className="sale-print-sep mono">{DOTS}</p>

        {items.map((i) => {
          const detail = [
            i.internal_code,
            i.size_label ? `T.${i.size_label}` : null,
            i.color || null,
          ]
            .filter(Boolean)
            .join(' · ');
          const right = `${String(i.quantity).padStart(2, ' ')} ${money(i.line_total)}`;
          return (
            <div key={i.id} className="sale-print-item">
              <p className="sale-print-item-name mono">
                {thermalPadLine(i.name.slice(0, 28), right)}
              </p>
              {detail ? <p className="sale-print-item-meta">{detail}</p> : null}
            </div>
          );
        })}

        <p className="sale-print-sep mono">{DOTS}</p>

        {sale.subtotal && Number(sale.subtotal) !== Number(sale.total) ? (
          <p className="sale-print-total-line mono">
            {thermalPadLine('Subtotal', money(sale.subtotal))}
          </p>
        ) : null}
        {Number(sale.discount) > 0 ? (
          <p className="sale-print-total-line mono">
            {thermalPadLine('Descuento', `-${money(sale.discount)}`)}
          </p>
        ) : null}
        <p className="sale-print-total-line sale-print-total-strong mono">
          {thermalPadLine('TOTAL', money(sale.total))}
        </p>
        <p className="sale-print-total-line mono">
          {thermalPadLine('Pago', paymentMethodLabel(sale.payment_method))}
        </p>

        {sale.notes?.trim() ? (
          <p className="sale-print-notes">Notas: {sale.notes.trim()}</p>
        ) : null}

        <p className="sale-print-sep mono">{RULE}</p>
        <p className="sale-print-conditions-title">Cambios</p>
        {RECEIPT_CHANGE_RULES.map((rule) => (
          <p key={rule} className="sale-print-rule">
            · {rule}
          </p>
        ))}
        <p className="sale-print-foot">Gracias · L&apos;Scala {SALE_BUSINESS.city}</p>
      </article>

      {changeTickets.map((t) => {
        const attrs = [t.sizeLabel ? `T.${t.sizeLabel}` : null, t.color || null]
          .filter(Boolean)
          .join(' · ');
        const validUntil = t.expiresAt
          ? fmtPrintDateOnly(t.expiresAt)
          : `${CHANGE_TICKET_DAYS}d`;
        const accessCode = resolveAccessScanCode(t);
        const prendaCode = resolveVoucherScanCode(t);
        const prendaLine = [t.productName, attrs].filter(Boolean).join(' · ');

        return (
          <div key={t.key} className="sale-print-voucher-wrap">
            <p className="sale-print-cut mono">{ESC_POS_CUT_MARKER}</p>
            <article className="sale-print-block sale-change-ticket-print">
              <h1 className="sale-print-title sale-print-title-sm">{ticketModeLabel(t.mode)}</h1>
              <p className="sale-print-voucher-line">Venta {t.receiptNumber}</p>
              <p className="sale-print-voucher-line">
                <strong>{prendaLine}</strong>
              </p>
              <p className="sale-print-voucher-line">
                Cód: {t.internalCode} · Hasta: {validUntil}
              </p>
              <div className="sale-print-bc-stack">
                {accessCode ? (
                  <VoucherBarcodeBlock label="Ticket" value={accessCode} />
                ) : null}
                {prendaCode && prendaCode !== accessCode ? (
                  <VoucherBarcodeBlock label="Prenda" value={prendaCode} />
                ) : null}
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}

function VoucherBarcodeBlock({ label, value }: { label: string; value: string }) {
  const code = value.trim();
  if (!code) return null;
  const marker = escPosBarcodeMarker(code);
  return (
    <div className="sale-print-bc-block">
      <p className="sale-print-bc-label">{label}</p>
      {marker ? (
        <p className="sale-print-barcode-marker mono" aria-hidden>
          {marker}
        </p>
      ) : null}
      <ThermalBarcode value={code} compact />
    </div>
  );
}
