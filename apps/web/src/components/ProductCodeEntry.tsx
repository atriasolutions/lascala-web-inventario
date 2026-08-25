import { useEffect, useId, useRef, useState } from 'react';

export type ProductCodeMode = 'auto' | 'scan';

type Props = {
  id?: string;
  value: string;
  mode: ProductCodeMode;
  onModeChange: (mode: ProductCodeMode) => void;
  onChange: (value: string) => void;
  /** Pedir un código libre al servidor (modo Autogenerar). */
  onAutogenerate: () => void | Promise<void>;
  disabled?: boolean;
  generating?: boolean;
  /** Resultado de check de unicidad en modo pistola. */
  availability?: 'idle' | 'checking' | 'ok' | 'taken' | 'error';
  onBlurCheck?: () => void;
  helper?: string;
};

/**
 * Alta de prenda: Autogenerar LS… o pistolear/tipear un código único.
 * El código no se edita después de crear (lo bloquea la API).
 */
export function ProductCodeEntry({
  id: idProp,
  value,
  mode,
  onModeChange,
  onChange,
  onAutogenerate,
  disabled,
  generating,
  availability = 'idle',
  onBlurCheck,
  helper,
}: Props) {
  const autoId = useId();
  const id = idProp || `prod-code-${autoId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [localHint, setLocalHint] = useState('');

  useEffect(() => {
    if (mode !== 'scan') return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'scan') {
      setLocalHint('');
      return;
    }
    if (availability === 'taken') setLocalHint('Ese código ya está en uso');
    else if (availability === 'ok' && value.trim()) setLocalHint('Código libre');
    else if (availability === 'checking') setLocalHint('Revisando…');
    else if (availability === 'error') setLocalHint('No se pudo validar el código');
    else setLocalHint('');
  }, [availability, mode, value]);

  const statusClass =
    availability === 'taken' || availability === 'error'
      ? 'is-bad'
      : availability === 'ok'
        ? 'is-ok'
        : '';

  return (
    <div className="prod-code-entry">
      <div className="prod-code-mode" role="group" aria-label="Cómo asignar el código">
        <button
          type="button"
          className={`prod-code-mode-btn${mode === 'auto' ? ' is-active' : ''}`}
          disabled={disabled || generating}
          onClick={() => {
            onModeChange('auto');
            void onAutogenerate();
          }}
        >
          Autogenerar
        </button>
        <button
          type="button"
          className={`prod-code-mode-btn${mode === 'scan' ? ' is-active' : ''}`}
          disabled={disabled || generating}
          onClick={() => onModeChange('scan')}
        >
          Pistolear / ingresar
        </button>
      </div>

      {mode === 'auto' ? (
        <div className="prod-code-auto-row">
          <p className="prod-code-locked" id={id} aria-live="polite">
            {generating ? 'Generando…' : value.trim() || '—'}
          </p>
          <button
            type="button"
            className="btn ghost prod-code-regen"
            disabled={disabled || generating}
            onClick={() => void onAutogenerate()}
          >
            Otro código
          </button>
        </div>
      ) : (
        <input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s+/g, ''))}
          onBlur={() => onBlurCheck?.()}
          autoComplete="off"
          spellCheck={false}
          placeholder="Pistolea o escribe el código"
          disabled={disabled}
          className={statusClass ? `prod-code-input ${statusClass}` : 'prod-code-input'}
          aria-invalid={availability === 'taken' || availability === 'error'}
        />
      )}

      <p className={`ing-hint${localHint && availability === 'taken' ? ' prod-code-hint-bad' : ''}`}>
        {localHint ||
          helper ||
          (mode === 'auto'
            ? 'Código único LS… para etiqueta y pistola. No se puede cambiar después.'
            : 'Debe ser único en el catálogo. No se puede cambiar después.')}
      </p>
    </div>
  );
}
