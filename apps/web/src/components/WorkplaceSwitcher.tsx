import { type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { IconChevronDown, IconPos, IconStore } from './icons';

function ContextSelect({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="ctx-select">
      <span className="ctx-select-ico">{icon}</span>
      <span className="ctx-select-body">
        <span className="ctx-select-label">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      <IconChevronDown size={14} />
    </label>
  );
}

/** Cambio de sucursal/caja — solo para propietaria (owner). */
export function WorkplaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { branches, branchId, posId, setBranchId, setPosId } = useAuth();
  const activeBranch = branches.find((b) => b.id === branchId);
  const posList = activeBranch?.pos_terminals || [];

  return (
    <div className={`workplace-switcher ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="workplace-switcher-head">
          <IconStore size={16} />
          <div>
            <strong>Puesto de trabajo</strong>
            <span>Solo propietaria · cambia sucursal o caja</span>
          </div>
        </div>
      )}
      <div className="context-selects">
        <ContextSelect
          icon={<IconStore size={16} />}
          label="Sucursal"
          value={branchId || ''}
          onChange={setBranchId}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
        <ContextSelect
          icon={<IconPos size={16} />}
          label="Caja / POS"
          value={posId || ''}
          onChange={setPosId}
          options={posList.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
    </div>
  );
}
