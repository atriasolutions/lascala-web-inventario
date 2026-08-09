import { type FormEvent, useEffect, useState } from 'react';
import { api, money } from '../lib/api';

export function MermasPage() {
  const [mermas, setMermas] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [m, v, p] = await Promise.all([
      api<{ mermas: any[] }>('/api/ops/mermas'),
      api<{ vouchers: any[] }>('/api/ops/vouchers'),
      api<{ products: any[] }>('/api/products'),
    ]);
    setMermas(m.mermas);
    setVouchers(v.vouchers);
    setProducts(p.products);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/ops/mermas', {
        method: 'POST',
        body: { productId, quantity: Number(qty), reason },
      });
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div className="grid two">
      <div className="card">
        <div className="page-intro">
          <h2>Mermas y cambios</h2>
          <p>Pérdidas y vouchers de la sucursal</p>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="list-cards mobile-only">
          {mermas.map((m) => (
            <div className="list-card" key={m.id}>
              <div className="row">
                <strong>{m.product_name}</strong>
                <strong>{money(m.cost_impact)}</strong>
              </div>
              <div className="meta">Qty {m.quantity} · {m.reason}</div>
            </div>
          ))}
        </div>
        <div className="table-wrap desktop-only">
          <table className="table">
            <thead><tr><th>Producto</th><th>Qty</th><th>Motivo</th><th>Costo</th></tr></thead>
            <tbody>
              {mermas.map((m) => (
                <tr key={m.id}>
                  <td>{m.product_name}</td>
                  <td>{m.quantity}</td>
                  <td>{m.reason}</td>
                  <td>{money(m.cost_impact)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: '1.25rem' }}>Vouchers de cambio</h3>
        <div className="list-cards mobile-only">
          {vouchers.map((v) => (
            <div className="list-card" key={v.id}>
              <div className="row">
                <strong>{v.voucher_number}</strong>
                <span className="meta">{v.status}</span>
              </div>
              <div className="meta">{v.product_name} · vence {String(v.expires_at).slice(0, 10)}</div>
            </div>
          ))}
        </div>
        <div className="table-wrap desktop-only">
          <table className="table">
            <thead><tr><th>N°</th><th>Producto</th><th>Vence</th><th>Estado</th></tr></thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id}>
                  <td>{v.voucher_number}</td>
                  <td>{v.product_name}</td>
                  <td>{String(v.expires_at).slice(0, 10)}</td>
                  <td>{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card" onSubmit={onSubmit}>
        <h3>Registrar merma</h3>
        <div className="field">
          <label>Producto</label>
          <select required value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Seleccionar</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.internal_code} · {p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Cantidad</label><input type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div className="field"><label>Motivo</label><textarea required value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <button className="btn block" type="submit">Guardar merma</button>
      </form>
    </div>
  );
}
