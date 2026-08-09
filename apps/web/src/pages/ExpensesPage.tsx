import { type FormEvent, useEffect, useState } from 'react';
import { api, money } from '../lib/api';

const CATEGORIES = ['Remuneraciones', 'Arriendo', 'Viajes', 'Alimentación', 'Servicios básicos', 'Otros'];

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [form, setForm] = useState({ category: 'Arriendo', description: '', amount: '' });
  const [error, setError] = useState('');

  async function load() {
    const data = await api<{ expenses: any[] }>('/api/ops/expenses');
    setExpenses(data.expenses);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/api/ops/expenses', {
        method: 'POST',
        body: { ...form, amount: Number(form.amount) },
      });
      setForm({ category: 'Arriendo', description: '', amount: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div className="grid two">
      <div className="card">
        <div className="page-intro">
          <h2>Gastos</h2>
          <p>Costos operativos de la sucursal</p>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="list-cards mobile-only">
          {expenses.map((x) => (
            <div className="list-card" key={x.id}>
              <div className="row">
                <strong>{x.description}</strong>
                <strong>{money(x.amount)}</strong>
              </div>
              <div className="meta">{String(x.incurred_on).slice(0, 10)} · {x.category}</div>
            </div>
          ))}
        </div>
        <div className="table-wrap desktop-only">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead>
            <tbody>
              {expenses.map((x) => (
                <tr key={x.id}>
                  <td>{String(x.incurred_on).slice(0, 10)}</td>
                  <td>{x.category}</td>
                  <td>{x.description}</td>
                  <td>{money(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <form className="card" onSubmit={onSubmit}>
        <h3>Nuevo gasto</h3>
        <div className="field">
          <label>Categoría</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label>Descripción</label><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="field"><label>Monto</label><input required type="number" min="0" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <button className="btn block" type="submit">Registrar</button>
      </form>
    </div>
  );
}
