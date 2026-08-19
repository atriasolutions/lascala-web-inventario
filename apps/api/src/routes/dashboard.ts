import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch } from '../middleware/auth.js';
import { getExpiringVouchers, getLowStockAlerts, getNoMovementAlerts } from '../services/inventory.js';
import { asyncHandler } from '../utils/errors.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireBranch);

/** Fecha civil / ventanas de KPI en zona Boutique L'Scala (Calama). */
const TZ = 'America/Santiago';

/**
 * KPIs del summary (fecha civil Chile, no UTC de sesión):
 * - salesDay / salesMonth / salesTrend / salesLast30 / expenses* / reinvestmentMonth:
 *   cortes con timezone('America/Santiago', …), no CURRENT_DATE/now() crudos.
 * - Scope: sucursal activa (X-Branch-Id) salvo consolidated=1 (owner, toda la org).
 *   Siempre todas las cajas (POS) de esa branch — sin filtro pos_id.
 * - topProducts: top 20 por qty vendida en últimos 30 días (civil Chile).
 * - lowRotation: top 20 por días sin inventory_movements en la branch
 *   (stock > 0, tracks_stock); nunca movió primero (NULLS FIRST).
 */
dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const branchId = req.activeBranchId!;
    const consolidated = req.query.consolidated === '1' && req.activeRole === 'owner';

    const salesFilter = consolidated
      ? 's.organization_id = $1'
      : 's.branch_id = $1';
    const param = consolidated ? req.user!.organizationId : branchId;

    // Día civil Chile: (sold_at AT TZ)::date = (now() AT TZ)::date
    const salesDay = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*)::text AS count
       FROM sales s
       WHERE ${salesFilter}
         AND (timezone('${TZ}', s.sold_at))::date
           = (timezone('${TZ}', now()))::date`,
      [param],
    );

    const salesMonth = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*)::text AS count
       FROM sales s
       WHERE ${salesFilter}
         AND date_trunc('month', timezone('${TZ}', s.sold_at))
           = date_trunc('month', timezone('${TZ}', now()))`,
      [param],
    );

    // Últimos 30 días: desde el inicio del día civil Chile hace 29 días (ventana inclusiva de 30).
    const salesLast30 = await query<{ total: string; count: string; units: string }>(
      `SELECT COALESCE(SUM(s.total),0)::text AS total,
              COUNT(s.id)::text AS count,
              COALESCE((
                SELECT SUM(si.quantity)
                FROM sale_items si
                WHERE si.sale_id IN (
                  SELECT s2.id FROM sales s2
                  WHERE ${salesFilter.replaceAll('s.', 's2.')}
                    AND s2.sold_at >= (
                      ((timezone('${TZ}', now()))::date - 29)::timestamp
                      AT TIME ZONE '${TZ}'
                    )
                )
              ),0)::text AS units
       FROM sales s
       WHERE ${salesFilter}
         AND s.sold_at >= (
           ((timezone('${TZ}', now()))::date - 29)::timestamp
           AT TIME ZONE '${TZ}'
         )`,
      [param],
    );

    const topProducts = await query(
      `SELECT p.id, p.name, p.internal_code,
              SUM(si.quantity)::int AS qty_sold,
              SUM(si.line_total)::numeric AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE ${salesFilter}
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
         AND s.sold_at >= (
           ((timezone('${TZ}', now()))::date - 29)::timestamp
           AT TIME ZONE '${TZ}'
         )
       GROUP BY p.id, p.name, p.internal_code
       ORDER BY qty_sold DESC
       LIMIT 20`,
      [param],
    );

    // Baja rotación = días sin movimientos de inventario en la sucursal activa (no qty vendida).
    // Alias qty_sold = days_without_movement para no romper FE tipado hasta que actualicen copy.
    const lowRotation = await query<{
      id: string;
      name: string;
      internal_code: string;
      last_movement_at: string | null;
      days_without_movement: number | null;
      qty_sold: number | null;
    }>(
      `SELECT
         p.id,
         p.name,
         p.internal_code,
         MAX(m.created_at) AS last_movement_at,
         CASE
           WHEN MAX(m.created_at) IS NULL THEN NULL
           ELSE (
             (timezone('${TZ}', now()))::date
             - (timezone('${TZ}', MAX(m.created_at)))::date
           )
         END AS days_without_movement,
         CASE
           WHEN MAX(m.created_at) IS NULL THEN NULL
           ELSE (
             (timezone('${TZ}', now()))::date
             - (timezone('${TZ}', MAX(m.created_at)))::date
           )
         END AS qty_sold
       FROM inventory_balances ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN inventory_movements m
         ON m.product_id = p.id AND m.branch_id = ib.branch_id
       WHERE ib.branch_id = $1
         AND ib.quantity > 0
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
         AND COALESCE(p.tracks_stock, true) = true
       GROUP BY p.id, p.name, p.internal_code
       ORDER BY days_without_movement DESC NULLS FIRST, p.name ASC
       LIMIT 20`,
      [branchId],
    );

    const categorySales = await query(
      `SELECT c.name,
              COALESCE(SUM(si.quantity),0)::int AS qty,
              COALESCE(SUM(si.line_total),0)::numeric AS revenue
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       LEFT JOIN sale_items si ON si.product_id = p.id
       LEFT JOIN sales s ON s.id = si.sale_id AND ${salesFilter}
         AND s.sold_at >= (
           ((timezone('${TZ}', now()))::date - 29)::timestamp
           AT TIME ZONE '${TZ}'
         )
       WHERE c.organization_id = $2
       GROUP BY c.id, c.name
       ORDER BY qty DESC`,
      [param, req.user!.organizationId],
    );

    const expensesMonth = await query<{ total: string }>(
      consolidated
        ? `SELECT COALESCE(SUM(amount),0)::text AS total FROM expenses e
           JOIN branches b ON b.id = e.branch_id
           WHERE b.organization_id = $1
             AND date_trunc('month', e.incurred_on)
               = date_trunc('month', (timezone('${TZ}', now()))::date)`
        : `SELECT COALESCE(SUM(amount),0)::text AS total FROM expenses
           WHERE branch_id = $1
             AND date_trunc('month', incurred_on)
               = date_trunc('month', (timezone('${TZ}', now()))::date)`,
      [param],
    );

    const expensesRecent = await query<{
      id: string;
      category: string;
      description: string | null;
      amount: string;
      incurred_on: string;
    }>(
      consolidated
        ? `SELECT e.id, e.category, e.description, e.amount::text, e.incurred_on::text
           FROM expenses e
           JOIN branches b ON b.id = e.branch_id
           WHERE b.organization_id = $1
             AND date_trunc('month', e.incurred_on)
               = date_trunc('month', (timezone('${TZ}', now()))::date)
           ORDER BY e.incurred_on DESC, e.created_at DESC
           LIMIT 8`
        : `SELECT id, category, description, amount::text, incurred_on::text
           FROM expenses
           WHERE branch_id = $1
             AND date_trunc('month', incurred_on)
               = date_trunc('month', (timezone('${TZ}', now()))::date)
           ORDER BY incurred_on DESC, created_at DESC
           LIMIT 8`,
      [param],
    );

    // Reinversión en mercadería = costo de líneas de compra del mes civil Chile (no es gasto operativo)
    const reinvestmentMonth = await query<{ total: string; docs: string }>(
      consolidated
        ? `SELECT COALESCE(SUM(pi.unit_cost * pi.quantity_ordered),0)::text AS total,
                  COUNT(DISTINCT p.id)::text AS docs
           FROM purchases p
           JOIN purchase_items pi ON pi.purchase_id = p.id
           WHERE p.organization_id = $1
             AND date_trunc(
                   'month',
                   COALESCE(p.purchased_at, (timezone('${TZ}', p.created_at))::date)
                 ) = date_trunc('month', (timezone('${TZ}', now()))::date)
             AND p.status <> 'cancelled'`
        : `SELECT COALESCE(SUM(pi.unit_cost * pi.quantity_ordered),0)::text AS total,
                  COUNT(DISTINCT p.id)::text AS docs
           FROM purchases p
           JOIN purchase_items pi ON pi.purchase_id = p.id
           WHERE p.destination_branch_id = $1
             AND date_trunc(
                   'month',
                   COALESCE(p.purchased_at, (timezone('${TZ}', p.created_at))::date)
                 ) = date_trunc('month', (timezone('${TZ}', now()))::date)
             AND p.status <> 'cancelled'`,
      [param],
    );

    const salesTrend = await query<{ day: string; total: string; count: string }>(
      `WITH bounds AS (
         SELECT (timezone('${TZ}', now()))::date AS today_cl
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(s.total),0)::text AS total,
              COUNT(s.id)::text AS count
       FROM bounds,
            generate_series(
              bounds.today_cl - interval '13 days',
              bounds.today_cl,
              interval '1 day'
            ) AS d(day)
       LEFT JOIN sales s
         ON ${salesFilter}
        AND (timezone('${TZ}', s.sold_at))::date = d.day::date
       GROUP BY d.day
       ORDER BY d.day`,
      [param],
    );

    const pendingReceptions = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM purchases
       WHERE organization_id = $1 AND destination_branch_id = $2
         AND status IN ('pending_reception','partially_received')`,
      [req.user!.organizationId, branchId],
    );

    const pendingPhotos = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM products p
       WHERE p.organization_id = $1
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
         AND NOT EXISTS (SELECT 1 FROM product_photos ph WHERE ph.product_id = p.id)`,
      [req.user!.organizationId],
    );

    const [lowStock, noMovement, vouchersExpiring] = await Promise.all([
      getLowStockAlerts(req.user!.organizationId, branchId),
      getNoMovementAlerts(req.user!.organizationId, branchId),
      getExpiringVouchers(req.user!.organizationId, branchId, 3),
    ]);

    res.json({
      timezone: TZ,
      salesDay: salesDay.rows[0],
      salesMonth: salesMonth.rows[0],
      salesLast30: salesLast30.rows[0],
      topProducts: topProducts.rows,
      lowRotation: lowRotation.rows,
      categorySales: categorySales.rows,
      salesTrend: salesTrend.rows,
      expensesMonth: expensesMonth.rows[0],
      expensesRecent: expensesRecent.rows,
      reinvestmentMonth: reinvestmentMonth.rows[0],
      pendingReceptions: Number(pendingReceptions.rows[0]?.count || 0),
      pendingPhotos: Number(pendingPhotos.rows[0]?.count || 0),
      alertsCount: {
        lowStock: lowStock.length,
        noMovement: noMovement.length,
        vouchersExpiring: vouchersExpiring.length,
      },
      consolidated,
    });
  }),
);

dashboardRouter.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const branchId = req.activeBranchId!;
    const [lowStock, noMovement, vouchersExpiring] = await Promise.all([
      getLowStockAlerts(req.user!.organizationId, branchId),
      getNoMovementAlerts(req.user!.organizationId, branchId),
      getExpiringVouchers(req.user!.organizationId, branchId, 3),
    ]);
    res.json({ lowStock, noMovement, vouchersExpiring, generatedAt: new Date().toISOString() });
  }),
);
