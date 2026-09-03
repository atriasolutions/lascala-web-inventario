import type { ReactNode, Ref } from 'react';
import { BrandLookup, type BrandOption } from './BrandLookup';
import { ChileMoneyInput } from './ChileMoneyInput';
import { ColorSelect } from './ColorSelect';
import { IconPencil } from './icons';
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
  brandId: string;
  /** Nombre para vista cuando la lista de marcas aún no tiene el id. */
  brandLabel?: string;
  sizeLabel: string;
  color: string;
  season: string;
  description: string;
};

export type ProductFichaCategory = { id: string; name: string };

/** Campos con lápiz en vista (cualquier lápiz abre edición de toda la ficha). */
export type ProductFichaFieldKey =
  | 'name'
  | 'categoryId'
  | 'salePrice'
  | 'brandId'
  | 'sizeLabel'
  | 'color'
  | 'season'
  | 'description';

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
  brands: BrandOption[];
  onBrandsChange: (next: BrandOption[]) => void;
  disabled?: boolean;
  nameRef?: Ref<HTMLInputElement>;
  code: CodeField;
  salePrice: SaleField;
  /** Precio costo (número o string formateado) para margen en vivo. */
  costPrice?: number | string | null;
  extraAfterIdentity?: ReactNode;
  extraAfterCode?: ReactNode;
  /**
   * `edit` = formulario editable (alta o ficha en edición).
   * `view` = solo lectura + lápiz (entra a edición de toda la ficha).
   */
  mode?: 'edit' | 'view';
  /** Cualquier lápiz en vista. */
  onEnterEdit?: () => void;
  /** Si false, no se muestra lápiz (p. ej. precio para vendedora). */
  canEditField?: (key: ProductFichaFieldKey) => boolean;
  /** Oculta fila de precio de venta (alta vendedora en Ingresos). */
  hideSalePrice?: boolean;
};

function displayOrDash(v: string | null | undefined) {
  const t = (v || '').trim();
  return t || '—';
}

function FieldLabel({
  label,
  htmlFor,
  showPencil,
  onEnterEdit,
}: {
  label: string;
  htmlFor: string;
  showPencil?: boolean;
  onEnterEdit?: () => void;
}) {
  return (
    <div className="prod-ficha-label-row">
      <label htmlFor={htmlFor}>{label}</label>
      {showPencil && onEnterEdit ? (
        <button
          type="button"
          className="prod-ficha-pencil"
          aria-label={`Editar ${label}`}
          onClick={onEnterEdit}
        >
          <IconPencil size={15} />
        </button>
      ) : null}
    </div>
  );
}

/** Identidad + detalle compartidos (alta en Ingresos y ficha en Productos). */
export function ProductFichaFields({
  idPrefix,
  values,
  onChange,
  categories,
  brands,
  onBrandsChange,
  disabled,
  nameRef,
  code,
  salePrice,
  costPrice,
  extraAfterIdentity,
  extraAfterCode,
  mode = 'edit',
  onEnterEdit,
  canEditField,
  hideSalePrice = false,
}: Props) {
  const isView = mode === 'view';
  const saleNum =
    salePrice.mode === 'edit'
      ? parseChileMoney(salePrice.value)
      : salePrice.amount != null
        ? salePrice.amount
        : null;
  const costNum = parseChileMoney(costPrice);

  const catName =
    categories.find((c) => c.id === values.categoryId)?.name ||
    (values.categoryId ? '—' : 'Sin categoría');
  const brandViewName =
    brands.find((b) => b.id === values.brandId)?.name ||
    (values.brandLabel || '').trim() ||
    '';

  const saleDisplay =
    salePrice.mode === 'locked'
      ? salePrice.display
      : (() => {
          const n = parseChileMoney(salePrice.value);
          return n != null
            ? n.toLocaleString('es-CL', {
                style: 'currency',
                currency: 'CLP',
                maximumFractionDigits: 0,
              })
            : '—';
        })();

  function showPencil(key: ProductFichaFieldKey) {
    if (!isView || !onEnterEdit) return false;
    if (canEditField && !canEditField(key)) return false;
    if (key === 'salePrice' && salePrice.mode === 'locked') return false;
    return true;
  }

  function field(
    key: ProductFichaFieldKey,
    label: string,
    htmlFor: string,
    viewValue: ReactNode,
    editor: ReactNode,
    hint?: ReactNode,
  ) {
    const span = key === 'name' || key === 'description' ? ' prod-span-2' : '';
    if (isView) {
      return (
        <div className={`field prod-ficha-field${span}`}>
          <FieldLabel
            label={label}
            htmlFor={htmlFor}
            showPencil={showPencil(key)}
            onEnterEdit={onEnterEdit}
          />
          <div className="prod-ficha-value">{viewValue}</div>
        </div>
      );
    }
    return (
      <div className={`field${span}`}>
        <label htmlFor={htmlFor}>{label}</label>
        {editor}
        {hint}
      </div>
    );
  }

  return (
    <>
      <section className="prod-section">
        <h4 className="prod-section-title">Identidad</h4>
        <div className="prod-section-grid">
          {field(
            'name',
            'Nombre',
            `${idPrefix}-name`,
            displayOrDash(values.name),
            <input
              id={`${idPrefix}-name`}
              ref={nameRef}
              required
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              autoComplete="off"
              placeholder="Ej. Vestido satén negro"
              disabled={disabled}
            />,
          )}
          {field(
            'categoryId',
            'Categoría',
            `${idPrefix}-cat`,
            catName,
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
            </select>,
          )}
          {!hideSalePrice
            ? field(
                'salePrice',
                'Precio venta',
                `${idPrefix}-sale`,
                <>
                  <span>{saleDisplay}</span>
                  {salePrice.mode === 'locked' ? (
                    <p className="ing-hint">{salePrice.hint}</p>
                  ) : costNum != null && saleNum != null ? (
                    <MarginHint cost={costNum} sale={saleNum} />
                  ) : null}
                </>,
                salePrice.mode === 'edit' ? (
                  <>
                    <ChileMoneyInput
                      id={`${idPrefix}-sale`}
                      required
                      value={salePrice.value}
                      onChange={salePrice.onChange}
                      placeholder="0"
                      disabled={disabled}
                    />
                    <div className="prod-ficha-sale-hint">
                      <MarginHint cost={costNum} sale={saleNum} />
                    </div>
                  </>
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
                    {costNum != null && saleNum != null ? (
                      <MarginHint cost={costNum} sale={saleNum} />
                    ) : null}
                  </>
                ),
              )
            : null}
        </div>
        {extraAfterIdentity}
      </section>

      <section className="prod-section">
        <h4 className="prod-section-title">Detalle</h4>
        <div className="prod-section-grid">
          {field(
            'brandId',
            'Marca',
            `${idPrefix}-brand`,
            displayOrDash(brandViewName),
            <BrandLookup
              id={`${idPrefix}-brand`}
              value={values.brandId}
              brands={brands}
              onChange={(brandId) =>
                onChange({
                  brandId,
                  brandLabel: brands.find((b) => b.id === brandId)?.name || '',
                })
              }
              onBrandsChange={onBrandsChange}
              disabled={disabled}
            />,
          )}
          {field(
            'sizeLabel',
            'Talla',
            `${idPrefix}-size`,
            displayOrDash(values.sizeLabel),
            <input
              id={`${idPrefix}-size`}
              value={values.sizeLabel}
              onChange={(e) => onChange({ sizeLabel: e.target.value })}
              autoComplete="off"
              disabled={disabled}
            />,
          )}
          {field(
            'color',
            'Color',
            `${idPrefix}-color`,
            displayOrDash(values.color),
            <ColorSelect
              id={`${idPrefix}-color`}
              value={values.color}
              onChange={(color) => onChange({ color })}
              disabled={disabled}
            />,
          )}
          {field(
            'season',
            'Temporada',
            `${idPrefix}-season`,
            displayOrDash(values.season),
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
            </select>,
          )}

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

          {field(
            'description',
            'Descripción',
            `${idPrefix}-desc`,
            displayOrDash(values.description),
            <textarea
              id={`${idPrefix}-desc`}
              rows={2}
              value={values.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Detalle de la prenda"
              disabled={disabled}
            />,
          )}
        </div>
      </section>
    </>
  );
}
