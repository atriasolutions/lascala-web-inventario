import type { PaymentMethod } from '../lib/paymentMethod';

type Option = { id: PaymentMethod; label: string };

const OPTIONS: Option[] = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'card', label: 'Tarjeta' },
];

type Props = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  disabled?: boolean;
  name?: string;
  label?: string;
  className?: string;
};

/** Segmented control accesible — Efectivo | Tarjeta. */
export function PaymentMethodSwitch({
  value,
  onChange,
  disabled,
  name = 'payment-method',
  label = 'Medio de pago',
  className = '',
}: Props) {
  return (
    <div className={`payment-method-switch${className ? ` ${className}` : ''}`}>
      <span className="payment-method-switch-label" id={`${name}-label`}>
        {label}
      </span>
      <div
        className="payment-method-segmented"
        role="radiogroup"
        aria-labelledby={`${name}-label`}
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              name={name}
              aria-checked={active}
              disabled={disabled}
              className={`payment-method-segment${active ? ' is-active' : ''}`}
              onClick={() => onChange(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
