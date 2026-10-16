import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  applyStockDeltaWithClient,
  nextDepositNumberWithClient,
} from './inventory.js';
import { createSaleWithClient } from './sales.js';
import { HttpError } from '../utils/errors.js';
import { clpPesos } from './voucherFulfill.js';
import type { SalePaymentMethod } from '../domain/paymentMethod.js';

export const createDepositBodySchema = z.object({
  posId: z.string().uuid(),
  /** Nombre de quien reserva / paga el abono (obligatorio). */
  customerName: z
    .string({ required_error: 'Indica el nombre de quien reserva' })
    .trim()
    .min(2, 'Indica el nombre de quien reserva')
    .max(120),
  notes: z.string().trim().max(500).optional().nullable(),
  initialAmount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card']),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

export const completeDepositBodySchema = z.object({
  paymentMethod: z.enum(['cash', 'card']),
  /** Si se omite, cobra exactamente el faltante. */
  amount: z.number().positive().optional(),
});

export async function createDepositWithClient(
  client: PoolClient,
  params: {
    organizationId: string;
    branchId: string;
    userId: string;
    body: z.infer<typeof createDepositBodySchema>;
  },
) {
  const { body } = params;
  const lines: {
    productId: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    name: string;
    code: string;
  }[] = [];

  const merged = new Map<string, (typeof body.items)[number]>();
  for (const item of body.items) {
    const prev = merged.get(item.productId);
    if (prev) prev.quantity += item.quantity;
    else merged.set(item.productId, { ...item });
  }

  for (const item of merged.values()) {
    const prod = await client.query<{
      sale_price: string;
      tracks_stock: boolean;
      name: string;
      internal_code: string;
    }>(
      `SELECT sale_price::text, COALESCE(tracks_stock, true) AS tracks_stock, name, internal_code
       FROM products WHERE id = $1 AND organization_id = $2`,
      [item.productId, params.organizationId],
    );
    if (!prod.rows[0]) throw new HttpError(400, 'Producto inválido');
    if (!prod.rows[0].tracks_stock) {
      throw new HttpError(400, `${prod.rows[0].name} no controla stock de vitrina`);
    }
    const bal = await client.query<{ quantity: number }>(
      `SELECT quantity FROM inventory_balances
       WHERE product_id = $1 AND branch_id = $2
       FOR UPDATE`,
      [item.productId, params.branchId],
    );
    const available = bal.rows[0]?.quantity ?? 0;
    if (item.quantity > available) {
      const name = prod.rows[0].name;
      throw new HttpError(
        400,
        available <= 0
          ? `No hay unidades de ${name} en esta sucursal`
          : `Solo hay ${available} ${available === 1 ? 'unidad' : 'unidades'} de ${name} en esta sucursal`,
      );
    }
    const unitPrice = item.unitPrice ?? Number(prod.rows[0].sale_price);
    const lineTotal = clpPesos(unitPrice) * item.quantity;
    lines.push({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: clpPesos(unitPrice),
      lineTotal,
      name: prod.rows[0].name,
      code: prod.rows[0].internal_code,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const initialAmount = clpPesos(body.initialAmount);
  if (initialAmount >= subtotal) {
    throw new HttpError(
      400,
      `El abono inicial debe ser menor al total ($${subtotal.toLocaleString('es-CL')}). Si paga todo, registra una venta.`,
    );
  }
  if (initialAmount <= 0) throw new HttpError(400, 'Indica el monto del abono inicial');

  const depositNumber = await nextDepositNumberWithClient(client, params.organizationId);
  const dep = await client.query(
    `INSERT INTO deposits (
       organization_id, branch_id, pos_id, deposit_number, status,
       customer_name, notes, subtotal, paid_amount, created_by
     ) VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      params.organizationId,
      params.branchId,
      body.posId,
      depositNumber,
      body.customerName.trim(),
      body.notes?.trim() || null,
      subtotal,
      initialAmount,
      params.userId,
    ],
  );
  const deposit = dep.rows[0];

  for (const line of lines) {
    await client.query(
      `INSERT INTO deposit_items (deposit_id, product_id, quantity, unit_price, line_total)
       VALUES ($1,$2,$3,$4,$5)`,
      [deposit.id, line.productId, line.quantity, line.unitPrice, line.lineTotal],
    );
    await applyStockDeltaWithClient(client, {
      organizationId: params.organizationId,
      branchId: params.branchId,
      productId: line.productId,
      delta: -line.quantity,
      movementType: 'DEPOSIT_HOLD',
      referenceType: 'deposit',
      referenceId: deposit.id,
      userId: params.userId,
      notes: `Abono ${depositNumber} · retención`,
    });
  }

  await client.query(
    `INSERT INTO deposit_payments (deposit_id, kind, amount, payment_method, created_by)
     VALUES ($1,'initial',$2,$3,$4)`,
    [deposit.id, initialAmount, body.paymentMethod, params.userId],
  );

  return { deposit, items: lines };
}

export async function cancelDepositWithClient(
  client: PoolClient,
  params: {
    organizationId: string;
    branchId: string;
    userId: string;
    depositId: string;
  },
) {
  const dep = await client.query(
    `SELECT * FROM deposits
     WHERE id = $1 AND organization_id = $2 AND branch_id = $3
     FOR UPDATE`,
    [params.depositId, params.organizationId, params.branchId],
  );
  const deposit = dep.rows[0];
  if (!deposit) throw new HttpError(404, 'Abono no encontrado');
  if (deposit.status !== 'open') {
    throw new HttpError(400, 'Solo se puede anular un abono abierto');
  }

  const items = await client.query<{ product_id: string; quantity: number }>(
    `SELECT product_id, quantity FROM deposit_items WHERE deposit_id = $1`,
    [deposit.id],
  );
  for (const item of items.rows) {
    await applyStockDeltaWithClient(client, {
      organizationId: params.organizationId,
      branchId: params.branchId,
      productId: item.product_id,
      delta: item.quantity,
      movementType: 'DEPOSIT_RELEASE',
      referenceType: 'deposit',
      referenceId: deposit.id,
      userId: params.userId,
      notes: `Abono ${deposit.deposit_number} · anulado · libera retención`,
    });
  }

  const updated = await client.query(
    `UPDATE deposits
     SET status = 'cancelled', cancelled_by = $2, cancelled_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [deposit.id, params.userId],
  );
  return { deposit: updated.rows[0] };
}

export async function completeDepositWithClient(
  client: PoolClient,
  params: {
    organizationId: string;
    branchId: string;
    userId: string;
    depositId: string;
    body: z.infer<typeof completeDepositBodySchema>;
  },
) {
  const dep = await client.query(
    `SELECT * FROM deposits
     WHERE id = $1 AND organization_id = $2 AND branch_id = $3
     FOR UPDATE`,
    [params.depositId, params.organizationId, params.branchId],
  );
  const deposit = dep.rows[0];
  if (!deposit) throw new HttpError(404, 'Abono no encontrado');
  if (deposit.status !== 'open') {
    throw new HttpError(400, 'Solo se puede completar un abono abierto');
  }
  if (!deposit.pos_id) throw new HttpError(400, 'El abono no tiene caja POS asociada');

  const remaining = clpPesos(Number(deposit.subtotal) - Number(deposit.paid_amount));
  if (remaining <= 0) throw new HttpError(400, 'Este abono ya está pagado por completo');

  const payAmount = params.body.amount != null ? clpPesos(params.body.amount) : remaining;
  if (payAmount !== remaining) {
    throw new HttpError(
      400,
      `Debes cobrar exactamente el faltante ($${remaining.toLocaleString('es-CL')}). No hay abonos parciales intermedios.`,
    );
  }

  const items = await client.query<{
    product_id: string;
    quantity: number;
    unit_price: string;
  }>(
    `SELECT product_id, quantity, unit_price::text FROM deposit_items WHERE deposit_id = $1`,
    [deposit.id],
  );
  if (!items.rows.length) throw new HttpError(400, 'El abono no tiene prendas');

  // Liberar hold y luego SALE_OUT vía createSale
  for (const item of items.rows) {
    await applyStockDeltaWithClient(client, {
      organizationId: params.organizationId,
      branchId: params.branchId,
      productId: item.product_id,
      delta: item.quantity,
      movementType: 'DEPOSIT_RELEASE',
      referenceType: 'deposit',
      referenceId: deposit.id,
      userId: params.userId,
      notes: `Abono ${deposit.deposit_number} · completa · libera retención`,
    });
  }

  const paidTotal = clpPesos(Number(deposit.paid_amount) + payAmount);
  const note = `Abono ${deposit.deposit_number} −$${clpPesos(deposit.paid_amount).toLocaleString('es-CL')}`;

  const { sale, vouchers } = await createSaleWithClient(client, {
    organizationId: params.organizationId,
    branchId: params.branchId,
    posId: deposit.pos_id,
    sellerUserId: params.userId,
    notes: note,
    discount: clpPesos(deposit.paid_amount),
    paymentMethod: params.body.paymentMethod as SalePaymentMethod,
    items: items.rows.map((i) => ({
      productId: i.product_id,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
    })),
    movementNotes: `Venta desde abono ${deposit.deposit_number}`,
  });

  await client.query(
    `INSERT INTO deposit_payments (deposit_id, kind, amount, payment_method, created_by)
     VALUES ($1,'complete',$2,$3,$4)`,
    [deposit.id, payAmount, params.body.paymentMethod, params.userId],
  );

  const updated = await client.query(
    `UPDATE deposits
     SET status = 'completed', paid_amount = $2, sale_id = $3,
         completed_by = $4, completed_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [deposit.id, paidTotal, sale.id, params.userId],
  );

  return { deposit: updated.rows[0], sale, vouchers, remainingPaid: payAmount };
}
