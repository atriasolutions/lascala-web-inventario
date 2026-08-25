import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { api, userFacingError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isLeadRole } from '../lib/roles';
import { toast } from '../lib/toast';

type StocktakeListRow = {
  id: string;
  take_label: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  applied_at: string | null;
  ended_at: string | null;
  started_by_name: string | null;
  line_count: number;
  units_counted: number;
};

function fmtWhen(d: string) {
  return new Date(d).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(s: string) {
  if (s === 'in_progress') return 'En conteo';
  if (s === 'pending_review') return 'Por conciliar';
  if (s === 'completed') return 'Conciliada';
  if (s === 'cancelled') return 'Anulada';
  return s;
}

function statusBadge(s: string) {
  if (s === 'in_progress') return 'badge';
  if (s === 'pending_review') return 'badge warn';
  if (s === 'completed') return 'badge ok';
  return 'badge';
}

function canCancel(status: string) {
  return status === 'in_progress' || status === 'pending_review';
}

function endedLabel(r: StocktakeListRow) {
  if (r.status === 'in_progress') return 'En curso';
  const end = r.ended_at || r.applied_at || r.completed_at;
  return end ? fmtWhen(end) : '—';
}

export function StocktakesListPage() {
  const { branchId, branches } = useAuth();
  const role = branches.find((b) => b.id === branchId)?.role || '';
  const canManageTake = isLeadRole(role);
  const navigate = useNavigate();
  const [rows, setRows] = useState<StocktakeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'new' | 'cancel'; row?: StocktakeListRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api<{ stocktakes: StocktakeListRow[] }>('/api/stocktakes?limit=50');
      setRows(list.stocktakes || []);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudieron cargar las tomas'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, branchId]);

  const openTake = useMemo(() => rows.find((r) => r.status === 'in_progress') || null, [rows]);

  async function createTake(replace: boolean) {
    setBusy(true);
    try {
      const data = await api<{
        stocktake: { id: string; take_label: string };
        resumed: boolean;
        replacedId?: string | null;
      }>('/api/stocktakes', { method: 'POST', body: { replace } });
      if (replace && data.replacedId) {
        toast.success(`Se anuló la toma anterior. Abierta ${data.stocktake.take_label}`);
      } else {
        toast.success(`Toma ${data.stocktake.take_label} iniciada`);
      }
      setConfirm(null);
      navigate(`/inventarios/${data.stocktake.id}`);
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo abrir la toma'));
    } finally {
      setBusy(false);
    }
  }

  function onNuevaToma() {
    if (openTake) {
      if (!canManageTake) {
        navigate(`/inventarios/${openTake.id}`);
        return;
      }
      setConfirm({ kind: 'new', row: openTake });
    } else void createTake(false);
  }

  async function doCancel(row: StocktakeListRow) {
    setBusy(true);
    try {
      await api(`/api/stocktakes/${row.id}/cancel`, { method: 'POST', body: {} });
      toast.success(`${row.take_label} anulada. El stock no se tocó.`);
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(userFacingError(err, 'No se pudo anular'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ing-list st-list st-wide">
      <div className="ing-list-workspace">
        <div className="ing-list-main">
          <div className="section-title inv-topbar">
            <div className="page-intro" style={{ marginBottom: 0 }}>
              <p>Toma física de vitrina · conciliación con el sistema</p>
            </div>
            <button type="button" className="btn" disabled={busy} data-help="cta.inventarios.nueva" onClick={onNuevaToma}>
              Nueva toma
            </button>
          </div>

          <div className="ing-list-scroll">
            {loading ? (
              <div className="ing-skel" aria-busy="true" aria-label="Cargando tomas">
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
                <div className="ing-skel-row" />
              </div>
            ) : !rows.length ? (
              <div className="ing-empty">
                <p>Sin tomas todavía</p>
                <p className="muted">Pulsa Nueva toma y pistolea prenda por prenda. El conteo se guarda en cada scan.</p>
              </div>
            ) : (
              <>
                <div className="list-cards mobile-only">
                  {rows.map((r) => (
                    <article key={r.id} className="list-card ing-row st-list-card">
                      <Link to={`/inventarios/${r.id}`} className="st-list-card-main">
                        <div className="row">
                          <strong>{r.take_label}</strong>
                          <span className={statusBadge(r.status)}>{statusLabel(r.status)}</span>
                        </div>
                        <div className="meta">
                          Inicio {fmtWhen(r.started_at)}
                          {r.started_by_name ? ` · ${r.started_by_name}` : ''}
                        </div>
                        <div className="meta">Término {endedLabel(r)}</div>
                        <div className="ing-card-foot">
                          <span className="ing-progress-meta">
                            {r.line_count} prenda{r.line_count === 1 ? '' : 's'} · {r.units_counted} uds
                          </span>
                        </div>
                      </Link>
                      <div className="st-row-actions">
                        {r.status === 'in_progress' ? (
                          <Link className="btn" to={`/inventarios/${r.id}`}>
                            Continuar
                          </Link>
                        ) : (
                          <Link className="btn secondary" to={`/inventarios/${r.id}`}>
                            Ver
                          </Link>
                        )}
                        {canManageTake && canCancel(r.status) ? (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setConfirm({ kind: 'cancel', row: r })}
                          >
                            Anular
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>

                <div className="table-wrap desktop-only">
                  <table className="table ing-table">
                    <thead>
                      <tr>
                        <th>Toma</th>
                        <th>Estado</th>
                        <th>Inicio</th>
                        <th>Término</th>
                        <th>Resumen</th>
                        <th className="ing-th-action">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="ing-row">
                          <td>
                            <Link to={`/inventarios/${r.id}`}>
                              <strong>{r.take_label}</strong>
                            </Link>
                            {r.started_by_name ? (
                              <div className="meta muted">{r.started_by_name}</div>
                            ) : null}
                          </td>
                          <td>
                            <span className={statusBadge(r.status)}>{statusLabel(r.status)}</span>
                          </td>
                          <td className="ing-td-date">{fmtWhen(r.started_at)}</td>
                          <td className="ing-td-date">{endedLabel(r)}</td>
                          <td>
                            {r.line_count} prenda{r.line_count === 1 ? '' : 's'} · {r.units_counted} uds
                          </td>
                          <td className="ing-td-action">
                            <div className="st-row-actions st-row-actions-inline">
                              {r.status === 'in_progress' ? (
                                <Link className="ing-row-action" to={`/inventarios/${r.id}`}>
                                  Continuar
                                </Link>
                              ) : (
                                <Link className="ing-row-action is-review" to={`/inventarios/${r.id}`}>
                                  Ver
                                </Link>
                              )}
                              {canManageTake && canCancel(r.status) ? (
                                <button
                                  type="button"
                                  className="btn ghost st-row-cancel"
                                  onClick={() => setConfirm({ kind: 'cancel', row: r })}
                                >
                                  Anular
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm?.kind === 'new'}
        title="Nueva toma"
        message={
          openTake
            ? `Hay una toma en curso (${openTake.take_label}). Si abres una nueva, se anula esa y se pierde el conteo no cerrado. El stock de vitrina no cambia.`
            : 'Se abrirá una toma nueva.'
        }
        confirmLabel={busy ? 'Abriendo…' : 'Anular y crear'}
        cancelLabel="Volver"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => void createTake(true)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        title="Anular toma"
        message={
          confirm?.row
            ? `Se anulará ${confirm.row.take_label}. Se pierde el conteo no cerrado y el stock de vitrina no cambia.`
            : 'Se anula la toma. El stock no se toca.'
        }
        confirmLabel={busy ? 'Anulando…' : 'Anular'}
        cancelLabel="Volver"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.row && void doCancel(confirm.row)}
      />
    </div>
  );
}
