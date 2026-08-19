import { type FormEvent, useEffect, useId, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';

type BranchRow = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  is_active: boolean;
};

type Sheet = { mode: 'create' } | { mode: 'edit'; branch: BranchRow } | null;

/** /admin/sucursales — CRUD de tiendas (sin mezclar cajas). */
export function AdminSucursalesPage() {
  const { branchId, refreshBranches } = useAuth();
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', city: '', address: '', isActive: true });
  const titleId = useId();

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ branches: BranchRow[] }>('/api/catalog/branches');
      setRows(data.branches);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las sucursales');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function closeSheet() {
    setSheet(null);
  }

  function openCreate() {
    setForm({ code: '', name: '', city: '', address: '', isActive: true });
    setSheet({ mode: 'create' });
  }

  function openEdit(branch: BranchRow) {
    setForm({
      code: branch.code,
      name: branch.name,
      city: branch.city || '',
      address: branch.address || '',
      isActive: branch.is_active,
    });
    setSheet({ mode: 'edit', branch });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (sheet?.mode === 'edit') {
        await api(`/api/catalog/branches/${sheet.branch.id}`, {
          method: 'PATCH',
          body: {
            code: form.code,
            name: form.name,
            city: form.city.trim() || null,
            address: form.address.trim() || null,
            isActive: form.isActive,
          },
        });
        toast.success('Sucursal actualizada');
      } else {
        await api('/api/catalog/branches', {
          method: 'POST',
          body: {
            code: form.code,
            name: form.name,
            city: form.city.trim() || undefined,
            address: form.address.trim() || undefined,
          },
        });
        toast.success('Sucursal creada');
      }
      closeSheet();
      await load();
      await refreshBranches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la sucursal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-panel" role="tabpanel">
      <div className="section-title admin-toolbar">
        <p className="muted admin-toolbar-hint">Las cajas se gestionan en la pestaña Cajas.</p>
        <div className="admin-toolbar-actions">
          <button type="button" className="btn" onClick={openCreate}>
            Nueva sucursal
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Cargando sucursales…</p>
      ) : !rows.length ? (
        <div className="admin-empty-dashed" role="status">
          <strong>Sin sucursales</strong>
          <p>Crea la primera para organizar stock y cajas.</p>
          <button type="button" className="btn" onClick={openCreate}>
            Nueva sucursal
          </button>
        </div>
      ) : (
        <div className="admin-boutique-grid">
          {rows.map((b) => {
            const isActiveCtx = b.id === branchId;
            return (
              <article
                key={b.id}
                className={`admin-boutique-card${isActiveCtx ? ' is-active' : ''}${
                  !b.is_active ? ' is-inactive' : ''
                }`}
              >
                <div className="admin-boutique-head">
                  <div>
                    <h3 className="admin-boutique-name">{b.name}</h3>
                    <p className="admin-boutique-meta">
                      {b.code}
                      {b.city ? ` · ${b.city}` : ''}
                    </p>
                    {b.address ? <p className="admin-boutique-meta">{b.address}</p> : null}
                  </div>
                  <div className="admin-chip-row">
                    {isActiveCtx ? <span className="admin-chip is-brand">En uso</span> : null}
                    <span className={`admin-chip${b.is_active ? ' is-ok' : ' is-off'}`}>
                      {b.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
                <div className="admin-user-actions">
                  <button type="button" className="btn secondary" onClick={() => openEdit(b)}>
                    Editar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sheet ? (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet();
          }}
        >
          <div
            className="pos-modal-panel admin-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={titleId}>{sheet.mode === 'edit' ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
              <button type="button" className="btn ghost" onClick={closeSheet} aria-label="Cerrar">
                Cerrar
              </button>
            </div>
            <form className="admin-sheet-form" onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="admin-branch-code">Código</label>
                <input
                  id="admin-branch-code"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ej. CAL"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-branch-name">Nombre</label>
                <input
                  id="admin-branch-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. L'Scala Calama"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-branch-city">Ciudad</label>
                <input
                  id="admin-branch-city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Calama"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-branch-address">Dirección</label>
                <input
                  id="admin-branch-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Calle, número"
                />
              </div>
              {sheet.mode === 'edit' ? (
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Sucursal activa
                </label>
              ) : null}
              <div className="admin-sheet-actions">
                <button type="button" className="btn ghost" onClick={closeSheet}>
                  Cancelar
                </button>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : sheet.mode === 'edit' ? 'Guardar' : 'Crear sucursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
