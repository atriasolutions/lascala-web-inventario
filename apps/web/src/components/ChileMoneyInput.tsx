import type { ClipboardEvent, InputHTMLAttributes } from 'react';
import { chileMoneyFromNumber, formatChileMoneyInput, parseChileMoney } from '../lib/chileMoney';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  /** Valor mostrado/almacenado como string con puntos de miles (o vacío). */
  onChange: (formatted: string) => void;
};

/** Input de monto CLP con separador de miles (puntos). Paste seguro (790.000 → 790.000, no 790). */
export function ChileMoneyInput({ value, onChange, onBlur, onPaste, ...rest }: Props) {
  function applyRaw(raw: string) {
    onChange(formatChileMoneyInput(raw));
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => applyRaw(e.target.value)}
      onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text') || '';
        applyRaw(text);
      }}
      onBlur={(e) => {
        const n = parseChileMoney(e.target.value);
        if (n != null) onChange(chileMoneyFromNumber(n));
        onBlur?.(e);
      }}
    />
  );
}
