import type { PoolClient } from 'pg';
import {
  applyStockDeltaWithClient,
  getSettingNumber,
  getSettingText,
  nextReceiptNumber,
} from './inventory.js';
import { HttpError } from '../utils/errors.js';

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
       subtotal, discount, total, notes, sold_at, client_sale_id, offline_synced_at)
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,
       COALESCE($10::timestamptz, now()),
       $11,
       $12::timestamptz
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
    ],
  );
  const sale = saleRes.rows[0];
  const vouchers: Record<string, unknown>[] = [];
  const baseVoucherCount = await client.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM change_vouchers WHERE organization_id = $1',
    [params.organizationId],
  );
  let voucherN = Number(baseVoucherCount.rows[0]?.count || 0);

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
      voucherN += 1;
      const voucherNumber = `VC-${String(voucherN).padStart(6, '0')}`;
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
