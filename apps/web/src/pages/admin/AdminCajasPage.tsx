import { type FormEvent, useEffect, useId, useState } from 'react';
import { ModalOverlayClose } from '../../components/ModalOverlayClose';
import { PosModal } from '../../components/PosModal';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';

type PosRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  branch_id: string;
  branch_name: string;
  branch_code: string;
};

type BranchOpt = { id: string; name: string; code: string; is_active?: boolean };

type Sheet = { mode: 'create' } | { mode: 'edit'; pos: PosRow } | null;

/** /admin/cajas — CRUD de POS, siempre ligadas a una sucursal. */
export function AdminCajasPage() {
  const { refreshBranches, branches: ctxBranches } = useAuth();
  const [rows, setRows] = useState<PosRow[]>([]);
  const [catalogBranches, setCatalogBranches] = useState<BranchOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ branchId: '', code: '', name: '', status: 'active' });
  const titleId = useId();

  async function load() {
    setLoading(true);
    try {
      const [posData, branchData] = await Promise.all([
        api<{ pos: PosRow[] }>('/api/catalog/pos'),
        api<{ branches: BranchOpt[] }>('/api/catalog/branches'),
      ]);
      setRows(posData.pos);
      setCatalogBranches(branchData.branches.filter((b) => b.is_active !== false));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las cajas');
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
    const fallback = catalogBranches[0]?.id || ctxBranches[0]?.id || '';
    setForm({ branchId: fallback, code: '', name: '', status: 'active' });
    setSheet({ mode: 'create' });
  }

  function openEdit(pos: PosRow) {
    setForm({
      branchId: pos.branch_id,
      code: pos.code,
      name: pos.name,
      status: pos.status === 'inactive' ? 'inactive' : 'active',
    });
    setSheet({ mode: 'edit', pos });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.branchId) {
      toast.warn('Elige la sucursal de la caja');
      return;
    }
    setSaving(true);
    try {
      if (sheet?.mode === 'edit') {
        await api(`/api/catalog/pos/${sheet.pos.id}`, {
          method: 'PATCH',
          body: { code: form.code, name: form.name, status: form.status },
        });
        toast.success('Caja actualizada');
      } else {
        await api('/api/catalog/pos', {
          method: 'POST',
          body: { branchId: form.branchId, code: form.code, name: form.name },
        });
        toast.success('Caja creada');
      }
      closeSheet();
      await load();
      await refreshBranches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la caja');
    } finally {
      setSaving(false);
    }
  }

  const grouped = catalogBranches.map((b) => ({
    branch: b,
    pos: rows.filter((p) => p.branch_id === b.id),
  }));
  const orphan = rows.filter((p) => !catalogBranches.some((b) => b.id === p.branch_id));

  return (
    <div className="admin-panel" role="tabpanel">
      <div className="section-title admin-toolbar">
        <p className="muted admin-toolbar-hint">La caja queda en una sucursal. No puede quedar suelta.</p>
        <div className="admin-toolbar-actions">
          <button type="button" className="btn" onClick={openCreate} disabled={!catalogBranches.length}>
            Nueva caja
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Cargando cajas…</p>
      ) : !catalogBranches.length ? (
        <div className="admin-empty-dashed" role="status">
          <strong>Falta una sucursal</strong>
          <p>Crea primero una sucursal para poder agregar cajas.</p>
        </div>
      ) : (
        <div className="admin-boutique-grid">
          {grouped.map(({ branch, pos }) => (
            <article key={branch.id} className="admin-boutique-card">
              <div className="admin-boutique-head">
                <div>
                  <h3 className="admin-boutique-name">{branch.name}</h3>
                  <p className="admin-boutique-meta">{branch.code}</p>
                </div>
              </div>
              {pos.length === 0 ? (
                <p className="muted admin-pos-empty">Sin cajas en esta sucursal</p>
              ) : (
                <ul className="admin-entity-list">
                  {pos.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.name}</strong>
                        <span className="muted">
                          {p.code}
                          {p.status !== 'active' ? ' · inactiva' : ''}
                        </span>
                      </div>
                      <button type="button" className="btn ghost" onClick={() => openEdit(p)}>
                        Editar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {orphan.length ? (
            <article className="admin-boutique-card">
              <h3 className="admin-boutique-name">Otras</h3>
              <ul className="admin-entity-list">
                {orphan.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <span className="muted">{p.branch_name}</span>
                    </div>
                    <button type="button" className="btn ghost" onClick={() => openEdit(p)}>
                      Editar
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      )}

      {sheet ? (
        <PosModal
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet();
          }}>
          <ModalOverlayClose onClose={closeSheet}>
          <div
            className="pos-modal-panel admin-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={titleId}>{sheet.mode === 'edit' ? 'Editar caja' : 'Nueva caja'}</h3>
            </div>
            <form className="admin-sheet-form" onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="admin-pos-branch">Sucursal</label>
                {sheet.mode === 'edit' ? (
                  <input
                    id="admin-pos-branch"
                    readOnly
                    value={
                      catalogBranches.find((b) => b.id === form.branchId)?.name ||
                      sheet.pos.branch_name
                    }
                  />
                ) : (
                  <select
                    id="admin-pos-branch"
                    required
                    value={form.branchId}
                    onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                  >
                    <option value="">Elegir sucursal…</option>
                    {catalogBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                )}
                <span className="muted admin-field-hint">
                  {sheet.mode === 'edit'
                    ? 'La sucursal no se cambia: evita cajas huérfanas.'
                    : 'Obligatorio. La caja queda en esta tienda.'}
                </span>
              </div>
              <div className="field">
                <label htmlFor="admin-pos-code">Código</label>
                <input
                  id="admin-pos-code"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ej. CAJA1"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-pos-name">Nombre</label>
                <input
                  id="admin-pos-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Caja 1"
                />
              </div>
              {sheet.mode === 'edit' ? (
                <div className="field">
                  <label htmlFor="admin-pos-status">Estado</label>
                  <select
                    id="admin-pos-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                  </select>
                </div>
              ) : null}
              <div className="admin-sheet-actions">
                <button type="button" className="btn ghost" onClick={closeSheet}>
                  Cancelar
                </button>
                <button className="btn" type="submit" disabled={saving || !form.branchId}>
                  {saving ? 'Guardando…' : sheet.mode === 'edit' ? 'Guardar' : 'Crear caja'}
                </button>
              </div>
            </form>
          </div></ModalOverlayClose>
        </PosModal>
      ) : null}
    </div>
  );
}
