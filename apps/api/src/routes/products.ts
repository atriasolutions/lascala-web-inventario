import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import {
  assertBarcodeAvailable,
  canonicalizeStoredProductCode,
  expandProductCodeVariants,
  getSettingNumber,
  isBarcodeAvailable,
  nextInternalCode,
  normalizeBarcode,
} from '../services/inventory.js';
import { assertCanEditSalePrice, assertCanRegisterProductCode } from '../auth/roles.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

/** http(s), archivos subidos o assets estáticos de marca en public/brand */
const photoUrlSchema = z
  .string()
  .min(1)
  .refine(
    (v) =>
      /^https?:\/\//i.test(v) || v.startsWith('/uploads/') || v.startsWith('/brand/'),
    { message: 'URL de foto inválida (http(s), /uploads/ o /brand/)' },
  )
  .optional()
  .nullable();

const boolQuery = (v: unknown) => {
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return null;
};

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pendingPhoto = req.query.pendingPhoto === '1';
    const lowStock = req.query.lowStock === '1';
    const allowsReturn = boolQuery(req.query.allowsReturn);
    const allowsExchange = boolQuery(req.query.allowsExchange);
    const tracksStock = boolQuery(req.query.tracksStock);
    const q = String(req.query.q || '').trim();
    const categoryIdRaw = req.query.categoryId ? String(req.query.categoryId) : null;
    if (categoryIdRaw) {
      const parsed = z.string().uuid().safeParse(categoryIdRaw);
      if (!parsed.success) throw new HttpError(400, 'categoryId inválido');
    }
    const categoryId = categoryIdRaw;

    if (lowStock && !req.activeBranchId) {
      throw new HttpError(400, 'Selecciona una sucursal (X-Branch-Id) para filtrar stock bajo');
    }

    const branchId = req.activeBranchId ?? null;
    const includeStock = Boolean(branchId);
    const lowDefault = includeStock
      ? await getSettingNumber(req.user!.organizationId, 'low_stock_threshold', 1)
      : null;

    const params: unknown[] = [req.user!.organizationId];
    let stockSelect = '';
    let stockJoin = '';
    let lowParam = 0;
    if (includeStock) {
      params.push(branchId);
      const branchParam = params.length;
      params.push(lowDefault);
      lowParam = params.length;
      stockSelect = `,
        COALESCE(ib.quantity, 0) AS stock,
        COALESCE(ib.low_stock_threshold, p.low_stock_threshold, $${lowParam}) AS low_stock_threshold`;
      stockJoin = ` LEFT JOIN inventory_balances ib ON ib.product_id = p.id AND ib.branch_id = $${branchParam}`;
    }

    let sql = `
      SELECT p.*,
        c.name AS category_name,
        (SELECT url FROM product_photos ph WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url,
        EXISTS(SELECT 1 FROM product_photos ph2 WHERE ph2.product_id = p.id) AS has_photo
        ${stockSelect}
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${stockJoin}
      WHERE p.organization_id = $1
        AND p.status <> 'archived'`;

    if (categoryId) {
      params.push(categoryId);
      sql += ` AND p.category_id = $${params.length}`;
    }
    if (pendingPhoto) {
      sql += ` AND NOT EXISTS(SELECT 1 FROM product_photos ph3 WHERE ph3.product_id = p.id)`;
    }
    if (lowStock && includeStock) {
      sql += ` AND p.tracks_stock = true
        AND COALESCE(ib.quantity, 0) <= COALESCE(ib.low_stock_threshold, p.low_stock_threshold, $${lowParam})`;
    }
    if (allowsReturn !== null) {
      params.push(allowsReturn);
      sql += ` AND p.allows_return = $${params.length}`;
    }
    if (allowsExchange !== null) {
      params.push(allowsExchange);
      sql += ` AND p.allows_exchange = $${params.length}`;
    }
    if (tracksStock !== null) {
      params.push(tracksStock);
      sql += ` AND p.tracks_stock = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (
        p.name ILIKE $${params.length}
        OR p.internal_code ILIKE $${params.length}
        OR COALESCE(p.barcode,'') ILIKE $${params.length}
        OR COALESCE(p.brand,'') ILIKE $${params.length}
        OR COALESCE(c.name,'') ILIKE $${params.length}
        OR COALESCE(p.description,'') ILIKE $${params.length}
        OR COALESCE(p.notes,'') ILIKE $${params.length}
        OR COALESCE(p.product_type,'') ILIKE $${params.length}
        OR COALESCE(p.color,'') ILIKE $${params.length}
        OR COALESCE(p.size_label,'') ILIKE $${params.length}
      )`;
    }
    sql += ' ORDER BY p.created_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json({ products: result.rows });
  }),
);

productsRouter.get(
  '/next-barcode',
  asyncHandler(async (req, res) => {
    const code = await nextInternalCode(req.user!.organizationId);
    res.json({ nextBarcode: code });
  }),
);

productsRouter.get(
  '/barcode-available',
  asyncHandler(async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) throw new HttpError(400, 'Indica un código de barras');
    const excludeRaw = req.query.excludeProductId
      ? String(req.query.excludeProductId)
      : undefined;
    if (excludeRaw) {
      const parsed = z.string().uuid().safeParse(excludeRaw);
      if (!parsed.success) throw new HttpError(400, 'excludeProductId inválido');
    }
    const available = await isBarcodeAvailable(req.user!.organizationId, code, {
      excludeProductId: excludeRaw,
    });
    res.json({
      available,
      barcode: canonicalizeStoredProductCode(code) ?? normalizeBarcode(code),
    });
  }),
);

productsRouter.get(
  '/by-code/:code',
  requireBranch,
  asyncHandler(async (req, res) => {
    const raw = String(req.params.code || '');
    const variants = expandProductCodeVariants(raw);
    if (!variants.length) throw new HttpError(400, 'Código vacío');

    const result = await query(
      `SELECT p.*,
         c.name AS category_name,
         (SELECT url FROM product_photos ph WHERE ph.product_id = p.id ORDER BY sort_order LIMIT 1) AS photo_url,
         COALESCE(ib.quantity, 0) AS stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory_balances ib ON ib.product_id = p.id AND ib.branch_id = $2
       WHERE p.organization_id = $1
         AND p.status NOT IN ('archived', 'merma', 'returned_to_supplier')
         AND (
           p.internal_code = ANY($3::text[])
           OR UPPER(COALESCE(p.barcode, '')) = ANY($3::text[])
         )
       LIMIT 1`,
      [req.user!.organizationId, req.activeBranchId, variants],
    );
    if (!result.rows[0]) throw new HttpError(404, 'Producto no encontrado');
    res.json({ product: result.rows[0] });
  }),
);

productsRouter.post(
  '/',
  requireBranch,
  requireRoles('owner', 'branch_manager'),
  asyncHandler(async (req, res) => {
    assertCanRegisterProductCode(req.activeRole);
    const body = z
      .object({
        name: z.string().min(1),
        categoryId: z.string().uuid().optional().nullable(),
        /** Código explícito, vacío/omitido/"auto" → genera LS###### libre. */
        barcode: z.string().optional().nullable(),
        codeMode: z.enum(['auto', 'manual']).optional(),
        brand: z.string().optional().nullable(),
        sizeLabel: z.string().optional().nullable(),
        color: z.string().optional().nullable(),
        productType: z.string().optional().nullable(),
        season: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        /** Costo referencial; el costo maestro viene de compras (unit_cost). */
        costPrice: z.number().nonnegative().optional(),
        salePrice: z.number().nonnegative().optional(),
        allowsExchange: z.boolean().optional(),
        allowsReturn: z.boolean().optional(),
        tracksStock: z.boolean().optional(),
        lowStockThreshold: z.number().int().nonnegative().optional(),
        noMovementAlertDays: z.number().int().positive().optional().nullable(),
        notes: z.string().optional().nullable(),
        exclusiveNotes: z.string().optional().nullable(),
        photoUrl: photoUrlSchema,
      })
      .parse(req.body);

    let allowsExchange = body.allowsExchange;
    let allowsReturn = body.allowsReturn;
    if (body.categoryId && (allowsExchange === undefined || allowsReturn === undefined)) {
      const cat = await query<{ allows_exchange_default: boolean }>(
        'SELECT allows_exchange_default FROM categories WHERE id = $1',
        [body.categoryId],
      );
      const def = cat.rows[0]?.allows_exchange_default ?? true;
      allowsExchange = allowsExchange ?? def;
      allowsReturn = allowsReturn ?? def;
    }

    const costPrice = body.costPrice ?? 0;
    let salePrice = body.salePrice;
    if (req.activeRole === 'seller') {
      if (body.salePrice !== undefined) assertCanEditSalePrice('seller');
      salePrice = 0;
    } else if (salePrice === undefined) {
      throw new HttpError(400, 'Ingresa el precio de venta');
    }
    const requestedRaw = body.barcode?.trim() ?? '';
    const wantsAuto =
      body.codeMode === 'auto' ||
      !requestedRaw ||
      requestedRaw.toLowerCase() === 'auto';
    const requestedCode = wantsAuto ? null : canonicalizeStoredProductCode(requestedRaw);
    if (!wantsAuto && !requestedCode) {
      throw new HttpError(400, 'Ingresa un código válido o elige Autogenerar');
    }
    if (requestedCode) {
      await assertBarcodeAvailable(req.user!.organizationId, requestedCode);
    }
    const internalCode = requestedCode ?? (await nextInternalCode(req.user!.organizationId));
    const lowDefault = await getSettingNumber(req.user!.organizationId, 'low_stock_threshold', 1);
    const lowStockThreshold = body.lowStockThreshold ?? lowDefault;
    const tracksStock = body.tracksStock ?? true;

    const result = await query(
      `INSERT INTO products (
         organization_id, category_id, internal_code, barcode, name, description, brand, size_label, color,
         product_type, season, cost_price, sale_price, status, allows_exchange, allows_return,
         tracks_stock, low_stock_threshold, no_movement_alert_days,
         notes, exclusive_notes, created_by
       ) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        req.user!.organizationId,
        body.categoryId ?? null,
        internalCode,
        body.name,
        body.description ?? null,
        body.brand ?? null,
        body.sizeLabel ?? null,
        body.color ?? null,
        body.productType ?? null,
        body.season ?? null,
        costPrice,
        salePrice,
        allowsExchange ?? true,
        allowsReturn ?? true,
        tracksStock,
        lowStockThreshold,
        body.noMovementAlertDays ?? null,
        body.notes ?? null,
        body.exclusiveNotes ?? null,
        req.user!.id,
      ],
    );
    const product = result.rows[0];
    if (body.photoUrl) {
      await query('INSERT INTO product_photos (product_id, url) VALUES ($1,$2)', [
        product.id,
        body.photoUrl,
      ]);
    }
    if (req.activeBranchId && tracksStock) {
      await query(
        `INSERT INTO inventory_balances (product_id, branch_id, quantity, low_stock_threshold)
         VALUES ($1, $2, 0, $3)
         ON CONFLICT (product_id, branch_id) DO UPDATE
           SET low_stock_threshold = EXCLUDED.low_stock_threshold, updated_at = now()`,
        [product.id, req.activeBranchId, lowStockThreshold],
      );
    }
    res.status(201).json({ product });
  }),
);

productsRouter.patch(
  '/:id',
  requireBranch,
  requireRoles('owner', 'branch_manager', 'seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        salePrice: z.number().nonnegative().optional(),
        /** Solo sync legado; no es dato maestro editable desde catálogo. */
        costPrice: z.number().nonnegative().optional(),
        barcode: z.string().optional().nullable(),
        internalCode: z.string().optional().nullable(),
        status: z.string().optional(),
        allowsExchange: z.boolean().optional(),
        allowsReturn: z.boolean().optional(),
        tracksStock: z.boolean().optional(),
        lowStockThreshold: z.number().int().nonnegative().optional(),
        noMovementAlertDays: z.number().int().positive().optional().nullable(),
        notes: z.string().optional().nullable(),
        exclusiveNotes: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        productType: z.string().optional().nullable(),
        season: z.string().optional().nullable(),
        photoUrl: photoUrlSchema,
        categoryId: z.string().uuid().optional().nullable(),
        brand: z.string().optional().nullable(),
        sizeLabel: z.string().optional().nullable(),
        color: z.string().optional().nullable(),
      })
      .parse(req.body);

    if (req.activeRole === 'seller' && body.salePrice !== undefined) {
      assertCanEditSalePrice('seller');
    }

    const productId = String(req.params.id);

    const current = await query<{ internal_code: string; barcode: string | null }>(
      `SELECT internal_code, barcode FROM products WHERE id = $1 AND organization_id = $2`,
      [productId, req.user!.organizationId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) throw new HttpError(404, 'Producto no encontrado');
    const lockedCode = normalizeBarcode(currentRow.internal_code);
    for (const attempted of [body.barcode, body.internalCode]) {
      if (attempted === undefined) continue;
      const next = normalizeBarcode(attempted);
      if (!lockedCode || next !== lockedCode) {
        throw new HttpError(400, 'El código de la prenda no se puede modificar.');
      }
    }

    const result = await query(
      `UPDATE products SET
         name = COALESCE($1, name),
         sale_price = COALESCE($2, sale_price),
         cost_price = COALESCE($3, cost_price),
         barcode = internal_code,
         status = COALESCE($4::product_status, status),
         allows_exchange = COALESCE($5, allows_exchange),
         allows_return = COALESCE($6, allows_return),
         notes = CASE WHEN $7::boolean THEN $8 ELSE notes END,
         category_id = CASE WHEN $9::boolean THEN $10 ELSE category_id END,
         brand = CASE WHEN $11::boolean THEN $12 ELSE brand END,
         size_label = CASE WHEN $13::boolean THEN $14 ELSE size_label END,
         color = CASE WHEN $15::boolean THEN $16 ELSE color END,
         tracks_stock = COALESCE($17, tracks_stock),
         low_stock_threshold = COALESCE($18, low_stock_threshold),
         no_movement_alert_days = CASE WHEN $19::boolean THEN $20 ELSE no_movement_alert_days END,
         description = CASE WHEN $21::boolean THEN $22 ELSE description END,
         product_type = CASE WHEN $23::boolean THEN $24 ELSE product_type END,
         season = CASE WHEN $25::boolean THEN $26 ELSE season END,
         exclusive_notes = CASE WHEN $27::boolean THEN $28 ELSE exclusive_notes END,
         updated_at = now()
       WHERE id = $29 AND organization_id = $30
       RETURNING *`,
      [
        body.name ?? null,
        body.salePrice ?? null,
        body.costPrice ?? null,
        body.status ?? null,
        body.allowsExchange ?? null,
        body.allowsReturn ?? null,
        body.notes !== undefined,
        body.notes ?? null,
        body.categoryId !== undefined,
        body.categoryId ?? null,
        body.brand !== undefined,
        body.brand ?? null,
        body.sizeLabel !== undefined,
        body.sizeLabel ?? null,
        body.color !== undefined,
        body.color ?? null,
        body.tracksStock ?? null,
        body.lowStockThreshold ?? null,
        body.noMovementAlertDays !== undefined,
        body.noMovementAlertDays ?? null,
        body.description !== undefined,
        body.description ?? null,
        body.productType !== undefined,
        body.productType ?? null,
        body.season !== undefined,
        body.season ?? null,
        body.exclusiveNotes !== undefined,
        body.exclusiveNotes ?? null,
        productId,
        req.user!.organizationId,
      ],
    );
    if (!result.rows[0]) throw new HttpError(404, 'Producto no encontrado');

    if (body.lowStockThreshold !== undefined && req.activeBranchId) {
      await query(
        `INSERT INTO inventory_balances (product_id, branch_id, quantity, low_stock_threshold)
         VALUES ($1, $2, 0, $3)
         ON CONFLICT (product_id, branch_id) DO UPDATE
           SET low_stock_threshold = EXCLUDED.low_stock_threshold, updated_at = now()`,
        [productId, req.activeBranchId, body.lowStockThreshold],
      );
    }

    if (body.photoUrl !== undefined) {
      await query('DELETE FROM product_photos WHERE product_id = $1', [productId]);
      if (body.photoUrl) {
        await query('INSERT INTO product_photos (product_id, url) VALUES ($1,$2)', [
          productId,
          body.photoUrl,
        ]);
      }
    }
    res.json({ product: result.rows[0] });
  }),
);
