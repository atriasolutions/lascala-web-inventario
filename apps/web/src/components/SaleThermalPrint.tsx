import { money } from '../lib/api';
import {
  CHANGE_TICKET_DAYS,
  NON_TAX_DISCLAIMER,
  RECEIPT_CHANGE_RULES,
  SALE_BUSINESS,
  THERMAL_PAPER_WIDTH_MM,
  VOUCHER_NON_TAX,
  fmtPrintDateOnly,
  fmtPrintDateTime,
  ticketModeLabel,
  type SalePrintJob,
} from '../lib/salePrint';
import { ThermalBarcode } from './ThermalBarcode';

type Props = {
  job: SalePrintJob;
};

export function SaleThermalPrint({ job }: Props) {
  const { sale, items, changeTickets, reprint } = job;

  return (
    <div
      className="sale-print-root"
      aria-hidden
      data-paper={`${THERMAL_PAPER_WIDTH_MM}mm`}
    >
      {/*
        Rollo continuo 80 mm. Headers/footers del navegador (fecha, URL, páginas)
        no se controlan por CSS: en Chrome desmarcar “Encabezados y pies de página”.
      */}
      <article className="sale-print-block sale-receipt-print">
        <header className="sale-print-header">
          <img
            className="sale-print-logo"
            src={SALE_BUSINESS.logoUrl}
            alt=""
            width={44}
            height={44}
          />
          <p className="sale-print-legal">{SALE_BUSINESS.legalName}</p>
          <p className="sale-print-rut">RUT {SALE_BUSINESS.rut}</p>
          <p className="sale-print-address">{SALE_BUSINESS.address}</p>
        </header>

        <h1 className="sale-print-title">COMPROBANTE DE VENTA</h1>
        {reprint ? <p className="sale-print-tag">Reimpresión</p> : null}

        <p className="sale-print-disclaimer">{NON_TAX_DISCLAIMER}</p>

        <dl className="sale-print-meta">
          <div>
            <dt>Folio</dt>
            <dd>{sale.receipt_number}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{fmtPrintDateTime(sale.sold_at)}</dd>
          </div>
          {sale.branch_name ? (
            <div>
              <dt>Sucursal</dt>
              <dd>{sale.branch_name}</dd>
            </div>
          ) : null}
          <div>
            <dt>Caja</dt>
            <dd>{sale.pos_name}</dd>
          </div>
          <div>
            <dt>Vendedora</dt>
            <dd>{sale.seller_name}</dd>
          </div>
        </dl>

        <table className="sale-print-lines">
          <thead>
            <tr>
              <th>Prenda</th>
              <th>Cant</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  <span>
                    {i.internal_code}
                    {i.size_label ? ` · T.${i.size_label}` : ''}
                    {i.color ? ` · ${i.color}` : ''}
                  </span>
                </td>
                <td>{i.quantity}</td>
                <td>{money(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sale-print-totals">
          {sale.subtotal && Number(sale.subtotal) !== Number(sale.total) ? (
            <div>
              <span>Subtotal</span>
              <strong>{money(sale.subtotal)}</strong>
            </div>
          ) : null}
          {Number(sale.discount) > 0 ? (
            <div>
              <span>Descuento</span>
              <strong>−{money(sale.discount)}</strong>
            </div>
          ) : null}
          <div className="is-total">
            <span>TOTAL</span>
            <strong>{money(sale.total)}</strong>
          </div>
        </div>

        {sale.notes?.trim() ? (
          <p className="sale-print-notes">Notas: {sale.notes.trim()}</p>
        ) : null}

        <div className="sale-print-policy">
          <p className="sale-print-conditions-title">Cambios y devoluciones</p>
          <ul className="sale-print-rules">
            {RECEIPT_CHANGE_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
        <p className="sale-print-foot">Gracias · Boutique L&apos;Scala · {SALE_BUSINESS.city}</p>
      </article>

      {changeTickets.map((t) => {
        const detail = [t.sizeLabel, t.color].filter(Boolean).join(' · ');
        const validUntil = t.expiresAt
          ? fmtPrintDateOnly(t.expiresAt)
          : `${CHANGE_TICKET_DAYS} días`;
        const barcodeValue = (t.barcode || t.internalCode || '').trim();

        return (
          <div key={t.key} className="sale-print-voucher-wrap">
            <div className="sale-print-perforation" aria-hidden>
              ✂
            </div>
            <article className="sale-print-block sale-change-ticket-print">
              <header className="sale-print-voucher-head">
                <img
                  className="sale-print-logo sale-print-logo-xs"
                  src={SALE_BUSINESS.logoUrl}
                  alt=""
                  width={20}
                  height={20}
                />
                <div>
                  <p className="sale-print-legal sale-print-legal-sm">L&apos;SCALA</p>
                  <p className="sale-print-rut">RUT {SALE_BUSINESS.rut}</p>
                </div>
              </header>

              <h1 className="sale-print-title sale-print-title-sm">{ticketModeLabel(t.mode)}</h1>
              <p className="sale-print-voucher-n">{t.voucherNumber}</p>

              <p className="sale-print-voucher-line">
                <strong>{t.productName}</strong>
                <span>
                  Cód. {t.internalCode}
                  {detail ? ` · ${detail}` : ''}
                </span>
              </p>

              {barcodeValue ? <ThermalBarcode value={barcodeValue} /> : null}

              <p className="sale-print-voucher-line sale-print-voucher-meta">
                Venta {t.receiptNumber} · Válido hasta {validUntil}
              </p>
              <p className="sale-print-disclaimer sale-print-disclaimer-sm">{VOUCHER_NON_TAX}</p>
            </article>
          </div>
        );
      })}
    </div>
  );
}
