import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import {
  applyStockDeltaWithClient,
  assertBarcodeAvailable,
  canonicalizeStoredProductCode,
  getSettingNumber,
  nextInternalCodeWithClient,
} from '../services/inventory.js';
import {
  assertCanCreateProductInIngresosNoBarcode,
  assertCanRegisterProductCode,
} from '../auth/roles.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';
import { orderByClause, parseSortBy, parseSortDir } from '../utils/listSort.js';

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth, requireBranch);

const createProductSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  barcode: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  sizeLabel: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  productType: z.string().optional().nullable(),
  season: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  /** Precio costo; por defecto usa unit_cost de la línea */
  costPrice: z.number().nonnegative().optional(),
  /** Sugerido ~2× costo si se omite */
  salePrice: z.number().nonnegative().optional(),
  notes: z.string().optional().nullable(),
  photoUrl: z.string().min(1).optional().nullable(),
  /** Alta desde Ingresos → «Sin código de barras» (permite vendedora). */
  viaNoBarcode: z.literal(true).optional(),
});

const documentTypeSchema = z.enum(['factura', 'boleta', 'guia', 'otro']);
const listPurchasesQuerySchema = z.object({
  /** Uno o varios: `pending_reception`, `partially_received,received`, o `all`. */
  status: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom debe ser YYYY-MM-DD')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo debe ser YYYY-MM-DD')
    .optional(),
  q: z.string().optional(),
});

async function syncProductCostFromPurchaseItem(
  client: PoolClient,
  productId: string,
  organizationId: string,
  unitCost: number,
) {
  const res = await client.query(
    `UPDATE products
     SET cost_price = $1, updated_at = now()
     WHERE id = $2 AND organization_id = $3
     RETURNING id`,
    [unitCost, productId, organizationId],
  );
  if (!res.rows[0]) throw new HttpError(400, 'Producto inválido para la organización');
}

async function createProductFromPurchaseItem(
  client: PoolClient,
  params: {
    organizationId: string;
    userId: string;
    description: string;
    unitCost: number;
    suggestedSalePrice: number | null;
    priceMultiplier: number;
    linePhotoUrl?: string | null;
    create: z.infer<typeof createProductSchema>;
    viaNoBarcode?: boolean;
  },
) {
  const costPrice = params.create.costPrice ?? params.unitCost;
  const salePrice =
    params.create.salePrice ??
    params.suggestedSalePrice ??
    (params.viaNoBarcode
      ? 0
      : Number((costPrice * params.priceMultiplier).toFixed(2)));
  const requestedCode = canonicalizeStoredProductCode(params.create.barcode);
  if (params.create.barcode?.trim() && !requestedCode) {
    throw new HttpError(400, 'Ingresa un código válido o deja vacío para autogenerar');
  }
  if (requestedCode) {
    await assertBarcodeAvailable(params.organizationId, requestedCode, { client });
  }
  const internalCode =
    requestedCode ?? (await nextInternalCodeWithClient(client, params.organizationId));
  const name = params.create.name ?? params.description;

  const result = await client.query(
    `INSERT INTO products (
       organization_id, category_id, internal_code, barcode, name, description, brand, size_label, color,
       product_type, season, cost_price, sale_price, status, allows_exchange, allows_return,
       notes, created_by
     ) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',true,true,$13,$14)
     RETURNING *`,
    [
      params.organizationId,
      params.create.categoryId ?? null,
      internalCode,
      name,
      params.create.description ?? null,
      params.create.brand ?? null,
      params.create.sizeLabel ?? null,
      params.create.color ?? null,
      params.create.productType ?? null,
      params.create.season ?? null,
      costPrice,
      salePrice,
      params.create.notes ?? null,
      params.userId,
    ],
  );
  const product = result.rows[0] as { id: string };
  const photoUrl = params.create.photoUrl?.trim() || params.linePhotoUrl?.trim() || null;
  if (photoUrl) {
    await client.query(`INSERT INTO product_photos (product_id, url) VALUES ($1,$2)`, [
      product.id,
      photoUrl,
    ]);
  }
  return product;
}

purchasesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = listPurchasesQuerySchema.parse({
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      q: req.query.q,
    });

    const params: unknown[] = [req.user!.organizationId, req.activeBranchId];
    let sql = `
      SELECT p.*, s.name AS supplier_name,
        COALESCE(agg.items_count, 0)::int AS items_count,
        COALESCE(agg.qty_ordered, 0)::int AS qty_ordered,
        COALESCE(agg.qty_received, 0)::int AS qty_received
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS items_count,
                COALESCE(SUM(pi.quantity_ordered), 0)::int AS qty_ordered,
                COALESCE(SUM(pi.quantity_received), 0)::int AS qty_received
           FROM purchase_items pi
          WHERE pi.purchase_id = p.id
       ) agg ON true
       WHERE p.organization_id = $1 AND p.destination_branch_id = $2`;

    if (filters.status && filters.status !== 'all') {
      const allowed = new Set([
        'pending_reception',
        'partially_received',
        'received',
        'cancelled',
      ]);
      const statuses = filters.status
        .split(',')
        .map((s) => s.trim())
        .filter((s) => allowed.has(s));
      if (statuses.length === 1) {
        params.push(statuses[0]);
        sql += ` AND p.status = $${params.length}::purchase_status`;
      } else if (statuses.length > 1) {
        params.push(statuses);
        sql += ` AND p.status = ANY($${params.length}::purchase_status[])`;
      }
    }
    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      sql += ` AND COALESCE(p.purchased_at, p.created_at::date) >= $${params.length}::date`;
    }
    if (filters.dateTo) {
      params.push(filters.dateTo);
      sql += ` AND COALESCE(p.purchased_at, p.created_at::date) <= $${params.length}::date`;
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim()}%`);
      sql += ` AND EXISTS (
        SELECT 1
        FROM purchase_items pi
        LEFT JOIN products pr ON pr.id = pi.product_id
        WHERE pi.purchase_id = p.id
          AND (
            pi.description ILIKE $${params.length}
            OR COALESCE(pr.name, '') ILIKE $${params.length}
          )
      )`;
    }

    const { limit, offset } = parsePagination(req.query);
    const sortBy = parseSortBy(
      req.query.sortBy,
      ['ref', 'supplier', 'progress', 'date', 'status'] as const,
      'date',
    );
    const sortDir = parseSortDir(
      req.query.sortDir,
      sortBy === 'date' || sortBy === 'progress' ? 'desc' : 'asc',
    );
    const purchaseRefExpr = `CASE
         WHEN NULLIF(TRIM(p.invoice_number), '') IS NULL THEN 'Sin documento'
         WHEN LOWER(COALESCE(p.document_type, '')) = 'factura' THEN 'Factura ' || TRIM(p.invoice_number)
         WHEN LOWER(COALESCE(p.document_type, '')) = 'boleta' THEN 'Boleta ' || TRIM(p.invoice_number)
         WHEN LOWER(COALESCE(p.document_type, '')) = 'guia' THEN 'Guía ' || TRIM(p.invoice_number)
         WHEN LOWER(COALESCE(p.document_type, '')) = 'otro' THEN 'Doc. ' || TRIM(p.invoice_number)
         ELSE TRIM(p.invoice_number)
       END`;
    const purchaseProgressExpr = `CASE
         WHEN COALESCE(agg.qty_ordered, 0) <= 0 THEN -1::float8
         ELSE COALESCE(agg.qty_received, 0)::float8 / agg.qty_ordered::float8
       END`;
    const purchaseStatusExpr = `CASE p.status
         WHEN 'pending_reception' THEN 0
         WHEN 'partially_received' THEN 1
         WHEN 'received' THEN 2
         WHEN 'cancelled' THEN 3
         ELSE 99
       END`;
    const purchasesOrder =
      sortBy === 'ref'
        ? orderByClause(purchaseRefExpr, sortDir, 'p.created_at DESC')
        : sortBy === 'supplier'
          ? orderByClause('COALESCE(s.name, \'\')', sortDir, 'p.created_at DESC')
          : sortBy === 'progress'
            ? orderByClause(purchaseProgressExpr, sortDir, 'p.created_at DESC')
            : sortBy === 'status'
              ? orderByClause(purchaseStatusExpr, sortDir, 'p.created_at DESC')
              : orderByClause('COALESCE(p.purchased_at, p.created_at::date)', sortDir, 'p.created_at DESC');
    params.push(fetchLimit(limit), offset);
    sql += ` ORDER BY ${purchasesOrder} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query(sql, params);
    const page = slicePage(result.rows, limit, offset);
    res.json({
      purchases: page.items,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
    });
  }),
);

purchasesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const purchase = await query(
      `SELECT * FROM purchases WHERE id = $1 AND organization_id = $2 AND destination_branch_id = $3`,
      [req.params.id, req.user!.organizationId, req.activeBranchId],
    );
    if (!purchase.rows[0]) throw new HttpError(404, 'Compra no encontrada');
    const items = await query(
       `SELECT pi.*,
         pr.name AS product_name,
         pr.size_label,
         pr.color,
         pr.sale_price,
         COALESCE(
           (SELECT url FROM product_photos ph
            WHERE ph.product_id = pr.id
            ORDER BY sort_order
            LIMIT 1),
           pi.photo_url
         ) AS photo_url
       FROM purchase_items pi
       LEFT JOIN products pr ON pr.id = pi.product_id
       WHERE pi.purchase_id = $1
       ORDER BY pi.created_at ASC`,
      [req.params.id],
    );
    res.json({ purchase: purchase.rows[0], items: items.rows });
  }),
);

/**
 * Crear compra / documento (factura, boleta, guía u otro).
 * Siempre requiere documento (factura, boleta, guía u otro) + número.
 */
purchasesRouter.post(
  '/',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        supplierId: z.string().uuid().optional().nullable(),
        documentType: documentTypeSchema.default('factura'),
        invoiceNumber: z.string().min(1, 'El número de documento es obligatorio'),
        purchasedAt: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        destinationBranchId: z.string().uuid().optional(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid().optional().nullable(),
              description: z.string().min(1),
              quantityOrdered: z.number().int().positive(),
              unitCost: z.number().positive(),
              suggestedSalePrice: z.number().positive().optional(),
              photoUrl: z.string().min(1).optional().nullable(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    const destinationBranchId = body.destinationBranchId || req.activeBranchId!;
    const branchOk = await query<{ id: string }>(
      `SELECT id FROM branches WHERE id = $1 AND organization_id = $2`,
      [destinationBranchId, req.user!.organizationId],
    );
    if (!branchOk.rows[0]) throw new HttpError(404, 'Sucursal destino no encontrada');
    const access = req.user!.branches.find((b) => b.branchId === destinationBranchId);
    const isOwner = req.user!.branches.some((b) => b.role === 'owner');
    if (!access && !isOwner) {
      throw new HttpError(403, 'Sin permiso para registrar compras hacia esa sucursal');
    }

    const multiplier = await getSettingNumber(req.user!.organizationId, 'price_multiplier', 2);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const purchaseRes = await client.query(
        `INSERT INTO purchases
          (organization_id, destination_branch_id, supplier_id, invoice_number, document_type,
           purchased_at, notes, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_reception') RETURNING *`,
        [
          req.user!.organizationId,
          destinationBranchId,
          body.supplierId ?? null,
          body.invoiceNumber.trim(),
          body.documentType,
          body.purchasedAt ?? null,
          body.notes ?? null,
          req.user!.id,
        ],
      );
      const purchase = purchaseRes.rows[0];
      for (const item of body.items) {
        await client.query(
          `INSERT INTO purchase_items
            (purchase_id, product_id, description, quantity_ordered, unit_cost, suggested_sale_price, photo_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            purchase.id,
            item.productId ?? null,
            item.description,
            item.quantityOrdered,
            item.unitCost,
            item.suggestedSalePrice ?? Number((item.unitCost * multiplier).toFixed(2)),
            item.photoUrl?.trim() || null,
          ],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ purchase });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

/**
 * Editar documento + líneas de una compra pendiente de recepción.
 * Reemplaza todas las líneas; no aplica si ya hay recepción parcial/total.
 */
purchasesRouter.patch(
  '/:id',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        supplierId: z.string().uuid().optional().nullable(),
        documentType: documentTypeSchema,
        invoiceNumber: z.string().min(1, 'El número de documento es obligatorio'),
        purchasedAt: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        items: z
          .array(
            z.object({
              description: z.string().min(1),
              quantityOrdered: z.number().int().positive(),
              unitCost: z.number().positive(),
              suggestedSalePrice: z.number().positive().optional(),
              photoUrl: z.string().min(1).optional().nullable(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    const multiplier = await getSettingNumber(req.user!.organizationId, 'price_multiplier', 2);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const purchaseRes = await client.query(
        `SELECT * FROM purchases WHERE id = $1 AND organization_id = $2 AND destination_branch_id = $3 FOR UPDATE`,
        [req.params.id, req.user!.organizationId, req.activeBranchId],
      );
      const purchase = purchaseRes.rows[0];
      if (!purchase) throw new HttpError(404, 'Compra no encontrada');
      if (purchase.status !== 'pending_reception') {
        throw new HttpError(409, 'Solo se puede editar una compra pendiente de recepción');
      }

      const updatedRes = await client.query(
        `UPDATE purchases
         SET supplier_id = $1,
             invoice_number = $2,
             document_type = $3,
             purchased_at = $4,
             notes = $5,
             updated_at = now()
         WHERE id = $6
         RETURNING *`,
        [
          body.supplierId ?? null,
          body.invoiceNumber.trim(),
          body.documentType,
          body.purchasedAt ?? null,
          body.notes ?? null,
          purchase.id,
        ],
      );

      await client.query(`DELETE FROM purchase_items WHERE purchase_id = $1`, [purchase.id]);

      for (const item of body.items) {
        await client.query(
          `INSERT INTO purchase_items
            (purchase_id, product_id, description, quantity_ordered, unit_cost, suggested_sale_price, photo_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            purchase.id,
            null,
            item.description,
            item.quantityOrdered,
            item.unitCost,
            item.suggestedSalePrice ?? Number((item.unitCost * multiplier).toFixed(2)),
            item.photoUrl?.trim() || null,
          ],
        );
      }

      await client.query('COMMIT');
      res.json({ purchase: updatedRes.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

/**
 * Vincular (o desvincular) productId a una línea de compra.
 * Al vincular: products.cost_price = purchase_items.unit_cost (precio costo).
 */
purchasesRouter.patch(
  '/:id/items/:itemId',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        productId: z.string().uuid().nullable(),
      })
      .parse(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const purchaseRes = await client.query(
        `SELECT * FROM purchases WHERE id = $1 AND organization_id = $2 AND destination_branch_id = $3 FOR UPDATE`,
        [req.params.id, req.user!.organizationId, req.activeBranchId],
      );
      const purchase = purchaseRes.rows[0];
      if (!purchase) throw new HttpError(404, 'Compra no encontrada');
      if (purchase.status === 'cancelled') throw new HttpError(400, 'Compra cancelada');

      const piRes = await client.query(
        `SELECT * FROM purchase_items WHERE id = $1 AND purchase_id = $2 FOR UPDATE`,
        [req.params.itemId, purchase.id],
      );
      const pi = piRes.rows[0];
      if (!pi) throw new HttpError(404, 'Ítem de compra no encontrado');

      if (body.productId) {
        await syncProductCostFromPurchaseItem(
          client,
          body.productId,
          req.user!.organizationId,
          Number(pi.unit_cost),
        );
      }

      const updated = await client.query(
        `UPDATE purchase_items SET product_id = $1 WHERE id = $2 RETURNING *`,
        [body.productId, pi.id],
      );
      await client.query('COMMIT');
      res.json({ item: updated.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

/**
 * Recepcionar líneas.
 * Por ítem: productId existente, o createProduct (alta desde ingreso), o línea ya vinculada.
 * Al recepcionar/vincular: products.cost_price = unit_cost.
 */
purchasesRouter.post(
  '/:id/receive',
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        items: z.array(
          z.object({
            purchaseItemId: z.string().uuid(),
            quantityReceived: z.number().int().nonnegative(),
            productId: z.string().uuid().optional().nullable(),
            createProduct: createProductSchema.optional(),
          }),
        ),
      })
      .parse(req.body);

    const multiplier = await getSettingNumber(req.user!.organizationId, 'price_multiplier', 2);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const purchaseRes = await client.query(
        `SELECT * FROM purchases WHERE id = $1 AND organization_id = $2 AND destination_branch_id = $3 FOR UPDATE`,
        [req.params.id, req.user!.organizationId, req.activeBranchId],
      );
      const purchase = purchaseRes.rows[0];
      if (!purchase) throw new HttpError(404, 'Compra no encontrada');
      if (purchase.status === 'cancelled' || purchase.status === 'received') {
        throw new HttpError(400, 'Compra no receptible');
      }

      const createdProducts: { purchaseItemId: string; productId: string }[] = [];

      for (const item of body.items) {
        if (item.productId && item.createProduct) {
          throw new HttpError(400, 'Usa productId o createProduct, no ambos');
        }

        const piRes = await client.query(
          `SELECT * FROM purchase_items WHERE id = $1 AND purchase_id = $2 FOR UPDATE`,
          [item.purchaseItemId, purchase.id],
        );
        const pi = piRes.rows[0];
        if (!pi) throw new HttpError(400, 'Ítem de compra inválido');
        const newReceived = item.quantityReceived;
        if (newReceived < pi.quantity_received || newReceived > pi.quantity_ordered) {
          throw new HttpError(400, 'Cantidad recibida inválida');
        }
        const delta = newReceived - pi.quantity_received;

        let productId: string | null = item.productId || pi.product_id || null;

        if (item.createProduct) {
          const viaNoBarcode = item.createProduct.viaNoBarcode === true;
          if (viaNoBarcode) {
            assertCanCreateProductInIngresosNoBarcode(req.activeRole);
            if (req.activeRole === 'seller' && item.createProduct.salePrice != null) {
              throw new HttpError(403, 'No puedes definir el precio de venta al crear la prenda');
            }
          } else {
            assertCanRegisterProductCode(req.activeRole);
          }
          if (pi.product_id) {
            throw new HttpError(400, 'La línea ya tiene producto vinculado');
          }
          const { viaNoBarcode: _via, ...createPayload } = item.createProduct;
          const created = await createProductFromPurchaseItem(client, {
            organizationId: req.user!.organizationId,
            userId: req.user!.id,
            description: pi.description,
            unitCost: Number(pi.unit_cost),
            suggestedSalePrice: pi.suggested_sale_price != null ? Number(pi.suggested_sale_price) : null,
            priceMultiplier: multiplier,
            linePhotoUrl: pi.photo_url ?? null,
            create: createPayload,
            viaNoBarcode,
          });
          productId = created.id;
          createdProducts.push({ purchaseItemId: pi.id, productId: created.id });
        }

        if (delta > 0 && !productId) {
          throw new HttpError(400, 'productId o createProduct requerido para recepcionar');
        }

        if (productId) {
          // Precio costo: cost_price del producto = unit_cost de la línea
          await syncProductCostFromPurchaseItem(
            client,
            productId,
            req.user!.organizationId,
            Number(pi.unit_cost),
          );
          if (!pi.product_id || pi.product_id !== productId) {
            await client.query(`UPDATE purchase_items SET product_id = $1 WHERE id = $2`, [
              productId,
              pi.id,
            ]);
          }
        }

        await client.query(`UPDATE purchase_items SET quantity_received = $1 WHERE id = $2`, [
          newReceived,
          pi.id,
        ]);

        if (delta > 0 && productId) {
          await applyStockDeltaWithClient(client, {
            organizationId: req.user!.organizationId,
            branchId: req.activeBranchId!,
            productId,
            delta,
            movementType: 'PURCHASE_IN',
            referenceType: 'purchase',
            referenceId: purchase.id,
            userId: req.user!.id,
            notes: `Recepción compra ${purchase.invoice_number || 'sin documento'} (${purchase.id})`,
          });
          await client.query(`UPDATE products SET status = 'available', updated_at = now() WHERE id = $1`, [
            productId,
          ]);
        }
      }

      const totals = await client.query<{ ordered: string; received: string }>(
        `SELECT COALESCE(SUM(quantity_ordered),0)::text AS ordered,
                COALESCE(SUM(quantity_received),0)::text AS received
         FROM purchase_items WHERE purchase_id = $1`,
        [purchase.id],
      );
      const ordered = Number(totals.rows[0].ordered);
      const received = Number(totals.rows[0].received);
      const status = received <= 0 ? 'pending_reception' : received < ordered ? 'partially_received' : 'received';
      await client.query(
        `UPDATE purchases SET status = $1::purchase_status, received_by = $2, received_at = CASE WHEN $1 = 'received' THEN now() ELSE received_at END, updated_at = now()
         WHERE id = $3`,
        [status, req.user!.id, purchase.id],
      );
      await client.query('COMMIT');
      res.json({ ok: true, status, createdProducts });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);
