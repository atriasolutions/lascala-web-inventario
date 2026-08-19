import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';

type UserBranch = { branchId: string; role: string; branchName: string };
type UserPos = { posId: string; posName: string; branchId: string; branchName: string };

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  branches?: UserBranch[];
  pos?: UserPos[];
};

type CatalogPos = { id: string; code: string; name: string; status: string };
type CatalogBranch = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  pos_terminals?: CatalogPos[];
};

type Assignment = { enabled: boolean; role: string; posIds: string[] };

const ROLE_CHIPS: { id: 'seller' | 'branch_manager' | 'owner'; label: string }[] = [
  { id: 'seller', label: 'Vendedora' },
  { id: 'branch_manager', label: 'Encargada' },
  { id: 'owner', label: 'Propietaria' },
];

function roleLabel(role: string) {
  return ROLE_CHIPS.find((r) => r.id === role)?.label || role;
}

function RoleChips({
  value,
  disabled,
  labelledBy,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  labelledBy?: string;
  onChange: (role: string) => void;
}) {
  return (
    <div className="admin-role-chips" role="group" aria-labelledby={labelledBy}>
      {ROLE_CHIPS.map((r) => (
        <button
          key={r.id}
          type="button"
          className={`admin-role-chip${value === r.id ? ' is-active' : ''}`}
          disabled={disabled}
          aria-pressed={value === r.id}
          onClick={() => {
            if (value !== r.id) onChange(r.id);
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function emptyAssignments(catalog: CatalogBranch[], preferBranchId?: string): Record<string, Assignment> {
  const next: Record<string, Assignment> = {};
  for (const b of catalog) {
    next[b.id] = {
      enabled: preferBranchId ? b.id === preferBranchId : false,
      role: 'seller',
      posIds: [],
    };
  }
  return next;
}

function assignmentsFromUser(catalog: CatalogBranch[], u: UserRow): Record<string, Assignment> {
  const next = emptyAssignments(catalog);
  for (const b of u.branches || []) {
    if (!next[b.branchId]) continue;
    next[b.branchId] = {
      enabled: true,
      role: b.role,
      posIds: (u.pos || []).filter((p) => p.branchId === b.branchId).map((p) => p.posId),
    };
  }
  return next;
}

function payloadAssignments(map: Record<string, Assignment>) {
  return Object.entries(map)
    .filter(([, a]) => a.enabled)
    .map(([branchId, a]) => ({
      branchId,
      role: a.role as 'owner' | 'branch_manager' | 'seller',
      posIds: a.role === 'owner' ? [] : a.posIds,
    }));
}

/** /admin/usuarias — ficha clara + sucursal × caja. */
export function AdminUsuariasPage() {
  const { user, branchId, refreshBranches, refreshUser } = useAuth();
  const formTitleId = useId();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogBranch[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    isActive: true,
  });
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const [usersData, branchData] = await Promise.all([
        api<{ users: UserRow[] }>('/api/users'),
        api<{ branches: CatalogBranch[] }>('/api/catalog/branches'),
      ]);
      setUsers(usersData.users);
      setCatalog(branchData.branches.filter((b) => b.is_active !== false));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cargar el listado de usuarias');
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const activeCatalog = useMemo(
    () => catalog.filter((b) => b.is_active !== false),
    [catalog],
  );

  function openCreate() {
    setEditing(null);
    setForm({ email: '', password: '', fullName: '', isActive: true });
    setAssignments(emptyAssignments(activeCatalog, branchId || activeCatalog[0]?.id));
    setSheetOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditing(u);
    setForm({
      email: u.email,
      password: '',
      fullName: u.full_name,
      isActive: u.is_active,
    });
    setAssignments(assignmentsFromUser(activeCatalog, u));
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
  }

  function patchAssignment(branchIdKey: string, partial: Partial<Assignment>) {
    setAssignments((prev) => ({
      ...prev,
      [branchIdKey]: { ...prev[branchIdKey], ...partial },
    }));
  }

  function togglePos(branchIdKey: string, posId: string) {
    const current = assignments[branchIdKey]?.posIds || [];
    const next = current.includes(posId) ? current.filter((id) => id !== posId) : [...current, posId];
    patchAssignment(branchIdKey, { posIds: next });
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    const access = payloadAssignments(assignments);
    if (!access.length) {
      toast.warn('Asigna al menos una sucursal');
      return;
    }
    const missingPos = access.find((a) => a.role !== 'owner' && a.posIds.length === 0);
    if (missingPos) {
      const name = activeCatalog.find((b) => b.id === missingPos.branchId)?.name || 'la sucursal';
      toast.warn(`Elige al menos una caja en ${name}`);
      return;
    }
    setSavingUser(true);
    try {
      if (editing) {
        const patch: Record<string, unknown> = {
          fullName: form.fullName,
          email: form.email,
          isActive: form.isActive,
        };
        if (form.password.trim()) patch.password = form.password;
        await api(`/api/users/${editing.id}`, { method: 'PATCH', body: patch });
        await api(`/api/users/${editing.id}/access`, {
          method: 'PUT',
          body: { assignments: access },
        });
        toast.success('Usuaria actualizada');
        if (editing.id === user?.id) {
          await refreshUser();
          await refreshBranches();
        }
      } else {
        await api('/api/users', {
          method: 'POST',
          body: {
            email: form.email,
            password: form.password,
            fullName: form.fullName,
            assignments: access,
          },
        });
        toast.success(`${form.fullName.trim() || 'Usuaria'} creada`);
      }
      closeSheet();
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la usuaria');
    } finally {
      setSavingUser(false);
    }
  }

  async function setUserActive(u: UserRow, isActive: boolean) {
    setBusyUserId(u.id);
    try {
      await api(`/api/users/${u.id}`, { method: 'PATCH', body: { isActive } });
      toast.success(isActive ? 'Usuaria reactivada' : 'Usuaria desactivada');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la usuaria');
    } finally {
      setBusyUserId(null);
      setDeactivateTarget(null);
    }
  }

  async function removeUser(u: UserRow) {
    setBusyUserId(u.id);
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' });
      toast.success('Usuaria desactivada');
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la usuaria');
    } finally {
      setBusyUserId(null);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="admin-panel" role="tabpanel">
      <div className="section-title admin-toolbar">
        <p className="muted admin-toolbar-hint">
          Cada usuaria solo ve las sucursales y cajas que le marques aquí.
        </p>
        <button type="button" className="btn" onClick={openCreate} disabled={usersLoading}>
          Nueva usuaria
        </button>
      </div>

      {usersLoading ? (
        <p className="muted">Cargando usuarias…</p>
      ) : !users.length ? (
        <div className="admin-empty-dashed" role="status">
          <strong>Sin usuarias</strong>
          <p>Crea la primera para dar acceso a la tienda.</p>
          <button type="button" className="btn" onClick={openCreate}>
            Nueva usuaria
          </button>
        </div>
      ) : (
        <div className="admin-boutique-grid">
          {users.map((u) => {
            const isSelf = u.id === user?.id;
            const busy = busyUserId === u.id;
            const branchBits = (u.branches || []).map((b) => `${b.branchName} · ${roleLabel(b.role)}`);
            const posBits = (u.pos || []).map((p) => p.posName);
            const isOwnerUser = (u.branches || []).some((b) => b.role === 'owner');
            return (
              <article
                className={`admin-boutique-card admin-user-card${!u.is_active ? ' is-inactive' : ''}`}
                key={u.id}
              >
                <div className="admin-boutique-head">
                  <div>
                    <h3 className="admin-boutique-name">{u.full_name}</h3>
                    <p className="admin-boutique-meta">{u.email}</p>
                  </div>
                  <span className={`admin-chip${u.is_active ? ' is-ok' : ' is-off'}`}>
                    {u.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="admin-chip-label">Sucursales</p>
                {branchBits.length ? (
                  <ul className="admin-chip-row admin-pos-chips">
                    {branchBits.map((t) => (
                      <li key={t}>
                        <span className="admin-chip">{t}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted admin-pos-empty">Sin sucursal asignada</p>
                )}
                <p className="admin-chip-label">Cajas</p>
                {isOwnerUser ? (
                  <p className="muted admin-pos-empty">Propietaria: todas las cajas</p>
                ) : posBits.length ? (
                  <ul className="admin-chip-row admin-pos-chips">
                    {posBits.map((t) => (
                      <li key={t}>
                        <span className="admin-chip is-ok">{t}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted admin-pos-empty">Sin cajas asignadas</p>
                )}
                <div className="admin-user-actions">
                  <button type="button" className="btn" disabled={busy} onClick={() => openEdit(u)}>
                    Editar
                  </button>
                  {u.is_active ? (
                    <button
                      type="button"
                      className="btn secondary admin-btn-danger"
                      disabled={busy || isSelf}
                      title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
                      onClick={() => setDeactivateTarget(u)}
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => void setUserActive(u, true)}
                    >
                      Reactivar
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost admin-btn-danger"
                    disabled={busy || isSelf}
                    title={isSelf ? 'No puedes eliminarte a ti misma' : undefined}
                    onClick={() => setDeleteTarget(u)}
                  >
                    Eliminar
                  </button>
                </div>
                {isSelf ? (
                  <p className="muted admin-field-hint">
                    Eres tú. No puedes desactivar ni eliminar tu propia cuenta.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {sheetOpen ? (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet();
          }}
        >
          <div
            className="pos-modal-panel admin-sheet admin-sheet-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby={formTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-modal-head">
              <h3 id={formTitleId}>{editing ? 'Editar usuaria' : 'Nueva usuaria'}</h3>
              <button type="button" className="btn ghost" onClick={closeSheet} aria-label="Cerrar">
                Cerrar
              </button>
            </div>
            <form className="admin-sheet-form" onSubmit={saveUser}>
              <div className="field">
                <label htmlFor="admin-user-name">Nombre</label>
                <input
                  id="admin-user-name"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-user-email">Email</label>
                <input
                  id="admin-user-email"
                  required
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-user-pass">
                  {editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                </label>
                <input
                  id="admin-user-pass"
                  required={!editing}
                  type="password"
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              {editing && editing.id !== user?.id ? (
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Cuenta activa
                </label>
              ) : null}

              <p className="admin-chip-label" id="admin-access-label">
                Sucursales y cajas
              </p>
              <p className="muted admin-field-hint">
                Marca dónde puede entrar. Dentro de cada tienda, elige las cajas habilitadas.
              </p>
              <div className="admin-assign-list" role="group" aria-labelledby="admin-access-label">
                {activeCatalog.map((b) => {
                  const a = assignments[b.id] || { enabled: false, role: 'seller', posIds: [] };
                  const pos = (b.pos_terminals || []).filter((p) => p.status === 'active');
                  const roleLabelId = `admin-role-${b.id}`;
                  return (
                    <fieldset key={b.id} className={`admin-assign${a.enabled ? ' is-on' : ''}`}>
                      <label className="admin-check">
                        <input
                          type="checkbox"
                          checked={a.enabled}
                          onChange={(e) =>
                            patchAssignment(b.id, { enabled: e.target.checked })
                          }
                        />
                        <span>
                          {b.name} <span className="muted">({b.code})</span>
                        </span>
                      </label>
                      {a.enabled ? (
                        <>
                          <p className="admin-chip-label" id={roleLabelId}>
                            Rol
                          </p>
                          <RoleChips
                            value={a.role}
                            labelledBy={roleLabelId}
                            onChange={(role) => patchAssignment(b.id, { role })}
                          />
                          {a.role === 'owner' ? (
                            <p className="muted admin-field-hint">
                              La propietaria opera todas las cajas de esta sucursal.
                            </p>
                          ) : (
                            <>
                              <p className="admin-chip-label">Cajas</p>
                              {pos.length ? (
                                <div className="admin-pos-checks">
                                  {pos.map((p) => (
                                    <label key={p.id} className="admin-check">
                                      <input
                                        type="checkbox"
                                        checked={a.posIds.includes(p.id)}
                                        onChange={() => togglePos(b.id, p.id)}
                                      />
                                      {p.name}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <p className="muted admin-pos-empty">
                                  Esta sucursal no tiene cajas activas.
                                </p>
                              )}
                            </>
                          )}
                        </>
                      ) : null}
                    </fieldset>
                  );
                })}
              </div>

              <div className="admin-sheet-actions">
                <button type="button" className="btn ghost" onClick={closeSheet}>
                  Cancelar
                </button>
                <button className="btn" type="submit" disabled={savingUser}>
                  {savingUser ? 'Guardando…' : editing ? 'Guardar' : 'Crear usuaria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Desactivar usuaria"
        message={
          deactivateTarget
            ? `${deactivateTarget.full_name} no podrá iniciar sesión hasta que la reactives.`
            : ''
        }
        confirmLabel="Desactivar"
        cancelLabel="Volver"
        danger
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (deactivateTarget) void setUserActive(deactivateTarget, false);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar usuaria"
        message={
          deleteTarget
            ? `Vas a dejar sin acceso a ${deleteTarget.full_name}. No puedes hacer esto contigo misma.`
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Volver"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void removeUser(deleteTarget);
        }}
      />
    </div>
  );
}
