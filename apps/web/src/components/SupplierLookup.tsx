import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export type SupplierOption = { id: string; name: string };

type Props = {
  id?: string;
  value: string;
  suppliers: SupplierOption[];
  onChange: (supplierId: string) => void;
  onSuppliersChange: (next: SupplierOption[]) => void;
  disabled?: boolean;
};

export function SupplierLookup({
  id,
  value,
  suppliers,
  onChange,
  onSuppliersChange,
  disabled,
}: Props) {
  const { user, branches, branchId } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = suppliers.find((s) => s.id === value) ?? null;
  const role = branches.find((b) => b.id === branchId)?.role || '';
  const canCreate =
    Boolean(user) &&
    (role === 'owner' || role === 'branch_manager' || role === 'seller');

  useEffect(() => {
    if (!open) {
      setQuery(selected?.name ?? '');
      setError('');
    }
  }, [open, selected?.name, value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return suppliers.find((s) => s.name.toLowerCase() === q) ?? null;
  }, [suppliers, query]);

  const showCreate =
    canCreate && query.trim().length > 0 && !exactMatch && !disabled;

  function pick(s: SupplierOption | null) {
    onChange(s?.id ?? '');
    setQuery(s?.name ?? '');
    setOpen(false);
    setError('');
  }

  async function createSupplier() {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ supplier: SupplierOption }>('/api/catalog/suppliers', {
        method: 'POST',
        body: { name },
      });
      const created = { id: data.supplier.id, name: data.supplier.name };
      const next = [...suppliers, created].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      );
      onSuppliersChange(next);
      pick(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el proveedor');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`lookup${disabled ? ' is-disabled' : ''}`} ref={wrapRef}>
      <div className="lookup-control">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder="Buscar o crear proveedor"
          value={open ? query : selected?.name ?? ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.name ?? '');
          }}
        />
        {value && !disabled ? (
          <button
            type="button"
            className="lookup-clear"
            aria-label="Quitar proveedor"
            onClick={() => pick(null)}
          >
            ×
          </button>
        ) : null}
      </div>

      {open && !disabled && (
        <ul id={listId} className="lookup-menu" role="listbox">
          <li>
            <button type="button" className="lookup-option muted" onClick={() => pick(null)}>
              Sin proveedor
            </button>
          </li>
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`lookup-option${s.id === value ? ' is-active' : ''}`}
                role="option"
                aria-selected={s.id === value}
                onClick={() => pick(s)}
              >
                {s.name}
              </button>
            </li>
          ))}
          {!filtered.length && !showCreate ? (
            <li className="lookup-empty muted">Sin coincidencias</li>
          ) : null}
          {showCreate ? (
            <li>
              <button
                type="button"
                className="lookup-option lookup-create"
                disabled={busy}
                onClick={() => void createSupplier()}
              >
                {busy ? 'Creando…' : `Crear «${query.trim()}»`}
              </button>
            </li>
          ) : null}
        </ul>
      )}
      {error ? <p className="error lookup-error">{error}</p> : null}
    </div>
  );
}
