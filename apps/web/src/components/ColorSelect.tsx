import { useEffect, useId, useRef, useState } from 'react';
import { COLOR_PRESETS } from '../lib/colorSwatch';
import { ColorSwatch } from './ColorSwatch';

type Props = {
  id?: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** Placeholder cuando no hay color. */
  placeholder?: string;
};

/**
 * Selector de color con muestra circular + nombre (cerrado y en lista),
 * alineado al stage de Caja.
 */
export function ColorSelect({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'Seleccionar',
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const trimmed = value.trim();
  const isPreset = (COLOR_PRESETS as readonly string[]).includes(trimmed);

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

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className={`color-select${disabled ? ' is-disabled' : ''}`} ref={wrapRef}>
      <button
        type="button"
        id={id}
        className="color-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="color-select-value">
          {trimmed ? (
            <ColorSwatch color={trimmed} size="md" />
          ) : (
            <span className="color-select-empty-swatch" aria-hidden />
          )}
          <span className={`color-select-label${!trimmed ? ' is-placeholder' : ''}`}>
            {trimmed || placeholder}
          </span>
        </span>
        <span className="color-select-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && !disabled ? (
        <ul id={listId} className="color-select-menu" role="listbox" aria-label="Colores">
          <li>
            <button
              type="button"
              className={`color-select-option${!trimmed ? ' is-active' : ''}`}
              role="option"
              aria-selected={!trimmed}
              onClick={() => pick('')}
            >
              <span className="color-select-empty-swatch" aria-hidden />
              <span>{placeholder}</span>
            </button>
          </li>
          {COLOR_PRESETS.map((c) => (
            <li key={c}>
              <button
                type="button"
                className={`color-select-option${c === trimmed ? ' is-active' : ''}`}
                role="option"
                aria-selected={c === trimmed}
                onClick={() => pick(c)}
              >
                <ColorSwatch color={c} size="md" />
                <span>{c}</span>
              </button>
            </li>
          ))}
          {trimmed && !isPreset ? (
            <li>
              <button
                type="button"
                className="color-select-option is-active"
                role="option"
                aria-selected
                onClick={() => setOpen(false)}
              >
                <ColorSwatch color={trimmed} size="md" />
                <span>{trimmed}</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
