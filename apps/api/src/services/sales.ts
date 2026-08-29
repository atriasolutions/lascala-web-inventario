import type { PoolClient } from 'pg';
import type { SalePaymentMethod } from '../domain/paymentMethod.js';
import {
  applyStockDeltaWithClient,
  getSettingNumber,
  getSettingText,
  nextReceiptNumber,
  nextVoucherNumberWithClient,
} from './inventory.js';
import { HttpError } from '../utils/errors.js';
import { CHILE_TZ } from '../utils/chileDate.js';

export type CreateSaleItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

export type CreateSaleParams = {
  organizationId: string;
  branchId: string;
  posId: string;
  sellerUserId: string;
  notes?: string | null;
  discount?: number;
  items: CreateSaleItemInput[];
  paymentMethod?: SalePaymentMethod;
  /** Solo POST /api/sales/offline-sync */
  allowNegative?: boolean;
  clientSaleId?: string | null;
  soldAt?: string | Date | null;
  /** Notas en inventory_movements (auditoría offline) */
  movementNotes?: string | null;
  offlineSyncedAt?: string | Date | null;
};

export type CreatedSaleResult = {
  sale: Record<string, unknown>;
  vouchers: Record<string, unknown>[];
};

/**
 * Crea venta + ítems + vouchers + movimientos de stock en la TX del client.
 * Online: allowNegative omitido/false. Offline sync: allowNegative true.
 */
export async function createSaleWithClient(
  client: PoolClient,
  params: CreateSaleParams,
): Promise<CreatedSaleResult> {
  const voucherDays = await getSettingNumber(params.organizationId, 'change_voucher_days', 7);
  const conditions = await getSettingText(
    params.organizationId,
    'change_conditions',
    "Condiciones de cambio L'Scala",
  );

  let subtotal = 0;
  const lineData: {
    productId: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    allowsExchange: boolean;
    tracksStock: boolean;
  }[] = [];

  for (const item of params.items) {
    const prod = await client.query<{
      sale_price: string;
      allows_exchange: boolean;
      allows_return: boolean;
      tracks_stock: boolean;
    }>(
      `SELECT sale_price, allows_exchange, allows_return,
              COALESCE(tracks_stock, true) AS tracks_stock
       FROM products WHERE id = $1 AND organization_id = $2`,
      [item.productId, params.organizationId],
    );
    if (!prod.rows[0]) throw new HttpError(400, 'Producto inválido');
    const unitPrice = item.unitPrice ?? Number(prod.rows[0].sale_price);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    lineData.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      allowsExchange: prod.rows[0].allows_exchange || prod.rows[0].allows_return,
      tracksStock: prod.rows[0].tracks_stock,
    });
  }

  const discount = params.discount ?? 0;
  const total = Math.max(subtotal - discount, 0);
  const receiptNumber = await nextReceiptNumber(params.organizationId);

  const soldAt =
    params.soldAt != null
      ? new Date(params.soldAt)
      : null;
  if (soldAt && Number.isNaN(soldAt.getTime())) {
    throw new HttpError(400, 'soldAt inválido');
  }

  const saleRes = await client.query(
    `INSERT INTO sales
      (organization_id, branch_id, pos_id, seller_user_id, receipt_number,
       subtotal, discount, total, notes, sold_at, client_sale_id, offline_synced_at,
       payment_method)
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,
       COALESCE($10::timestamptz, now()),
       $11,
       $12::timestamptz,
       $13::sale_payment_method
     )
     RETURNING *`,
    [
      params.organizationId,
      params.branchId,
      params.posId,
      params.sellerUserId,
      receiptNumber,
      subtotal,
      discount,
      total,
      params.notes ?? null,
      soldAt?.toISOString() ?? null,
      params.clientSaleId ?? null,
      params.offlineSyncedAt
        ? new Date(params.offlineSyncedAt).toISOString()
        : null,
      params.paymentMethod ?? 'cash',
    ],
  );
  const sale = saleRes.rows[0];
  const vouchers: Record<string, unknown>[] = [];

  for (const line of lineData) {
    const itemRes = await client.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_total)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [sale.id, line.productId, line.quantity, line.unitPrice, line.lineTotal],
    );

    if (line.tracksStock) {
      await applyStockDeltaWithClient(client, {
        organizationId: params.organizationId,
        branchId: params.branchId,
        productId: line.productId,
        delta: -line.quantity,
        movementType: 'SALE_OUT',
        referenceType: 'sale',
        referenceId: sale.id,
        userId: params.sellerUserId,
        allowNegative: params.allowNegative === true,
        notes: params.movementNotes || undefined,
      });
    }

    await client.query(`UPDATE products SET status = 'sold', updated_at = now() WHERE id = $1`, [
      line.productId,
    ]);

    if (line.allowsExchange) {
      const voucherNumber = await nextVoucherNumberWithClient(client, params.organizationId);
      const expires = new Date();
      expires.setDate(expires.getDate() + voucherDays);
      const v = await client.query(
        `INSERT INTO change_vouchers
          (organization_id, branch_id, sale_id, sale_item_id, product_id, voucher_number, expires_at, conditions, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          params.organizationId,
          params.branchId,
          sale.id,
          itemRes.rows[0].id,
          line.productId,
          voucherNumber,
          expires.toISOString().slice(0, 10),
          conditions,
          params.sellerUserId,
        ],
      );
      vouchers.push(v.rows[0]);
    }
  }

  return { sale, vouchers };
}

export async function findSaleByClientSaleId(
  client: PoolClient,
  organizationId: string,
  clientSaleId: string,
) {
  const res = await client.query(
    `SELECT * FROM sales
     WHERE organization_id = $1 AND client_sale_id = $2
     LIMIT 1`,
    [organizationId, clientSaleId],
  );
  return res.rows[0] ?? null;
}

/**
 * Crea tickets VC- faltantes para líneas elegibles (cambio/devolución) de una venta ya grabada.
 * No inventa vouchers si la prenda no admite cambio ni devolución.
 */
export async function ensureEligibleSaleVouchers(
  client: PoolClient,
  params: { organizationId: string; saleId: string; createdBy: string },
): Promise<number> {
  const voucherDays = await getSettingNumber(params.organizationId, 'change_voucher_days', 7);
  const conditions = await getSettingText(
    params.organizationId,
    'change_conditions',
    "Condiciones de cambio L'Scala",
  );

  const missing = await client.query<{
    sale_item_id: string;
    product_id: string;
    branch_id: string;
    issued_at: string;
  }>(
    `SELECT si.id AS sale_item_id,
            si.product_id,
            s.branch_id,
            (timezone($3, s.sold_at))::date::text AS issued_at
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE s.id = $1
       AND s.organization_id = $2
       AND (p.allows_exchange OR p.allows_return)
       AND NOT EXISTS (
         SELECT 1 FROM change_vouchers v WHERE v.sale_item_id = si.id
       )
     ORDER BY si.created_at, si.id`,
    [params.saleId, params.organizationId, CHILE_TZ],
  );

  for (const row of missing.rows) {
    const voucherNumber = await nextVoucherNumberWithClient(client, params.organizationId);
    await client.query(
      `INSERT INTO change_vouchers
        (organization_id, branch_id, sale_id, sale_item_id, product_id,
         voucher_number, issued_at, expires_at, conditions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date, ($7::date + $8::int), $9,$10)`,
      [
        params.organizationId,
        row.branch_id,
        params.saleId,
        row.sale_item_id,
        row.product_id,
        voucherNumber,
        row.issued_at,
        voucherDays,
        conditions,
        params.createdBy,
      ],
    );
  }
  return missing.rows.length;
}
