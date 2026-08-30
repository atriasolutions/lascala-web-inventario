import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { parseSalePaymentMethod, parseSalePaymentMethodFilter } from '../domain/paymentMethod.js';
import { assertUserCanUsePos, requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { createSaleWithClient, findSaleByClientSaleId } from '../services/sales.js';
import { asyncHandler, HttpError, formatDbErrorMessage, isUniqueViolation } from '../utils/errors.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';
import { orderByClause, parseSortBy, parseSortDir } from '../utils/listSort.js';

export const salesRouter = Router();
salesRouter.use(requireAuth, requireBranch);

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
});

const paymentMethodSchema = z.enum(['cash', 'card']).optional().default('cash');

salesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const receiptNumber = String(req.query.receiptNumber || '').trim();
    const seller = String(req.query.seller || '').trim();
    const pos = String(req.query.pos || '').trim();
    const notes = String(req.query.notes || '').trim();
    /** Legacy omnibox: OR entre campos. Preferir params separados (AND). */
    const q = String(req.query.q || '').trim();
    const paymentMethod = parseSalePaymentMethodFilter(req.query.paymentMethod);
    const params: unknown[] = [req.activeBranchId];
    let where = `WHERE s.branch_id = $1`;
    if (paymentMethod) {
      params.push(paymentMethod);
      where += ` AND s.payment_method = $${params.length}::sale_payment_method`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      // Fecha civil Chile (alineado con dashboard salesDay), no ::date de sesión UTC
      where += ` AND (timezone('America/Santiago', s.sold_at))::date >= $${params.length}::date`;
    }
    if (dateTo) {
      params.push(dateTo);
      where += ` AND (timezone('America/Santiago', s.sold_at))::date <= $${params.length}::date`;
    }
    if (receiptNumber) {
      params.push(`%${receiptNumber}%`);
      where += ` AND s.receipt_number ILIKE $${params.length}`;
    }
    if (seller) {
      params.push(`%${seller}%`);
      where += ` AND u.full_name ILIKE $${params.length}`;
    }
    if (pos) {
      params.push(`%${pos}%`);
      where += ` AND p.name ILIKE $${params.length}`;
    }
    if (notes) {
      params.push(`%${notes}%`);
      where += ` AND COALESCE(s.notes,'') ILIKE $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (
        s.receipt_number ILIKE $${params.length}
        OR u.full_name ILIKE $${params.length}
        OR p.name ILIKE $${params.length}
        OR COALESCE(s.notes,'') ILIKE $${params.length}
      )`;
    }

    const fromJoin = `
      FROM sales s
      JOIN users u ON u.id = s.seller_user_id
      JOIN pos_terminals p ON p.id = s.pos_id
      ${where}`;

    const summaryRes = await query<{ count: string; total_amount: string }>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(s.total), 0)::text AS total_amount
       ${fromJoin}`,
      params,
    );

    const { limit, offset } = parsePagination(req.query);
    const sortBy = parseSortBy(
      req.query.sortBy,
      ['receipt', 'date', 'seller', 'pos', 'total'] as const,
      'date',
    );
    const sortDir = parseSortDir(
      req.query.sortDir,
      sortBy === 'date' || sortBy === 'total' ? 'desc' : 'asc',
    );
    const salesOrder =
      sortBy === 'receipt'
        ? orderByClause('s.receipt_number', sortDir, 's.sold_at DESC')
        : sortBy === 'seller'
          ? orderByClause('u.full_name', sortDir, 's.sold_at DESC')
          : sortBy === 'pos'
            ? orderByClause('p.name', sortDir, 's.sold_at DESC')
            : sortBy === 'total'
              ? orderByClause('s.total', sortDir, 's.receipt_number ASC')
              : orderByClause('s.sold_at', sortDir, 's.receipt_number ASC');
    const listParams = [...params, fetchLimit(limit), offset];
    const result = await query(
      `SELECT s.*, u.full_name AS seller_name, p.name AS pos_name
       ${fromJoin}
       ORDER BY ${salesOrder}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );
    const page = slicePage(result.rows, limit, offset);
    const s = summaryRes.rows[0];
    res.json({
      sales: page.items,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
      summary: {
        count: Number(s?.count || 0),
        totalAmount: Number(s?.total_amount || 0),
      },
    });
  }),
);

/**
 * Snapshot liviano para cache FE de Caja (IndexedDB).
 * Scoped a X-Branch-Id. Query opcional: ?updatedSince=ISO8601
 */
salesRouter.get(
  '/pos-snapshot',
  asyncHandler(async (req, res) => {
    const branchId = req.activeBranchId!;
    const organizationId = req.user!.organizationId;
    const updatedSinceRaw = String(req.query.updatedSince || '').trim();
    let updatedSince: string | null = null;
    if (updatedSinceRaw) {
      const d = new Date(updatedSinceRaw);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'updatedSince inválido');
      updatedSince = d.toISOString();
    }

    const params: unknown[] = [organizationId, branchId];
    let sinceClause = '';
    if (updatedSince) {
      params.push(updatedSince);
      sinceClause = ` AND (
        p.updated_at > $${params.length}::timestamptz
        OR COALESCE(ib.updated_at, p.updated_at) > $${params.length}::timestamptz
      )`;
    }

    const result = await query(
      `SELECT
         p.id,
         p.name,
         p.internal_code,
         p.barcode,
         p.sale_price,
         p.brand,
         p.size_label,
         p.color,
         p.allows_exchange,
         p.allows_return,
         p.tracks_stock,
         p.status,
         p.updated_at,
         COALESCE(ib.quantity, 0)::int AS stock,
         (SELECT url FROM product_photos ph
          WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url
       FROM products p
       LEFT JOIN inventory_balances ib
         ON ib.product_id = p.id AND ib.branch_id = $2
       WHERE p.organization_id = $1
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
         AND p.name !~* '(^|[[:space:]])qa([[:space:]]|$)|partial|created'
         AND lower(trim(p.name)) <> 'shape'
         ${sinceClause}
       ORDER BY p.name ASC
       LIMIT 5000`,
      params,
    );

    const generatedAt = new Date().toISOString();
    const maxUpdated = result.rows.reduce((acc: string | null, row: { updated_at?: string }) => {
      const u = row.updated_at ? String(row.updated_at) : null;
      if (!u) return acc;
      if (!acc || u > acc) return u;
      return acc;
    }, null as string | null);

    if (maxUpdated) {
      res.setHeader('ETag', `"pos-${branchId}-${maxUpdated}"`);
    }
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    res.json({
      branchId,
      organizationId,
      generatedAt,
      updatedSince: updatedSince,
      count: result.rows.length,
      products: result.rows,
    });
  }),
);

/**
 * Sync batch de ventas offline (cola FE).
 * allowNegative=true SOLO aquí. Online POST /api/sales sigue bloqueando sobrestock.
 * Idempotencia: clientSaleId UNIQUE por organización.
 *
 * Auth: Bearer + X-Branch-Id. Vendedora = JWT user. POS debe pertenecer a la branch.
 */
salesRouter.post(
  '/offline-sync',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        sales: z
          .array(
            z.object({
              clientSaleId: z.string().uuid(),
              posId: z.string().uuid(),
              soldAt: z.string().min(1).optional(),
              notes: z.string().optional().nullable(),
              discount: z.number().nonnegative().optional(),
              paymentMethod: paymentMethodSchema,
              items: z.array(saleItemSchema).min(1),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(req.body);

    const branchId = req.activeBranchId!;
    const organizationId = req.user!.organizationId;
    const sellerUserId = req.user!.id;
    const results: {
      clientSaleId: string;
      status: 'created' | 'duplicate' | 'error';
      saleId?: string;
      receiptNumber?: string;
      error?: string;
    }[] = [];

    for (const entry of body.sales) {
      try {
        await assertUserCanUsePos(req.user!, entry.posId, branchId);
      } catch (e) {
        results.push({
          clientSaleId: entry.clientSaleId,
          status: 'error',
          error: e instanceof HttpError ? e.message : 'POS inválido',
        });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const existing = await findSaleByClientSaleId(client, organizationId, entry.clientSaleId);
        if (existing) {
          await client.query('COMMIT');
          results.push({
            clientSaleId: entry.clientSaleId,
            status: 'duplicate',
            saleId: existing.id,
            receiptNumber: existing.receipt_number,
          });
          continue;
        }

        const noteParts = [
          entry.notes?.trim() || null,
          `[offline_sync client_sale_id=${entry.clientSaleId}]`,
        ].filter(Boolean);
        const { sale } = await createSaleWithClient(client, {
          organizationId,
          branchId,
          posId: entry.posId,
          sellerUserId,
          notes: noteParts.join(' '),
          discount: entry.discount,
          paymentMethod: parseSalePaymentMethod(entry.paymentMethod),
          items: entry.items,
          allowNegative: true,
          clientSaleId: entry.clientSaleId,
          soldAt: entry.soldAt ?? null,
          offlineSyncedAt: new Date().toISOString(),
          movementNotes: `offline_sync client_sale_id=${entry.clientSaleId}`,
        });

        await client.query('COMMIT');
        results.push({
          clientSaleId: entry.clientSaleId,
          status: 'created',
          saleId: String(sale.id),
          receiptNumber: String(sale.receipt_number),
        });
      } catch (e) {
        await client.query('ROLLBACK');
        if (isUniqueViolation(e)) {
          const again = await query(
            `SELECT id, receipt_number FROM sales
             WHERE organization_id = $1 AND client_sale_id = $2 LIMIT 1`,
            [organizationId, entry.clientSaleId],
          );
          if (again.rows[0]) {
            results.push({
              clientSaleId: entry.clientSaleId,
              status: 'duplicate',
              saleId: again.rows[0].id,
              receiptNumber: again.rows[0].receipt_number,
            });
            continue;
          }
        }
        results.push({
          clientSaleId: entry.clientSaleId,
          status: 'error',
          error: formatDbErrorMessage(e, 'Error al sincronizar venta'),
        });
      } finally {
        client.release();
      }
    }

    const summary = {
      created: results.filter((r) => r.status === 'created').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      error: results.filter((r) => r.status === 'error').length,
    };
    res.status(200).json({
      branchId,
      sellerUserId,
      results,
      summary,
    });
  }),
);

salesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sale = await query(
      `SELECT s.*,
              u.full_name AS seller_name,
              p.name AS pos_name,
              b.name AS branch_name
       FROM sales s
       JOIN users u ON u.id = s.seller_user_id
       JOIN pos_terminals p ON p.id = s.pos_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1 AND s.branch_id = $2`,
      [req.params.id, req.activeBranchId],
    );
    if (!sale.rows[0]) throw new HttpError(404, 'Venta no encontrada');

    const items = await query(
      `SELECT si.*,
              p.name,
              p.internal_code,
              p.barcode,
              p.brand,
              p.size_label,
              p.color,
              p.allows_exchange,
              p.allows_return
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1
       ORDER BY si.created_at ASC`,
      [req.params.id],
    );

    const vouchers = await query(
      `SELECT v.*,
              p.name AS product_name,
              p.internal_code,
              p.barcode,
              p.size_label,
              p.color
       FROM change_vouchers v
       JOIN products p ON p.id = v.product_id
       WHERE v.sale_id = $1 AND v.branch_id = $2
       ORDER BY v.created_at ASC`,
      [req.params.id, req.activeBranchId],
    );

    res.json({ sale: sale.rows[0], items: items.rows, vouchers: vouchers.rows });
  }),
);

salesRouter.post(
  '/',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        posId: z.string().uuid(),
        notes: z.string().optional().nullable(),
        discount: z.number().nonnegative().optional(),
        paymentMethod: paymentMethodSchema,
        items: z.array(saleItemSchema).min(1),
      })
      .parse(req.body);

    await assertUserCanUsePos(req.user!, body.posId, req.activeBranchId!);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Online: allowNegative NO se pasa → stock insuficiente sigue en 400
      const { sale, vouchers } = await createSaleWithClient(client, {
        organizationId: req.user!.organizationId,
        branchId: req.activeBranchId!,
        posId: body.posId,
        sellerUserId: req.user!.id,
        notes: body.notes ?? null,
        discount: body.discount,
        paymentMethod: parseSalePaymentMethod(body.paymentMethod),
        items: body.items,
        allowNegative: false,
      });
      await client.query('COMMIT');
      res.status(201).json({ sale, vouchers });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);
