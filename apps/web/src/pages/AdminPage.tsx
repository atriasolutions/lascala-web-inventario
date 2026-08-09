import { type FormEvent, useEffect, useState } from 'react';
import { PrinterPrefsCard } from '../components/PrinterPrefsCard';
import { WorkplaceSwitcher } from '../components/WorkplaceSwitcher';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export function AdminPage() {
  const { branchId, refreshBranches, branches } = useAuth();
  const isOwner = branches.some((b) => b.role === 'owner');
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', role: 'seller',
  });
  const [branchForm, setBranchForm] = useState({ code: '', name: '', city: '' });
  const [posForm, setPosForm] = useState({ code: '', name: '' });

  async function load() {
    try {
      const data = await api<{ users: any[] }>('/api/users');
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Solo owner puede administrar');
    }
  }

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner]);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (!branchId) return;
    await api('/api/users', {
      method: 'POST',
      body: { ...form, branchId },
    });
    setForm({ email: '', password: '', fullName: '', role: 'seller' });
    await load();
  }

  async function createBranch(e: FormEvent) {
    e.preventDefault();
    await api('/api/catalog/branches', { method: 'POST', body: branchForm });
    setBranchForm({ code: '', name: '', city: '' });
    await refreshBranches();
  }

  async function createPos(e: FormEvent) {
    e.preventDefault();
    if (!branchId) return;
    await api('/api/catalog/pos', {
      method: 'POST',
      body: { branchId, ...posForm },
    });
    setPosForm({ code: '', name: '' });
    await refreshBranches();
  }

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <PrinterPrefsCard />

      {isOwner && (
        <div className="card workplace-admin-card">
          <WorkplaceSwitcher />
        </div>
      )}

      {isOwner ? (
        <>
          <div className="card">
            <div className="page-intro">
              <h2>Admin</h2>
              <p>Sucursales, POS y usuarias · Atria / L'Scala</p>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="list-cards mobile-only">
              {users.map((u) => (
                <div className="list-card" key={u.id}>
                  <strong>{u.full_name}</strong>
                  <div className="meta">{u.email}</div>
                  <div className="meta">
                    {(u.branches || [])
                      .map((b: { branchName: string; role: string }) => `${b.branchName} (${b.role})`)
                      .join(' · ')}
                  </div>
                </div>
              ))}
            </div>
            <div className="table-wrap desktop-only">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Sucursales</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>
                        {(u.branches || [])
                          .map(
                            (b: { branchName: string; role: string }) =>
                              `${b.branchName} (${b.role})`,
                          )
                          .join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid two">
            <form className="card" onSubmit={createUser}>
              <h3>Nueva usuaria</h3>
              <div className="field">
                <label>Nombre</label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  required
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Password</label>
                <input
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="seller">Vendedora</option>
                  <option value="branch_manager">Encargada</option>
                  <option value="owner">Propietaria</option>
                </select>
              </div>
              <button className="btn block" type="submit">
                Crear en sucursal activa
              </button>
            </form>

            <div className="grid" style={{ gap: '1rem' }}>
              <form className="card" onSubmit={createBranch}>
                <h3>Nueva sucursal</h3>
                <div className="field">
                  <label>Código</label>
                  <input
                    required
                    value={branchForm.code}
                    onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Nombre</label>
                  <input
                    required
                    value={branchForm.name}
                    onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Ciudad</label>
                  <input
                    value={branchForm.city}
                    onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  />
                </div>
                <button className="btn secondary block" type="submit">
                  Crear sucursal
                </button>
              </form>
              <form className="card" onSubmit={createPos}>
                <h3>Nuevo POS</h3>
                <div className="field">
                  <label>Código</label>
                  <input
                    required
                    value={posForm.code}
                    onChange={(e) => setPosForm({ ...posForm, code: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Nombre</label>
                  <input
                    required
                    value={posForm.name}
                    onChange={(e) => setPosForm({ ...posForm, name: e.target.value })}
                  />
                </div>
                <button className="btn secondary block" type="submit">
                  Crear POS en sucursal activa
                </button>
              </form>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Las preferencias de impresoras se guardan en este equipo. La administración de usuarias y
            sucursales es solo para propietaria.
          </p>
        </div>
      )}
    </div>
  );
}
