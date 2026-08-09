import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch } from '../middleware/auth.js';
import { getExpiringVouchers, getLowStockAlerts, getNoMovementAlerts } from '../services/inventory.js';
import { asyncHandler } from '../utils/errors.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireBranch);

dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const branchId = req.activeBranchId!;
    const consolidated = req.query.consolidated === '1' && req.activeRole === 'owner';

    const salesFilter = consolidated
      ? 's.organization_id = $1'
      : 's.branch_id = $1';
    const param = consolidated ? req.user!.organizationId : branchId;

    const salesDay = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*)::text AS count
       FROM sales s WHERE ${salesFilter} AND s.sold_at::date = CURRENT_DATE`,
      [param],
    );
    const salesMonth = await query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(total),0)::text AS total, COUNT(*)::text AS count
       FROM sales s WHERE ${salesFilter}
         AND date_trunc('month', s.sold_at) = date_trunc('month', now())`,
      [param],
    );

    const topProducts = await query(
      `SELECT p.id, p.name, p.internal_code, SUM(si.quantity)::int AS qty_sold, SUM(si.line_total)::numeric AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE ${salesFilter}
         AND s.sold_at >= now() - interval '30 days'
       GROUP BY p.id, p.name, p.internal_code
       ORDER BY qty_sold DESC
       LIMIT 5`,
      [param],
    );

    const lowRotation = await query(
      `SELECT p.id, p.name, p.internal_code, COALESCE(SUM(si.quantity),0)::int AS qty_sold
       FROM products p
       LEFT JOIN sale_items si ON si.product_id = p.id
       LEFT JOIN sales s ON s.id = si.sale_id AND ${consolidated ? 's.organization_id = $1' : 's.branch_id = $1'}
         AND s.sold_at >= now() - interval '30 days'
       WHERE p.organization_id = $2
       GROUP BY p.id
       ORDER BY qty_sold ASC, p.created_at ASC
       LIMIT 5`,
      [param, req.user!.organizationId],
    );

    const categorySales = await query(
      `SELECT c.name, COALESCE(SUM(si.quantity),0)::int AS qty, COALESCE(SUM(si.line_total),0)::numeric AS revenue
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       LEFT JOIN sale_items si ON si.product_id = p.id
       LEFT JOIN sales s ON s.id = si.sale_id AND ${salesFilter.replaceAll('s.', 's.')}
         AND s.sold_at >= now() - interval '30 days'
       WHERE c.organization_id = $2
       GROUP BY c.id, c.name
       ORDER BY qty DESC`,
      [param, req.user!.organizationId],
    );

    const expensesMonth = await query<{ total: string }>(
      consolidated
        ? `SELECT COALESCE(SUM(amount),0)::text AS total FROM expenses e
           JOIN branches b ON b.id = e.branch_id
           WHERE b.organization_id = $1 AND date_trunc('month', e.incurred_on) = date_trunc('month', CURRENT_DATE)`
        : `SELECT COALESCE(SUM(amount),0)::text AS total FROM expenses
           WHERE branch_id = $1 AND date_trunc('month', incurred_on) = date_trunc('month', CURRENT_DATE)`,
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
             AND date_trunc('month', e.incurred_on) = date_trunc('month', CURRENT_DATE)
           ORDER BY e.incurred_on DESC, e.created_at DESC
           LIMIT 8`
        : `SELECT id, category, description, amount::text, incurred_on::text
           FROM expenses
           WHERE branch_id = $1
             AND date_trunc('month', incurred_on) = date_trunc('month', CURRENT_DATE)
           ORDER BY incurred_on DESC, created_at DESC
           LIMIT 8`,
      [param],
    );

    // Reinversión en mercadería = costo de líneas de compra del mes (no es gasto operativo)
    const reinvestmentMonth = await query<{ total: string; docs: string }>(
      consolidated
        ? `SELECT COALESCE(SUM(pi.unit_cost * pi.quantity_ordered),0)::text AS total,
                  COUNT(DISTINCT p.id)::text AS docs
           FROM purchases p
           JOIN purchase_items pi ON pi.purchase_id = p.id
           WHERE p.organization_id = $1
             AND date_trunc('month', COALESCE(p.purchased_at, p.created_at::date))
                 = date_trunc('month', CURRENT_DATE)
             AND p.status <> 'cancelled'`
        : `SELECT COALESCE(SUM(pi.unit_cost * pi.quantity_ordered),0)::text AS total,
                  COUNT(DISTINCT p.id)::text AS docs
           FROM purchases p
           JOIN purchase_items pi ON pi.purchase_id = p.id
           WHERE p.destination_branch_id = $1
             AND date_trunc('month', COALESCE(p.purchased_at, p.created_at::date))
                 = date_trunc('month', CURRENT_DATE)
             AND p.status <> 'cancelled'`,
      [param],
    );

    const salesTrend = await query<{ day: string; total: string; count: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(s.total),0)::text AS total,
              COUNT(s.id)::text AS count
       FROM generate_series(CURRENT_DATE - interval '13 days', CURRENT_DATE, interval '1 day') AS d(day)
       LEFT JOIN sales s ON ${salesFilter} AND s.sold_at::date = d.day
       GROUP BY d.day
       ORDER BY d.day`,
      [param],
    );

    const salesLast30 = await query<{ total: string; count: string; units: string }>(
      `SELECT COALESCE(SUM(s.total),0)::text AS total, COUNT(s.id)::text AS count,
              COALESCE((SELECT SUM(si.quantity) FROM sale_items si WHERE si.sale_id IN (
                SELECT id FROM sales s2 WHERE ${salesFilter.replaceAll('s.', 's2.')} AND s2.sold_at >= now() - interval '30 days'
              )),0)::text AS units
       FROM sales s WHERE ${salesFilter} AND s.sold_at >= now() - interval '30 days'`,
      [param],
    );

    const pendingReceptions = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM purchases
       WHERE organization_id = $1 AND destination_branch_id = $2 AND status IN ('pending_reception','partially_received')`,
      [req.user!.organizationId, branchId],
    );

    const pendingPhotos = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM products p
       WHERE p.organization_id = $1 AND NOT EXISTS (SELECT 1 FROM product_photos ph WHERE ph.product_id = p.id)`,
      [req.user!.organizationId],
    );

    const [lowStock, noMovement, vouchersExpiring] = await Promise.all([
      getLowStockAlerts(req.user!.organizationId, branchId),
      getNoMovementAlerts(req.user!.organizationId, branchId),
      getExpiringVouchers(req.user!.organizationId, branchId, 3),
    ]);

    res.json({
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
