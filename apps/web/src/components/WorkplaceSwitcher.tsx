import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { IconCheck, IconChevronDown, IconPos, IconStore } from './icons';

type MenuOption = { value: string; label: string; disabled?: boolean };

function useDismiss(open: boolean, onClose: () => void, rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, rootRef]);
}

function ContextSelect({
  icon,
  label,
  value,
  onChange,
  options,
  className,
  menuAlign = 'start',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: MenuOption[];
  className?: string;
  menuAlign?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value && !o.disabled);
  useDismiss(open, () => setOpen(false), rootRef);

  const enabled = options.filter((o) => o.value && !o.disabled);

  return (
    <div
      ref={rootRef}
      className={`ctx-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="ctx-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        disabled={!enabled.length}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ctx-select-ico">{icon}</span>
        <span className="ctx-select-body">
          <span className="ctx-select-label">{label}</span>
          <strong className="ctx-select-value">{selected?.label || '—'}</strong>
        </span>
        <span className="ctx-select-chevron">
          <IconChevronDown size={14} />
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          className={`ctx-menu${menuAlign === 'end' ? ' is-end' : ''}`}
          role="listbox"
          aria-label={label}
        >
          {options.map((o) => {
            const active = o.value === value && !o.disabled;
            return (
              <li key={o.value || o.label} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={o.disabled || !o.value}
                  className={`ctx-menu-item${active ? ' is-active' : ''}`}
                  onClick={() => {
                    if (o.disabled || !o.value) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span>{o.label}</span>
                  {active ? (
                    <span className="ctx-menu-check">
                      <IconCheck size={16} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function assignedPos(branch?: { pos_terminals?: { id: string; name: string; status: string }[] }) {
  return (branch?.pos_terminals || []).filter((p) => p.status === 'active');
}

/** Cambio de sucursal/caja. `posOnly`: sucursal fija (vendedora / encargada). */
export function WorkplaceSwitcher({
  compact = false,
  posOnly = false,
}: {
  compact?: boolean;
  posOnly?: boolean;
}) {
  const { branches, branchId, posId, setBranchId, setPosId } = useAuth();
  const assignedBranches = branches.filter((b) => Boolean(b.id));
  const activeBranch =
    assignedBranches.find((b) => b.id === branchId) || assignedBranches[0];
  const posList = assignedPos(activeBranch);

  function onBranchChange(id: string) {
    if (!assignedBranches.some((b) => b.id === id)) return;
    setBranchId(id);
  }

  function onPosChange(id: string) {
    if (!posList.some((p) => p.id === id)) return;
    setPosId(id);
  }

  return (
    <div className={`workplace-switcher ${compact ? 'compact' : ''}${posOnly ? ' pos-only' : ''}`}>
      {!compact && (
        <div className="workplace-switcher-head">
          <IconStore size={16} />
          <div>
            <strong>{posOnly ? 'Caja de venta' : 'Puesto de trabajo'}</strong>
            <span>
              {posOnly
                ? 'Elige la caja para cobrar en esta sucursal'
                : 'Cambia sucursal o caja (solo las que tienes asignadas)'}
            </span>
          </div>
        </div>
      )}
      <div className="context-selects">
        {!posOnly ? (
          <ContextSelect
            icon={<IconStore size={16} />}
            label="Sucursal"
            value={activeBranch?.id || ''}
            onChange={onBranchChange}
            options={
              assignedBranches.length
                ? assignedBranches.map((b) => ({ value: b.id, label: b.name }))
                : [{ value: '', label: 'Sin sucursales asignadas', disabled: true }]
            }
            className="ctx-select-branch"
          />
        ) : (
          <div className="ctx-select ctx-select-ro ctx-select-branch" aria-label="Sucursal">
            <span className="ctx-select-ico">
              <IconStore size={16} />
            </span>
            <span className="ctx-select-body">
              <span className="ctx-select-label">Sucursal</span>
              <strong className="ctx-select-ro-value">{activeBranch?.name || '—'}</strong>
            </span>
          </div>
        )}
        <ContextSelect
          icon={<IconPos size={16} />}
          label="Caja / POS"
          className="ctx-select-pos"
          menuAlign="end"
          value={posId && posList.some((p) => p.id === posId) ? posId : posList[0]?.id || ''}
          onChange={onPosChange}
          options={
            posList.length
              ? posList.map((p) => ({ value: p.id, label: p.name }))
              : [{ value: '', label: 'Sin cajas activas', disabled: true }]
          }
        />
      </div>
    </div>
  );
}
