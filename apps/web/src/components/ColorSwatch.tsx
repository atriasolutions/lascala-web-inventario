import { resolveColorHex } from '../lib/colorSwatch';

type Props = {
  color: string | null | undefined;
  /** `sm` ticket (~16px), `md` (~22px), `lg` stage (~28–30px) — siempre circular */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

function isPaleHex(hex: string) {
  if (!hex.startsWith('#') || (hex.length !== 4 && hex.length !== 7)) return false;
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  // Luminancia relativa aproximada
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.78;
}

/** Muestra circular del color; `title` lleva el nombre completo. */
export function ColorSwatch({ color, size = 'md', className = '' }: Props) {
  const label = color?.trim() || '';
  if (!label) return null;
  const hex = resolveColorHex(label);
  const pale = Boolean(hex && isPaleHex(hex));

  return (
    <span
      className={`color-swatch color-swatch--${size}${pale ? ' is-pale' : ''}${className ? ` ${className}` : ''}`}
      style={hex ? { backgroundColor: hex } : undefined}
      title={label}
      aria-hidden
    />
  );
}
