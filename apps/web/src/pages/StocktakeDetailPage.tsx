import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ModalOverlayClose } from '../components/ModalOverlayClose';
import { ProductPhotoPlaceholder } from '../components/ProductPhotoPlaceholder';
import { IconTrash } from '../components/icons';
import { useShellTitle } from '../components/shellTitle';
import { api, mediaUrl, userFacingError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isLeadRole } from '../lib/roles';
import { normalizeScanCode } from '../lib/scanCode';
import { toast } from '../lib/toast';

type QtyDraft = {
  code: string;
  productId: string;
  name: string;
  currentCounted: number;
};

type Decision = 'keep_system' | 'use_physical' | 'adjust';

type LineChoice = { action: Decision; qtyOverride?: number | null };

type Stocktake = {
  id: string;
  take_label: string;
  status: 'in_progress' | 'pending_review' | 'completed' | 'cancelled' | string;
  started_at: string;
  completed_at: string | null;
  applied_at?: string | null;
  started_by_name?: string | null;
  completed_by_name?: string | null;
  applied_by_name?: string | null;
};

type Line = {
  id: string;
  product_id: string;
  qty_counted: number;
  qty_system_at_close: number | null;
  qty_override?: number | null;
  qty_system_live: number;
  decision: Decision | null;
  product_name: string;
  internal_code: string;
  barcode: string | null;
  size_label: string | null;
  color: string | null;
  photo_url: string | null;
};

function Thumb({ url }: { url: string | null }) {
  const src = mediaUrl(url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <ProductPhotoPlaceholder className="st-thumb-ph" showLabel={false} />;
  }
  return <img className="st-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function fmtWhen(d: string) {
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LineActions({
  choice,
  onKeepCounted,
  onKeepSystem,
  onAdjust,
}: {
  choice: LineChoice;
  onKeepCounted: () => void;
  onKeepSystem: () => void;
  onAdjust: () => void;
}) {
  return (
    <div className="st-line-actions">
      <button
        type="button"
        className={`btn secondary${choice.action === 'use_physical' ? ' is-active' : ''}`}
        onClick={onKeepCounted}
      >
        Conservar inventario
      </button>
      <button
        type="button"
        className={`btn ghost${choice.action === 'keep_system' ? ' is-active' : ''}`}
        onClick={onKeepSystem}
      >
        Conservar stock anterior
      </button>
      <button
        type="button"
        className={`btn ghost${choice.action === 'adjust' ? ' is-active' : ''}`}
        onClick={onAdjust}
      >
        {choice.action === 'adjust' && choice.qtyOverride != null
          ? `Ajustar (${choice.qtyOverride} uds)`
          : 'Ajustar cantidad'}
      </button>
    </div>
  );
}

function decisionLabel(d: Decision | null, kind: 'ok' | 'faltante' | 'sobrante', qtyOverride?: number | null) {
  if (kind === 'ok' && d !== 'adjust') return 'Cuadró';
  if (d === 'use_physical') return 'Se conservó el inventario (contado)';
  if (d === 'keep_system') return 'Se conservó el stock anterior';
  if (d === 'adjust') return `Se ajustó a ${qtyOverride ?? '—'} uds`;
  return 'Sin aplicar';
}

function diffKind(counted: number, system: number) {
  if (counted === system) return 'ok' as const;
  if (counted < system) return 'faltante' as const;
  return 'sobrante' as const;
}

function diffLabel(kind: 'ok' | 'faltante' | 'sobrante') {
  if (kind === 'ok') return 'Cuadra';
  if (kind === 'faltante') return 'Faltante';
  return 'Sobrante';
}

export function StocktakeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const setTitle = useShellTitle();
  const { branches, branchId } = useAuth();
  const role = branches.find((b) => b.id === branchId)?.role || '';
  const canApply = isLeadRole(role);

  const scanRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const adjustTitleId = useId();
  const qtyTitleId = useId();
  const [code, setCode] = useState('');
  const [stocktake, setStocktake] = useState<Stocktake | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, LineChoice>>({});
  const [adjustLine, setAdjustLine] = useState<Line | null>(null);
  const [adjustQty, setAdjustQty] = useState('0');
  const [confirm, setConfirm] = useState<'complete' | 'apply' | 'cancel' | null>(null);
  const [qtyDraft, setQtyDraft] = useState<QtyDraft | null>(null);
  const [qtyMode, setQtyMode] = useState<'add' | 'set'>('add');
  const [qtyValue, setQtyValue] = useState('1');
  const [removeLine, setRemoveLine] = useState<Line | null>(null);

  const applyPayload = useCallback(() => {
    return Object.entries(decisions).map(([productId, choice]) => ({
      productId,
      action: choice.action,
      qtyOverride: choice.action === 'adjust' ? Number(choice.qtyOverride ?? 0) : null,
    }));
  }, [decisions]);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await api<{ stocktake: Stocktake; lines: Line[] }>(`/api/stocktakes/${id}`);
    setStocktake(data.stocktake);
    setLines(data.lines || []);
    const next: Record<string, LineChoice> = {};
    for (const l of data.lines || []) {
      const system = Number(l.qty_system_at_close ?? 0);
      const counted = Number(l.qty_counted || 0);
      if (l.decision) {
        next[l.product_id] = { action: l.decision, qtyOverride: l.qty_override };
      } else if (counted !== system && data.stocktake.status === 'pending_review') {
        next[l.product_id] = { action: 'keep_system' };
      }
    }
    setDecisions(next);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) toast.error(userFacingError(err, 'No se pudo abrir la toma'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!stocktake) {
      setTitle(null);
      return;
    }
    setTitle(stocktake.take_label);
    return () => setTitle(null);
  }, [stocktake, setTitle]);

  useEffect(() => {
    if (stocktake?.status === 'in_progress') {
      requestAnimationFrame(() => scanRef.current?.focus());
    }
  }, [stocktake?.status]);

  const countedLines = useMemo(
    () => lines.filter((l) => Number(l.qty_counted) > 0 || stocktake?.status !== 'in_progress'),
    [lines, stocktake?.status],
  );

  const reviewLines = useMemo(() => {
    if (stocktake?.status === 'in_progress') return [];
    return [...lines].sort((a, b) => {
      const ka = diffKind(Number(a.qty_counted), Number(a.qty_system_at_close ?? 0));
      const kb = diffKind(Number(b.qty_counted), Number(b.qty_system_at_close ?? 0));
      const order = { faltante: 0, sobrante: 1, ok: 2 };
      return order[ka] - order[kb];
    });
  }, [lines, stocktake?.status]);

  const diffCount = reviewLines.filter((l) => {
    return diffKind(Number(l.qty_counted), Number(l.qty_system_at_close ?? 0)) !== 'ok';
  }).length;

  async function onScan(e?: FormEvent) {
    e?.preventDefault();
    if (!id) return;
    const raw = normalizeScanCode(scanRef.current?.value ?? code);
    if (!raw) return;
    setScanning(true);
    try {
      const data = await api<{
        product: {
          id: string;
          name: string;
          tracks_stock?: boolean;
        };
      }>(`/api/products/by-code/${encodeURIComponent(raw)}`);
      const product = data.product;
      if (product.tracks_stock === false) {
        toast.error('Esta prenda no controla stock de vitrina');
        return;
      }
      const existing = lines.find((l) => l.product_id === product.id);
      setQtyDraft({
        code: raw,
        productId: product.id,
        name: product.name,
        currentCounted: existing ? Number(existing.qty_counted) : 0,
      });
      setQtyMode('add');
      setQtyValue('1');
      setCode('');
    } catch (err) {
      toast.error(userFacingError(err, 'No se encontró la prenda'));
      scanRef.current?.select();
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (!qtyDraft) return;
    const t = window.setTimeout(() => qtyInputRef.current?.select(), 40);
    return () => window.clearTimeout(t);
  }, [qtyDraft]);

  async function confirmQty() {
    if (!id || !qtyDraft) return;
    const n = Number.parseInt(qtyValue, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Indica una cantidad válida');
      return;
    }
    if (qtyMode === 'add' && n < 1) {
      toast.error('Para sumar, la cantidad debe ser al menos 1');
      return;
    }
    setBusy(true);
    try {
      const data = await api<{
        stocktake: Stocktake;
        lines: Line[];
        scanned: { name: string; qty: number };
      }>(`/api/stocktakes/${id}/scan`, {
        method: 'POST',
        body: { code: qtyDraft.code, quantity: n, mode: qtyMode },
      });
      setStocktake(data.stocktake);
      setLines(data.lines || []);
      toast.success(
        qtyMode === 'set'
          ? `${data.scanned.name} · quedó en ${data.scanned.qty} uds`
          : `${data.scanned.name} · ${data.scanned.qty} uds`,
      );
      setQtyDraft(null);
      scanRef.current?.focus();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo registrar el conteo'));
    } finally {
      setBusy(false);
    }
  }

  async function doRemoveLine() {
    if (!id || !removeLine) return;
    setBusy(true);
    try {
      const data = await api<{ stocktake: Stocktake; lines: Line[] }>(
        `/api/stocktakes/${id}/lines/${removeLine.product_id}`,
        { method: 'DELETE' },
      );
      setStocktake(data.stocktake);
      setLines(data.lines || []);
      toast.success(`Se quitó ${removeLine.product_name} del conteo`);
      setRemoveLine(null);
      scanRef.current?.focus();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo quitar la prenda'));
    } finally {
      setBusy(false);
    }
  }

  async function doComplete() {
    if (!id) return;
    setBusy(true);
    try {
      const data = await api<{ stocktake: Stocktake; lines: Line[] }>(`/api/stocktakes/${id}/complete`, {
        method: 'POST',
        body: {},
      });
      setStocktake(data.stocktake);
      setLines(data.lines || []);
      toast.success('Conteo cerrado. Revisa las diferencias (stock sistema al cerrar).');
      setConfirm(null);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo finalizar el conteo'));
    } finally {
      setBusy(false);
    }
  }

  async function doApply() {
    if (!id) return;
    setBusy(true);
    try {
      const data = await api<{ stocktake: Stocktake; lines: Line[]; adjusted: number }>(
        `/api/stocktakes/${id}/apply`,
        { method: 'POST', body: { decisions: applyPayload() } },
      );
      setStocktake(data.stocktake);
      setLines(data.lines || []);
      toast.success(
        data.adjusted
          ? `Ajuste aplicado · ${data.adjusted} movimiento${data.adjusted === 1 ? '' : 's'}`
          : 'Conciliación lista. No hubo movimientos (se conservó el sistema).',
      );
      setConfirm(null);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo aplicar el ajuste'));
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/api/stocktakes/${id}/cancel`, { method: 'POST', body: {} });
      toast.success('Toma anulada. El stock no se tocó.');
      setConfirm(null);
      navigate('/inventarios');
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo anular'));
    } finally {
      setBusy(false);
    }
  }

  function setAllDiffs(action: Exclude<Decision, 'adjust'>) {
    const next = { ...decisions };
    for (const l of reviewLines) {
      const kind = diffKind(Number(l.qty_counted), Number(l.qty_system_at_close ?? 0));
      if (kind !== 'ok') next[l.product_id] = { action };
    }
    setDecisions(next);
  }

  function setLineAction(productId: string, action: Exclude<Decision, 'adjust'>) {
    setDecisions((d) => ({ ...d, [productId]: { action } }));
  }

  function openAdjust(line: Line) {
    const existing = decisions[line.product_id];
    const fallback =
      existing?.action === 'adjust' && existing.qtyOverride != null
        ? String(existing.qtyOverride)
        : String(line.qty_counted ?? 0);
    setAdjustQty(fallback);
    setAdjustLine(line);
  }

  function saveAdjust() {
    if (!adjustLine) return;
    const n = Number.parseInt(adjustQty, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Indica una cantidad válida (0 o más)');
      return;
    }
    setDecisions((d) => ({
      ...d,
      [adjustLine.product_id]: { action: 'adjust', qtyOverride: n },
    }));
    setAdjustLine(null);
  }

  if (loading) {
    return <p className="muted" style={{ padding: '1rem' }}>Cargando toma…</p>;
  }
  if (!stocktake) {
    return (
      <div className="ing-empty">
        <p>Toma no encontrada</p>
        <Link to="/inventarios" className="btn secondary">
          Volver a Inventarios
        </Link>
      </div>
    );
  }

  const counting = stocktake.status === 'in_progress';
  const reviewing = stocktake.status === 'pending_review';
  const cancelled = stocktake.status === 'cancelled';
  const completed = stocktake.status === 'completed';
  const endedAt = stocktake.applied_at || stocktake.completed_at;

  return (
    <div className="ing-list st-detail st-wide">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
          <p className="muted st-banner">
            Inicio {fmtWhen(stocktake.started_at)}
            {stocktake.started_by_name ? ` · ${stocktake.started_by_name}` : ''}
            {' · '}
            Término {endedAt ? fmtWhen(endedAt) : 'En curso'}
          </p>
          <p className="muted st-banner">
            {counting
              ? 'Cada pistoleo se guarda altiro. Si sales o se cae la conexión, retomas esta misma toma.'
              : cancelled
                ? 'Toma anulada. El stock de vitrina no se modificó.'
                : 'Las diferencias usan el stock del sistema al cerrar el conteo, no el de ahora.'}
          </p>

          {counting ? (
            <>
              <form className="st-scan merma-scan-row" onSubmit={(e) => void onScan(e)}>
                <label className="sr-only" htmlFor="st-scan">
                  Código de la prenda
                </label>
                <input
                  id="st-scan"
                  ref={scanRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Pistolea o escribe el código"
                  autoComplete="off"
                  autoFocus
                />
                <button type="submit" className="btn" disabled={scanning || busy}>
                  {scanning ? 'Buscando…' : 'Contar'}
                </button>
              </form>
              <p className="ing-hint st-scan-hint">
                Tras el código puedes sumar varias unidades o fijar la cantidad, sin pistolear una por una.
              </p>

              <div className="ing-list-scroll">
                {!countedLines.length ? (
                  <p className="muted">Aún no hay prendas contadas.</p>
                ) : (
                  <ul className="st-count-list">
                    {countedLines.map((l) => (
                      <li key={l.id} className="st-count-row">
                        <Thumb url={l.photo_url} />
                        <div>
                          <strong>{l.product_name}</strong>
                          <p className="muted">
                            {l.internal_code}
                            {l.size_label ? ` · T.${l.size_label}` : ''}
                          </p>
                        </div>
                        <span className="st-qty">{l.qty_counted}</span>
                        <button
                          type="button"
                          className="btn ghost st-line-remove"
                          aria-label={`Quitar ${l.product_name} del conteo`}
                          disabled={busy}
                          onClick={() => setRemoveLine(l)}
                        >
                          <IconTrash size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="st-actions">
                {canApply ? (
                  <button type="button" className="btn ghost" onClick={() => setConfirm('cancel')}>
                    Anular
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={() => setConfirm('complete')}>
                  Finalizar conteo
                </button>
              </div>
            </>
          ) : null}

          {cancelled ? (
            <>
              <div className="ing-list-scroll">
                {!countedLines.filter((l) => Number(l.qty_counted) > 0).length ? (
                  <p className="muted">No se llegó a pistolear prendas.</p>
                ) : (
                  <ul className="st-count-list">
                    {countedLines
                      .filter((l) => Number(l.qty_counted) > 0)
                      .map((l) => (
                        <li key={l.id} className="st-count-row">
                          <Thumb url={l.photo_url} />
                          <div>
                            <strong>{l.product_name}</strong>
                            <p className="muted">
                              {l.internal_code}
                              {l.size_label ? ` · T.${l.size_label}` : ''}
                            </p>
                          </div>
                          <span className="st-qty">{l.qty_counted}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div className="st-actions">
                <Link className="btn secondary" to="/inventarios">
                  Volver
                </Link>
              </div>
            </>
          ) : null}

          {reviewing || completed ? (
            <>
              {reviewing && !canApply ? (
                <p className="muted st-banner">
                  El conteo está listo. Administrador/a o Encargado/a elige qué stock dejar en cada prenda.
                </p>
              ) : null}

              <div className="st-diff-toolbar">
                <span>
                  {diffCount} diferencia{diffCount === 1 ? '' : 's'} · stock sistema al cerrar
                </span>
                {reviewing && canApply ? (
                  <span className="st-diff-btns">
                    <button type="button" className="btn secondary" onClick={() => setAllDiffs('use_physical')}>
                      Conservar inventario en todos
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setAllDiffs('keep_system')}>
                      Conservar stock anterior en todos
                    </button>
                  </span>
                ) : null}
              </div>

              <div className="ing-list-scroll">
                <div className="table-wrap desktop-only">
                  <table className="table ing-table st-recon-table">
                    <thead>
                      <tr>
                        <th>Prenda</th>
                        <th>Físico contado</th>
                        <th>Stock anterior</th>
                        <th>Qué hacer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewLines.map((l) => {
                        const system = Number(l.qty_system_at_close ?? 0);
                        const counted = Number(l.qty_counted || 0);
                        const kind = diffKind(counted, system);
                        const choice = decisions[l.product_id] || {
                          action: (l.decision as Decision) || 'keep_system',
                          qtyOverride: l.qty_override,
                        };
                        return (
                          <tr key={l.id} className={`st-diff-${kind}`}>
                            <td>
                              <div className="st-recon-prod">
                                <Thumb url={l.photo_url} />
                                <div>
                                  <strong>{l.product_name}</strong>
                                  <p className="muted">
                                    {l.internal_code} · {diffLabel(kind)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td>{counted}</td>
                            <td>{system}</td>
                            <td>
                              {reviewing && canApply ? (
                                <LineActions
                                  choice={choice}
                                  onKeepCounted={() => setLineAction(l.product_id, 'use_physical')}
                                  onKeepSystem={() => setLineAction(l.product_id, 'keep_system')}
                                  onAdjust={() => openAdjust(l)}
                                />
                              ) : (
                                <span className="muted">
                                  {decisionLabel(l.decision, kind, l.qty_override)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <ul className="st-count-list mobile-only">
                  {reviewLines.map((l) => {
                    const system = Number(l.qty_system_at_close ?? 0);
                    const counted = Number(l.qty_counted || 0);
                    const kind = diffKind(counted, system);
                    const choice = decisions[l.product_id] || {
                      action: (l.decision as Decision) || 'keep_system',
                      qtyOverride: l.qty_override,
                    };
                    return (
                      <li key={l.id} className={`st-count-row st-recon-mobile st-diff-${kind}`}>
                        <Thumb url={l.photo_url} />
                        <div>
                          <strong>{l.product_name}</strong>
                          <p className="muted">
                            {l.internal_code} · {diffLabel(kind)}
                          </p>
                          <p className="muted">
                            Físico {counted} · Stock anterior {system}
                            {completed ? ` · ${decisionLabel(l.decision, kind, l.qty_override)}` : ''}
                          </p>
                          {reviewing && canApply ? (
                            <LineActions
                              choice={choice}
                              onKeepCounted={() => setLineAction(l.product_id, 'use_physical')}
                              onKeepSystem={() => setLineAction(l.product_id, 'keep_system')}
                              onAdjust={() => openAdjust(l)}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {reviewing && canApply ? (
                <div className="st-actions">
                  <button type="button" className="btn ghost" onClick={() => setConfirm('cancel')}>
                    Anular toma
                  </button>
                  <button type="button" className="btn" data-help="cta.inventarios.aplicar" onClick={() => setConfirm('apply')}>
                    Aplicar conciliación
                  </button>
                </div>
              ) : (
                <div className="st-actions">
                  <Link className="btn secondary" to="/inventarios">
                    Volver
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'complete'}
        title="Finalizar conteo"
        message="Se comparará lo pistoleado con el stock del sistema ahora (stock al cerrar). Las prendas de vitrina no escaneadas quedan en físico 0."
        confirmLabel="Finalizar"
        cancelLabel="Seguir contando"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void doComplete()}
      />
      <ConfirmDialog
        open={confirm === 'apply'}
        title="Aplicar conciliación"
        message="Conservar inventario deja el stock en lo contado. Conservar stock anterior no mueve esa línea. Ajustar deja la cantidad que indicaste. Esto no se puede deshacer desde aquí."
        confirmLabel={busy ? 'Aplicando…' : 'Aplicar'}
        cancelLabel="Volver"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void doApply()}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Anular toma"
        message="Se anula el conteo. El stock de vitrina no cambia."
        confirmLabel="Anular"
        cancelLabel="Volver"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => void doCancel()}
      />
      <ConfirmDialog
        open={Boolean(removeLine)}
        title="Quitar del conteo"
        message={
          removeLine
            ? `¿Quieres quitar «${removeLine.product_name}» (${removeLine.qty_counted} uds) de esta toma?`
            : ''
        }
        confirmLabel={busy ? 'Quitando…' : 'Quitar'}
        cancelLabel="Cancelar"
        danger
        onCancel={() => setRemoveLine(null)}
        onConfirm={() => void doRemoveLine()}
      />
      {qtyDraft ? (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setQtyDraft(null);
          }}
        >
          <ModalOverlayClose onClose={() => !busy && setQtyDraft(null)}>
            <form
              className="pos-modal-panel ing-line-modal st-adjust-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={qtyTitleId}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                void confirmQty();
              }}
            >
              <div className="pos-modal-head">
                <h3 id={qtyTitleId}>Cantidad contada</h3>
              </div>
              <div className="st-adjust-body">
                <p>
                  <strong>{qtyDraft.name}</strong>
                </p>
                {qtyDraft.currentCounted > 0 ? (
                  <p className="muted">Ya llevas {qtyDraft.currentCounted} en el conteo</p>
                ) : (
                  <p className="muted">Primera vez en esta toma</p>
                )}
                <div className="st-qty-mode" role="group" aria-label="Cómo aplicar la cantidad">
                  <button
                    type="button"
                    className={`btn secondary${qtyMode === 'add' ? ' is-active' : ''}`}
                    onClick={() => {
                      setQtyMode('add');
                      setQtyValue('1');
                    }}
                  >
                    Sumar
                  </button>
                  <button
                    type="button"
                    className={`btn secondary${qtyMode === 'set' ? ' is-active' : ''}`}
                    onClick={() => {
                      setQtyMode('set');
                      setQtyValue(
                        String(qtyDraft.currentCounted > 0 ? qtyDraft.currentCounted : 1),
                      );
                    }}
                  >
                    Fijar cantidad
                  </button>
                </div>
                <label className="field" htmlFor="st-qty-input">
                  {qtyMode === 'add' ? 'Unidades a sumar' : 'Dejar el conteo en'}
                  <input
                    id="st-qty-input"
                    ref={qtyInputRef}
                    type="number"
                    min={qtyMode === 'add' ? 1 : 0}
                    step={1}
                    inputMode="numeric"
                    value={qtyValue}
                    onChange={(e) => setQtyValue(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              <div className="st-adjust-foot">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => setQtyDraft(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Guardando…' : qtyMode === 'add' ? 'Sumar al conteo' : 'Fijar'}
                </button>
              </div>
            </form>
          </ModalOverlayClose>
        </div>
      ) : null}
      {adjustLine ? (
        <div
          className="pos-modal open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdjustLine(null);
          }}
        >
          <ModalOverlayClose onClose={() => setAdjustLine(null)}>
          <form
            className="pos-modal-panel ing-line-modal st-adjust-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={adjustTitleId}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveAdjust();
            }}
          >
            <div className="pos-modal-head">
              <h3 id={adjustTitleId}>Ajustar cantidad</h3>
            </div>
            <div className="st-adjust-body">
              <div className="st-recon-prod">
                <Thumb url={adjustLine.photo_url} />
                <div>
                  <strong>{adjustLine.product_name}</strong>
                  <p className="muted">{adjustLine.internal_code}</p>
                </div>
              </div>
              <p className="muted">
                Físico contado: <strong>{adjustLine.qty_counted}</strong>
                {' · '}
                Stock anterior: <strong>{Number(adjustLine.qty_system_at_close ?? 0)}</strong>
              </p>
              <label className="field">
                Cantidad a dejar en stock
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  autoFocus
                />
              </label>
            </div>
            <div className="st-adjust-foot">
              <button type="button" className="btn ghost" onClick={() => setAdjustLine(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn">
                Guardar
              </button>
            </div>
          </form>
          </ModalOverlayClose>
        </div>
      ) : null}
    </div>
  );
}
