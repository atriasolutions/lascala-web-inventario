import {
  useEffect,
  useState,
  type ClipboardEvent,
  type InputHTMLAttributes,
} from 'react';
import { chileMoneyFromNumber, formatChileMoneyInput, parseChileMoney } from '../lib/chileMoney';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  /** Valor mostrado/almacenado como string con puntos de miles (o vacío). */
  onChange: (formatted: string) => void;
};

/**
 * Input CLP.
 *
 * Causa del bug «13500 → borrar → 14»: al tipiar, `13.500` pasa a `13.50` y
 * `digitsOnlyMoney` lo tomaba como decimal SQL (Number("13.50")→14).
 *
 * Mientras hay foco: solo dígitos (sin reformateo con puntos). En blur: miles Chile.
 */
export function ChileMoneyInput({ value, onChange, onBlur, onFocus, onPaste, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  function toTypingDraft(raw: string): string {
    // Solo dígitos mientras se edita — evita el falso “decimal SQL”
    return String(raw ?? '').replace(/\D/g, '');
  }

  function commitFormatted(raw: string) {
    const n = parseChileMoney(raw);
    const formatted = n != null ? chileMoneyFromNumber(n) : '';
    setDraft(formatted);
    onChange(formatted);
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={focused ? draft : value}
      onFocus={(e) => {
        setFocused(true);
        const n = parseChileMoney(value);
        setDraft(n != null ? String(n) : toTypingDraft(value));
        onFocus?.(e);
      }}
      onChange={(e) => {
        const next = toTypingDraft(e.target.value);
        setDraft(next);
        // Padre recibe dígitos crudos; parseChileMoney los entiende
        onChange(next);
      }}
      onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text') || '';
        // Paste: normalizar ya (790.000 / 12990.00)
        const formatted = formatChileMoneyInput(text);
        setDraft(focused ? toTypingDraft(formatted) || toTypingDraft(text) : formatted);
        onChange(focused ? toTypingDraft(formatted) || toTypingDraft(text) : formatted);
      }}
      onBlur={(e) => {
        setFocused(false);
        commitFormatted(draft || e.target.value);
        onBlur?.(e);
      }}
    />
  );
}
