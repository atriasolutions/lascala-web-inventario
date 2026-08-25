import type { ReactNode, Ref } from 'react';
import { ChileMoneyInput } from './ChileMoneyInput';
import { ColorSelect } from './ColorSelect';
import { MarginHint } from './MarginHint';
import { parseChileMoney } from '../lib/chileMoney';

export const PRODUCT_SEASONS = [
  'Todo el año',
  'Verano',
  'Otoño',
  'Invierno',
  'Primavera',
  'Fiestas',
] as const;

export type ProductFichaValues = {
  name: string;
  categoryId: string;
  brand: string;
  productType: string;
  sizeLabel: string;
  color: string;
  season: string;
  description: string;
};

export type ProductFichaCategory = { id: string; name: string };

type CodeField =
  | { locked: true; value: string; helper?: string }
  | {
      locked: false;
      value: string;
      onChange: (v: string) => void;
      helper: string;
      /** Reemplaza el input simple (p. ej. Autogenerar | Pistolear). */
      slot?: ReactNode;
    };

type SaleField =
  | { mode: 'edit'; value: string; onChange: (v: string) => void }
  | { mode: 'locked'; display: string; hint: string; amount?: number };

type Props = {
  idPrefix: string;
  values: ProductFichaValues;
  onChange: (partial: Partial<ProductFichaValues>) => void;
  categories: ProductFichaCategory[];
  disabled?: boolean;
  nameRef?: Ref<HTMLInputElement>;
  code: CodeField;
  salePrice: SaleField;
  /** Precio costo (número o string formateado) para margen en vivo. */
  costPrice?: number | string | null;
  extraAfterIdentity?: ReactNode;
  extraAfterCode?: ReactNode;
};

/** Identidad + detalle compartidos (alta en Ingresos y ficha en Productos). */
export function ProductFichaFields({
  idPrefix,
  values,
  onChange,
  categories,
  disabled,
  nameRef,
  code,
  salePrice,
  costPrice,
  extraAfterIdentity,
  extraAfterCode,
}: Props) {
  const saleNum =
    salePrice.mode === 'edit'
      ? parseChileMoney(salePrice.value)
      : salePrice.amount != null
        ? salePrice.amount
        : null;
  const costNum =
    typeof costPrice === 'number'
      ? costPrice
      : costPrice != null && costPrice !== ''
        ? parseChileMoney(String(costPrice))
        : null;

  return (
    <>
      <section className="prod-section">
        <h4 className="prod-section-title">Identidad</h4>
        <div className="prod-section-grid">
          <div className="field prod-span-2">
            <label htmlFor={`${idPrefix}-name`}>Nombre</label>
            <input
              id={`${idPrefix}-name`}
              ref={nameRef}
              required
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              autoComplete="off"
              placeholder="Ej. Vestido satén negro"
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-cat`}>Categoría</label>
            <select
              id={`${idPrefix}-cat`}
              value={values.categoryId}
              onChange={(e) => onChange({ categoryId: e.target.value })}
              disabled={disabled}
            >
              <option value="">Seleccionar</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-sale`}>Precio venta</label>
            {salePrice.mode === 'edit' ? (
              <ChileMoneyInput
                id={`${idPrefix}-sale`}
                required
                value={salePrice.value}
                onChange={salePrice.onChange}
                placeholder="0"
                disabled={disabled}
              />
            ) : (
              <>
                <input
                  id={`${idPrefix}-sale`}
                  value={salePrice.display}
                  disabled
                  readOnly
                  aria-readonly="true"
                />
                <p className="ing-hint">{salePrice.hint}</p>
              </>
            )}
            {(salePrice.mode === 'edit' || (costNum != null && saleNum != null)) ? (
              <MarginHint cost={costNum} sale={saleNum} />
            ) : null}
          </div>
        </div>
        {extraAfterIdentity}
      </section>

      <section className="prod-section">
        <h4 className="prod-section-title">Detalle</h4>
        <div className="prod-section-grid">
          <div className="field">
            <label htmlFor={`${idPrefix}-brand`}>Marca</label>
            <input
              id={`${idPrefix}-brand`}
              value={values.brand}
              onChange={(e) => onChange({ brand: e.target.value })}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-type`}>Tipología</label>
            <input
              id={`${idPrefix}-type`}
              value={values.productType}
              onChange={(e) => onChange({ productType: e.target.value })}
              placeholder="Ej. vestido, jeans"
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-size`}>Talla</label>
            <input
              id={`${idPrefix}-size`}
              value={values.sizeLabel}
              onChange={(e) => onChange({ sizeLabel: e.target.value })}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-color`}>Color</label>
            <ColorSelect
              id={`${idPrefix}-color`}
              value={values.color}
              onChange={(color) => onChange({ color })}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-season`}>Temporada</label>
            <select
              id={`${idPrefix}-season`}
              value={values.season}
              onChange={(e) => onChange({ season: e.target.value })}
              disabled={disabled}
            >
              <option value="">Sin definir</option>
              {PRODUCT_SEASONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-code`}>Código</label>
            {code.locked ? (
              <p className="prod-code-locked" id={`${idPrefix}-code`}>
                {code.value.trim() || 'Se asigna al guardar'}
              </p>
            ) : code.slot ? (
              code.slot
            ) : (
              <input
                id={`${idPrefix}-code`}
                value={code.value}
                onChange={(e) => code.onChange(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                autoComplete="off"
                spellCheck={false}
                placeholder="Ej. LS000012"
                disabled={disabled}
              />
            )}
            {code.locked || !code.slot ? (
              <p className="ing-hint">
                {code.locked
                  ? code.helper ||
                    'Es el código de la etiqueta y de la pistola. No se puede cambiar.'
                  : code.helper}
              </p>
            ) : null}
            {extraAfterCode}
          </div>
          <div className="field prod-span-2">
            <label htmlFor={`${idPrefix}-desc`}>Descripción</label>
            <textarea
              id={`${idPrefix}-desc`}
              rows={2}
              value={values.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Detalle de la prenda"
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </>
  );
}
