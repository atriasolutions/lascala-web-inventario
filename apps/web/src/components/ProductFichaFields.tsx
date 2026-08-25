import type { ReactNode, Ref } from 'react';
import { ChileMoneyInput } from './ChileMoneyInput';
import { ColorSelect } from './ColorSelect';
import { IconCheck, IconClose, IconPencil } from './icons';
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

/** Campos de identidad/detalle editables con lápiz en modo vista. */
export type ProductFichaFieldKey =
  | 'name'
  | 'categoryId'
  | 'salePrice'
  | 'brand'
  | 'productType'
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

type ViewControls = {
  activeField: ProductFichaFieldKey | null;
  onRequestEdit: (key: ProductFichaFieldKey) => void;
  onCancelField: () => void;
  onCommitField: () => void;
  /** Si false, no se muestra lápiz (p. ej. precio para vendedora). */
  canEditField?: (key: ProductFichaFieldKey) => boolean;
  fieldBusy?: boolean;
};

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
  /**
   * `edit` = formulario completo (alta / Ingresos).
   * `view` = lectura + lápiz por campo (ficha Productos).
   */
  mode?: 'edit' | 'view';
  view?: ViewControls;
};

function displayOrDash(v: string | null | undefined) {
  const t = (v || '').trim();
  return t || '—';
}

function FieldChrome({
  label,
  htmlFor,
  canEdit,
  isActive,
  onEdit,
  onCancel,
  onCommit,
  busy,
  children,
  viewValue,
}: {
  label: string;
  htmlFor: string;
  canEdit: boolean;
  isActive: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onCommit: () => void;
  busy?: boolean;
  children: ReactNode;
  viewValue: ReactNode;
}) {
  return (
    <div className={`field prod-ficha-field${isActive ? ' is-editing' : ''}`}>
      <div className="prod-ficha-label-row">
        <label htmlFor={htmlFor}>{label}</label>
        {canEdit && !isActive ? (
          <button
            type="button"
            className="prod-ficha-pencil"
            aria-label={`Editar ${label}`}
            onClick={onEdit}
          >
            <IconPencil size={15} />
          </button>
        ) : null}
        {isActive ? (
          <div className="prod-ficha-inline-actions">
            <button
              type="button"
              className="prod-ficha-inline-btn is-save"
              aria-label="Guardar"
              disabled={busy}
              onClick={onCommit}
            >
              <IconCheck size={15} />
            </button>
            <button
              type="button"
              className="prod-ficha-inline-btn"
              aria-label="Cancelar"
              disabled={busy}
              onClick={onCancel}
            >
              <IconClose size={15} />
            </button>
          </div>
        ) : null}
      </div>
      {isActive ? children : <div className="prod-ficha-value">{viewValue}</div>}
    </div>
  );
}

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
  mode = 'edit',
  view,
}: Props) {
  const isView = mode === 'view' && view;
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

  const catName =
    categories.find((c) => c.id === values.categoryId)?.name ||
    (values.categoryId ? '—' : 'Sin categoría');

  const saleDisplay =
    salePrice.mode === 'locked'
      ? salePrice.display
      : (() => {
          const n = parseChileMoney(salePrice.value);
          return n != null
            ? n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
            : '—';
        })();

  function canEdit(key: ProductFichaFieldKey) {
    if (!isView) return false;
    if (view.canEditField && !view.canEditField(key)) return false;
    if (key === 'salePrice' && salePrice.mode === 'locked') return false;
    return true;
  }

  function wrap(
    key: ProductFichaFieldKey,
    label: string,
    htmlFor: string,
    viewValue: ReactNode,
    editor: ReactNode,
    hint?: ReactNode,
  ) {
    if (!isView) {
      return (
        <div className={`field${key === 'name' || key === 'description' ? ' prod-span-2' : ''}`}>
          <label htmlFor={htmlFor}>{label}</label>
          {editor}
          {hint}
        </div>
      );
    }
    const active = view.activeField === key;
    return (
      <div className={key === 'name' || key === 'description' ? 'prod-span-2' : undefined}>
        <FieldChrome
          label={label}
          htmlFor={htmlFor}
          canEdit={canEdit(key)}
          isActive={active}
          onEdit={() => view.onRequestEdit(key)}
          onCancel={view.onCancelField}
          onCommit={view.onCommitField}
          busy={view.fieldBusy || disabled}
          viewValue={viewValue}
        >
          {editor}
          {hint}
        </FieldChrome>
      </div>
    );
  }

  const nameEditor = (
    <input
      id={`${idPrefix}-name`}
      ref={nameRef}
      required={!isView}
      value={values.name}
      onChange={(e) => onChange({ name: e.target.value })}
      autoComplete="off"
      placeholder="Ej. Vestido satén negro"
      disabled={disabled || (isView && view.activeField !== 'name')}
    />
  );

  const catEditor = (
    <select
      id={`${idPrefix}-cat`}
      value={values.categoryId}
      onChange={(e) => onChange({ categoryId: e.target.value })}
      disabled={disabled || (isView && view.activeField !== 'categoryId')}
    >
      <option value="">Seleccionar</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );

  const saleEditor =
    salePrice.mode === 'edit' ? (
      <>
        <ChileMoneyInput
          id={`${idPrefix}-sale`}
          required={!isView}
          value={salePrice.value}
          onChange={salePrice.onChange}
          placeholder="0"
          disabled={disabled || (isView && view.activeField !== 'salePrice')}
        />
        <MarginHint cost={costNum} sale={saleNum} />
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
        {(costNum != null && saleNum != null) ? <MarginHint cost={costNum} sale={saleNum} /> : null}
      </>
    );

  return (
    <>
      <section className="prod-section">
        <h4 className="prod-section-title">Identidad</h4>
        <div className="prod-section-grid">
          {wrap('name', 'Nombre', `${idPrefix}-name`, displayOrDash(values.name), nameEditor)}
          {wrap('categoryId', 'Categoría', `${idPrefix}-cat`, catName, catEditor)}
          {wrap(
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
            saleEditor,
          )}
        </div>
        {extraAfterIdentity}
      </section>

      <section className="prod-section">
        <h4 className="prod-section-title">Detalle</h4>
        <div className="prod-section-grid">
          {wrap(
            'brand',
            'Marca',
            `${idPrefix}-brand`,
            displayOrDash(values.brand),
            <input
              id={`${idPrefix}-brand`}
              value={values.brand}
              onChange={(e) => onChange({ brand: e.target.value })}
              autoComplete="off"
              disabled={disabled || (isView && view!.activeField !== 'brand')}
            />,
          )}
          {wrap(
            'productType',
            'Tipología',
            `${idPrefix}-type`,
            displayOrDash(values.productType),
            <input
              id={`${idPrefix}-type`}
              value={values.productType}
              onChange={(e) => onChange({ productType: e.target.value })}
              placeholder="Ej. vestido, jeans"
              autoComplete="off"
              disabled={disabled || (isView && view!.activeField !== 'productType')}
            />,
          )}
          {wrap(
            'sizeLabel',
            'Talla',
            `${idPrefix}-size`,
            displayOrDash(values.sizeLabel),
            <input
              id={`${idPrefix}-size`}
              value={values.sizeLabel}
              onChange={(e) => onChange({ sizeLabel: e.target.value })}
              autoComplete="off"
              disabled={disabled || (isView && view!.activeField !== 'sizeLabel')}
            />,
          )}
          {wrap(
            'color',
            'Color',
            `${idPrefix}-color`,
            displayOrDash(values.color),
            <ColorSelect
              id={`${idPrefix}-color`}
              value={values.color}
              onChange={(color) => onChange({ color })}
              disabled={disabled || (isView && view!.activeField !== 'color')}
            />,
          )}
          {wrap(
            'season',
            'Temporada',
            `${idPrefix}-season`,
            displayOrDash(values.season),
            <select
              id={`${idPrefix}-season`}
              value={values.season}
              onChange={(e) => onChange({ season: e.target.value })}
              disabled={disabled || (isView && view!.activeField !== 'season')}
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

          {wrap(
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
              disabled={disabled || (isView && view!.activeField !== 'description')}
            />,
          )}
        </div>
      </section>
    </>
  );
}
