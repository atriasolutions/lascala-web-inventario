import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export type BrandOption = { id: string; name: string; product_count?: number };

type Props = {
  id?: string;
  value: string;
  brands: BrandOption[];
  onChange: (brandId: string) => void;
  onBrandsChange: (next: BrandOption[]) => void;
  disabled?: boolean;
};

export function BrandLookup({
  id,
  value,
  brands,
  onChange,
  onBrandsChange,
  disabled,
}: Props) {
  const { user, branches, branchId } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = brands.find((b) => b.id === value) ?? null;
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
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return brands.find((b) => b.name.toLowerCase() === q) ?? null;
  }, [brands, query]);

  const showCreate =
    canCreate && query.trim().length > 0 && !exactMatch && !disabled;

  function pick(b: BrandOption | null) {
    onChange(b?.id ?? '');
    setQuery(b?.name ?? '');
    setOpen(false);
    setError('');
  }

  async function createBrand() {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ brand: BrandOption }>('/api/catalog/brands', {
        method: 'POST',
        body: { name },
      });
      const created = { id: data.brand.id, name: data.brand.name };
      const next = [...brands.filter((b) => b.id !== created.id), created].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      );
      onBrandsChange(next);
      pick(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la marca');
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
          placeholder="Buscar o crear marca"
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
            aria-label="Quitar marca"
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
              Sin marca
            </button>
          </li>
          {filtered.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className={`lookup-option${b.id === value ? ' is-active' : ''}`}
                role="option"
                aria-selected={b.id === value}
                onClick={() => pick(b)}
              >
                {b.name}
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
                onClick={() => void createBrand()}
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
