import { type FormEvent, useEffect, useState } from 'react';
import { api, money, userFacingError } from '../lib/api';
import { formatDay } from '../lib/civilDate';
import { toast } from '../lib/toast';
import type { ExchangePrintSlip } from './ExchangeThermalPrint';

type CreditRow = {
  id: string;
  barcode: string;
  redeem_code?: string | null;
  amount: string;
  status: string;
  issued_at: string;
  expires_at: string;
  voucher_number: string | null;
  quantity: number | null;
  original_name: string | null;
  original_code: string | null;
  original_size: string | null;
  new_name: string | null;
  new_code: string | null;
  new_size: string | null;
};

const STATUS: Array<{ id: 'open' | 'used' | 'expired' | 'all'; label: string }> = [
  { id: 'open', label: 'Abiertos' },
  { id: 'used', label: 'Usados' },
  { id: 'expired', label: 'Vencidos' },
  { id: 'all', label: 'Todos' },
];

function statusBadge(status: string) {
  if (status === 'open') return 'badge success';
  if (status === 'expired') return 'badge warning';
  return 'badge';
}

function statusLabel(status: string) {
  if (status === 'open') return 'Abierto';
  if (status === 'used') return 'Usado';
  if (status === 'expired') return 'Vencido';
  if (status === 'cancelled') return 'Anulado';
  return status;
}

function maskCoupon(code: string | null | undefined): string {
  const c = String(code ?? '').trim();
  if (c.length < 4) return '';
  return `${c.slice(0, 2)}····${c.slice(-2)}`;
}

export function creditToSlip(row: CreditRow, branchName?: string | null): ExchangePrintSlip {
  return {
    kind: 'credit',
    voucherNumber: row.voucher_number || row.barcode,
    branchName,
    outName: row.original_name || 'Prenda devuelta',
    outCode: row.original_code || '',
    outSize: row.original_size,
    inName: row.new_name || 'Prenda nueva',
    inCode: row.new_code || '',
    inSize: row.new_size,
    quantity: row.quantity || 1,
    creditBarcode: row.redeem_code || '',
    creditFolio: row.barcode,
    creditAmount: Math.round(Number(row.amount) || 0),
    expiresAt: row.expires_at,
    reprint: true,
  };
}

export function StoreCreditsPanel({
  branchName,
  onPrint,
}: {
  branchName?: string | null;
  onPrint: (slip: ExchangePrintSlip) => void;
}) {
  const [status, setStatus] = useState<(typeof STATUS)[number]['id']>('open');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ status, limit: '100' });
    if (query.trim()) params.set('q', query.trim());
    void api<{ credits: CreditRow[] }>(`/api/sales/store-credits?${params}`)
      .then((data) => {
        if (!cancelled) setRows(data.credits || []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(userFacingError(err, 'No se pudieron cargar los créditos'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, query]);

  function onScan(e: FormEvent) {
    e.preventDefault();
    setQuery(q.trim().toUpperCase().replace(/\s+/g, ''));
  }

  return (
    <div className="merma-credits">
      <p className="muted merma-credits-lead">
        Créditos de esta sucursal. Vigencia de 6 meses y un solo uso. Pistolea el código en Ventas.
      </p>
      <form className="merma-scan-row abonos-list-scan" onSubmit={onScan}>
        <label className="sr-only" htmlFor="credit-scan">
          Código de crédito
        </label>
        <input
          id="credit-scan"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pistolea el crédito (CR…)"
          autoComplete="off"
        />
        <button type="submit" className="btn">
          Buscar
        </button>
      </form>
      <div className="ing-filters" role="toolbar" aria-label="Estado del crédito">
        {STATUS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`ing-chip${status === s.id ? ' is-active' : ''}`}
            aria-pressed={status === s.id}
            onClick={() => setStatus(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {loading ? <p className="muted">Cargando…</p> : null}
      {!loading && !rows.length ? (
        <p className="muted">No hay créditos con este filtro.</p>
      ) : null}
      {!loading && rows.length ? (
        <div className="ing-list-scroll abonos-list">
          <div className="list-cards mobile-only">
            {rows.map((row) => (
              <article key={row.id} className="list-card sales-card">
                <div className="row">
                  <strong>{row.barcode}</strong>
                  <span className={statusBadge(row.status)}>{statusLabel(row.status)}</span>
                </div>
                <div className="sales-card-total">{money(row.amount)}</div>
                <div className="meta">Vence {formatDay(row.expires_at)}</div>
                {row.redeem_code ? <div className="meta">Cupón {maskCoupon(row.redeem_code)}</div> : null}
                <div className="meta">
                  {row.original_name || 'Prenda'} → {row.new_name || 'prenda nueva'}
                </div>
                <div className="meta">{row.voucher_number ? `Ticket ${row.voucher_number}` : ''}</div>
                <div className="sales-card-foot">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => onPrint(creditToSlip(row, branchName))}
                  >
                    Reimprimir
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="table-wrap desktop-only">
            <table className="table sales-table abonos-table credits-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Vence</th>
                  <th>Cambio</th>
                  <th>Ticket</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.barcode}</strong>
                      {row.redeem_code ? (
                        <div className="meta">Cupón {maskCoupon(row.redeem_code)}</div>
                      ) : null}
                    </td>
                    <td className="sales-num">{money(row.amount)}</td>
                    <td>
                      <span className={statusBadge(row.status)}>{statusLabel(row.status)}</span>
                    </td>
                    <td>{formatDay(row.expires_at)}</td>
                    <td>
                      {row.original_name || 'Prenda'} → {row.new_name || 'prenda nueva'}
                    </td>
                    <td>{row.voucher_number || '—'}</td>
                    <td className="credits-reprint">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => onPrint(creditToSlip(row, branchName))}
                      >
                        Reimprimir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
