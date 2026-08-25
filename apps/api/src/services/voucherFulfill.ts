import type { PoolClient } from 'pg';
import { z } from 'zod';
import { applyStockDeltaWithClient, expandProductCodeVariants } from './inventory.js';
import { HttpError } from '../utils/errors.js';
import { CHILE_TZ } from '../utils/chileDate.js';

export const MERMA_KINDS = ['discard', 'supplier'] as const;
export type MermaKind = (typeof MERMA_KINDS)[number];

export const VOUCHER_OUTCOMES = ['exchange', 'cash_refund'] as const;
export const VOUCHER_DESTINATIONS = ['restock', 'discard', 'supplier'] as const;

export function mermaKindLabel(kind: MermaKind): string {
  return kind === 'supplier' ? 'Devolución a proveedor' : 'Baja de vitrina';
}

export function composeMermaReason(kind: MermaKind, notes?: string | null): string {
  const note = notes?.trim();
  const label = mermaKindLabel(kind);
  return note ? `${label}: ${note}` : label;
}

export const fulfillBodySchema = z
  .object({
    scannedCode: z.string().trim().min(1, 'Pistolea o ingresa el código de la prenda'),
    outcome: z.enum(VOUCHER_OUTCOMES),
    destination: z.enum(VOUCHER_DESTINATIONS),
    newProductId: z.string().uuid().optional().nullable(),
    cashAmount: z.number().nonnegative().optional().nullable(),
    overrideExpired: z.boolean().optional().default(false),
    overrideNote: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((body, ctx) => {
    if (body.outcome === 'exchange' && !body.newProductId) {
      ctx.addIssue({
        code: 'custom',
        path: ['newProductId'],
        message: 'Indica la prenda nueva para el cambio',
      });
    }
  });

export type FulfillBody = z.infer<typeof fulfillBodySchema>;

type VoucherRow = {
  id: string;
  status: string;
  product_id: string;
  sale_id: string | null;
  sale_item_id: string | null;
  voucher_number: string;
  expires_at: string;
  issued_at: string;
  branch_id: string;
  organization_id: string;
};

export async function chileTodayWithClient(client: PoolClient): Promise<string> {
  const res = await client.query<{ d: string }>(
    `SELECT (timezone($1, now()))::date::text AS d`,
    [CHILE_TZ],
  );
  return res.rows[0]?.d || new Date().toISOString().slice(0, 10);
}

export function isPartyDress(opts: {
  allows_exchange: boolean;
  category_slug: string | null;
}): boolean {
  if (opts.category_slug === 'vestidos-fiesta') return true;
  return opts.allows_exchange === false;
}

export async function findProductIdByScannedCode(
  client: PoolClient,
  organizationId: string,
  code: string,
): Promise<string | null> {
  const variants = expandProductCodeVariants(code);
  if (!variants.length) return null;
  const res = await client.query<{ id: string }>(
    `SELECT id FROM products
     WHERE organization_id = $1
       AND (
         internal_code = ANY($2::text[])
         OR UPPER(COALESCE(barcode, '')) = ANY($2::text[])
       )
     LIMIT 1`,
    [organizationId, variants],
  );
  return res.rows[0]?.id ?? null;
}

export async function insertLinkedMerma(
  client: PoolClient,
  params: {
    organizationId: string;
    branchId: string;
    productId: string;
    quantity: number;
    kind: MermaKind;
    notes: string;
    reason: string;
    costImpact: number;
    userId: string;
    voucherId: string;
  },
) {
  const merma = await client.query(
    `INSERT INTO mermas (
       organization_id, branch_id, product_id, quantity, reason, cost_impact,
       created_by, kind, notes, voucher_id, skip_stock
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     RETURNING *`,
    [
      params.organizationId,
      params.branchId,
      params.productId,
      params.quantity,
      params.reason,
      params.costImpact,
      params.userId,
      params.kind,
      params.notes,
      params.voucherId,
    ],
  );
  return merma.rows[0];
}

export async function fulfillVoucherWithClient(
  client: PoolClient,
  params: {
    voucher: VoucherRow;
    body: FulfillBody;
    organizationId: string;
    branchId: string;
    userId: string;
    todayCl: string;
  },
) {
  const { voucher, body, organizationId, branchId, userId, todayCl } = params;
  const expired = voucher.expires_at < todayCl || voucher.status === 'expired';

  if (voucher.status === 'used') throw new HttpError(400, 'Este ticket ya fue usado');
  if (voucher.status === 'cancelled') throw new HttpError(400, 'Este ticket está anulado');
  if (voucher.status !== 'open' && voucher.status !== 'expired') {
    throw new HttpError(400, 'Este ticket no está disponible');
  }

  if (voucher.sale_id) {
    const cap = await client.query<{ used: string; eligible: string }>(
      `SELECT
         (SELECT COUNT(*)::int FROM change_vouchers WHERE sale_id = $1 AND status = 'used') AS used,
         (SELECT COUNT(*)::int FROM sale_items si
            JOIN products p ON p.id = si.product_id
          WHERE si.sale_id = $1 AND (p.allows_exchange OR p.allows_return)) AS eligible`,
      [voucher.sale_id],
    );
    const used = Number(cap.rows[0]?.used || 0);
    const eligible = Number(cap.rows[0]?.eligible || 0);
    if (eligible > 0 && used >= eligible) {
      throw new HttpError(400, 'Esta venta ya usó todos sus tickets de cambio.');
    }
  }

  if (expired && !body.overrideExpired) {
    throw new HttpError(
      400,
      'El ticket está vencido. Confirma el uso fuera de plazo e indica el motivo.',
    );
  }
  if (expired && !body.overrideNote?.trim()) {
    throw new HttpError(400, 'Indica el motivo para usar un ticket vencido');
  }

  const scannedId = await findProductIdByScannedCode(client, organizationId, body.scannedCode);
  if (!scannedId || scannedId !== voucher.product_id) {
    throw new HttpError(400, 'El código no corresponde a la prenda de este ticket');
  }

  const prod = await client.query<{ cost_price: string; tracks_stock: boolean }>(
    `SELECT cost_price, COALESCE(tracks_stock, true) AS tracks_stock
     FROM products WHERE id = $1 AND organization_id = $2`,
    [voucher.product_id, organizationId],
  );
  if (!prod.rows[0]) throw new HttpError(400, 'Producto del ticket no encontrado');

  let qty = 1;
  let lineTotal = 0;
  if (voucher.sale_item_id) {
    const item = await client.query<{ quantity: number; line_total: string }>(
      `SELECT quantity, line_total::text FROM sale_items WHERE id = $1`,
      [voucher.sale_item_id],
    );
    if (item.rows[0]?.quantity) qty = item.rows[0].quantity;
    lineTotal = Number(item.rows[0]?.line_total || 0);
  }

  let cashAmount: number | null = null;
  if (body.outcome === 'cash_refund') {
    if (body.cashAmount == null && lineTotal <= 0) {
      throw new HttpError(400, 'Indica el monto de la devolución en efectivo');
    }
    cashAmount = body.cashAmount ?? lineTotal;
    if (lineTotal > 0 && Math.abs(cashAmount - lineTotal) > 0.009) {
      throw new HttpError(
        400,
        `El monto debe coincidir con la línea de venta ($${Math.round(lineTotal)})`,
      );
    }
  }

  const destKind: MermaKind | null =
    body.destination === 'restock' ? null : body.destination === 'supplier' ? 'supplier' : 'discard';

  let originalAfter: number | null = null;
  let newAfter: number | null = null;
  let merma: Record<string, unknown> | null = null;

  const auditBits = [
    `ticket ${voucher.voucher_number}`,
    body.outcome === 'exchange' ? 'cambio' : 'devolución en efectivo',
    body.destination === 'restock'
      ? 'reingreso a vitrina'
      : body.destination === 'supplier'
        ? 'a proveedor'
        : 'baja',
    expired ? `vencido: ${body.overrideNote!.trim()}` : null,
    body.notes?.trim() || null,
  ].filter(Boolean);
  const movementNotes = auditBits.join(' · ');

  if (body.destination === 'restock') {
    originalAfter = await applyStockDeltaWithClient(client, {
      organizationId,
      branchId,
      productId: voucher.product_id,
      delta: qty,
      movementType: 'RETURN_IN',
      referenceType: 'change_voucher',
      referenceId: voucher.id,
      userId,
      notes: movementNotes,
    });
    await client.query(
      `UPDATE products SET status = 'available', updated_at = now() WHERE id = $1`,
      [voucher.product_id],
    );
  } else if (destKind) {
    const costImpact = Number(prod.rows[0].cost_price) * qty;
    const reason = composeMermaReason(destKind, `ticket ${voucher.voucher_number}`);
    merma = await insertLinkedMerma(client, {
      organizationId,
      branchId,
      productId: voucher.product_id,
      quantity: qty,
      kind: destKind,
      notes: movementNotes,
      reason,
      costImpact,
      userId,
      voucherId: voucher.id,
    });
  }

  if (body.outcome === 'exchange' && body.newProductId) {
    if (body.newProductId === voucher.product_id && body.destination === 'restock') {
      throw new HttpError(400, 'Para un cambio, pistolea una prenda distinta de vitrina');
    }
    const neu = await client.query<{ id: string; tracks_stock: boolean }>(
      `SELECT id, COALESCE(tracks_stock, true) AS tracks_stock
       FROM products WHERE id = $1 AND organization_id = $2`,
      [body.newProductId, organizationId],
    );
    if (!neu.rows[0]) throw new HttpError(400, 'La prenda nueva no existe');
    if (!neu.rows[0].tracks_stock) {
      throw new HttpError(400, 'La prenda nueva no controla stock de vitrina');
    }
    const neuBal = await client.query<{ quantity: number }>(
      `SELECT quantity FROM inventory_balances
       WHERE product_id = $1 AND branch_id = $2 FOR UPDATE`,
      [body.newProductId, branchId],
    );
    const neuStock = neuBal.rows[0]?.quantity ?? 0;
    if (neuStock < qty) {
      throw new HttpError(
        400,
        `No hay stock suficiente de la prenda nueva (disponible: ${neuStock})`,
      );
    }
    newAfter = await applyStockDeltaWithClient(client, {
      organizationId,
      branchId,
      productId: body.newProductId,
      delta: -qty,
      movementType: 'EXCHANGE_OUT',
      referenceType: 'change_voucher',
      referenceId: voucher.id,
      userId,
      notes: movementNotes,
    });
    await client.query(`UPDATE products SET status = 'sold', updated_at = now() WHERE id = $1`, [
      body.newProductId,
    ]);
  }

  await client.query(`UPDATE change_vouchers SET status = 'used' WHERE id = $1`, [voucher.id]);

  const er = await client.query(
    `INSERT INTO exchange_returns (
       organization_id, branch_id, voucher_id, original_product_id, new_product_id,
       notes, created_by, outcome, destination, override_expired, override_note,
       cash_amount, scanned_code
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      organizationId,
      branchId,
      voucher.id,
      voucher.product_id,
      body.outcome === 'exchange' ? body.newProductId : null,
      movementNotes,
      userId,
      body.outcome,
      body.destination,
      expired && body.overrideExpired,
      expired ? body.overrideNote!.trim() : null,
      cashAmount,
      body.scannedCode.trim(),
    ],
  );

  return {
    voucherId: voucher.id,
    status: 'used' as const,
    expired,
    overrideExpired: Boolean(expired && body.overrideExpired),
    outcome: body.outcome,
    destination: body.destination,
    cashAmount,
    merma,
    exchangeReturn: er.rows[0],
    stock: { originalAfter, newAfter },
  };
}
