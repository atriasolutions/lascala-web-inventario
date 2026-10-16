import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { query } from '../db/pool.js';
import { nextStoreCreditNumberWithClient } from './inventory.js';
import { HttpError } from '../utils/errors.js';
import { CHILE_TZ } from '../utils/chileDate.js';
import { clpPesos } from './voucherFulfill.js';

export type StoreCreditRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  barcode: string;
  redeem_code: string | null;
  amount: string;
  status: string;
  issued_at: string;
  expires_at: string;
  sale_id: string | null;
  notes: string | null;
};

export function expandStoreCreditVariants(code: string | null | undefined): string[] {
  const raw = String(code ?? '')
    .trim()
    .replace(/['`´]/g, '')
    .toUpperCase();
  if (!raw) return [];
  const m = raw.match(/^CR-?(\d+)$/);
  if (!m) return [raw];
  const digits = m[1];
  const padded = digits.padStart(6, '0');
  return [...new Set([`CR${digits}`, `CR${padded}`, `CR-${digits}`, `CR-${padded}`, raw])];
}

export const STORE_CREDIT_MONTHS = 6;

/** Sin 0/O/1/I. 12 caracteres: no se infiere del folio CR######. */
const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function isStoreCreditFolio(code: string | null | undefined): boolean {
  return /^CR-?\d+$/i.test(String(code ?? '').trim());
}

export function newCouponCode(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += COUPON_ALPHABET[bytes[i]! % COUPON_ALPHABET.length];
  return out;
}

export async function issueStoreCreditWithClient(
  client: PoolClient,
  params: {
    organizationId: string;
    branchId: string;
    amount: number;
    /** Si se omite, vence a los 6 meses de la emisión. */
    monthsValid?: number;
    notes?: string | null;
    userId: string;
    exchangeReturnId?: string | null;
  },
): Promise<StoreCreditRow> {
  const amount = clpPesos(params.amount);
  if (amount <= 0) throw new HttpError(400, 'El crédito debe ser mayor a cero');
  const barcode = await nextStoreCreditNumberWithClient(client, params.organizationId);
  const redeemCode = newCouponCode();
  const months = params.monthsValid ?? STORE_CREDIT_MONTHS;
  const res = await client.query<StoreCreditRow>(
    `INSERT INTO store_credits (
       organization_id, branch_id, barcode, redeem_code, amount, status,
       issued_at, expires_at, notes, created_by, exchange_return_id
     ) VALUES (
       $1,$2,$3,$4,$5,'open',
       (timezone($6, now()))::date,
       (timezone($6, now()))::date + ($7::int * interval '1 month'),
       $8,$9,$10
     )
     RETURNING id, organization_id, branch_id, barcode, redeem_code, amount::text, status,
               issued_at::text, expires_at::text, sale_id, notes`,
    [
      params.organizationId,
      params.branchId,
      barcode,
      redeemCode,
      amount,
      CHILE_TZ,
      months,
      params.notes ?? null,
      params.userId,
      params.exchangeReturnId ?? null,
    ],
  );
  return res.rows[0];
}

export async function findOpenStoreCreditWithClient(
  client: PoolClient,
  params: { organizationId: string; branchId: string; code: string; todayCl: string },
): Promise<StoreCreditRow> {
  const raw = String(params.code ?? '').trim();
  if (!raw) throw new HttpError(400, 'Código de cupón vacío');
  if (isStoreCreditFolio(raw)) {
    throw new HttpError(400, 'El folio CR no es el cupón. Usa el código del comprobante.');
  }
  const code = raw.toUpperCase().replace(/\s+/g, '');
  const res = await client.query<StoreCreditRow>(
    `SELECT id, organization_id, branch_id, barcode, redeem_code, amount::text, status,
            issued_at::text, expires_at::text, sale_id, notes
     FROM store_credits
     WHERE organization_id = $1
       AND branch_id = $2
       AND redeem_code = $3
     FOR UPDATE`,
    [params.organizationId, params.branchId, code],
  );
  const row = res.rows[0];
  if (!row) throw new HttpError(404, 'Cupón no encontrado');
  if (row.status === 'used') throw new HttpError(400, 'Este crédito ya fue usado');
  if (row.status === 'cancelled') throw new HttpError(400, 'Este crédito está anulado');
  if (row.status === 'expired' || row.expires_at < params.todayCl) {
    if (row.status === 'open') {
      await client.query(`UPDATE store_credits SET status = 'expired' WHERE id = $1`, [row.id]);
    }
    throw new HttpError(400, 'Este crédito está vencido');
  }
  if (row.status !== 'open') throw new HttpError(400, 'Este crédito no está disponible');
  return row;
}

/** Marca crédito usado. amount del crédito debe ser ≤ total de la venta. */
export async function redeemStoreCreditWithClient(
  client: PoolClient,
  params: {
    organizationId: string;
    branchId: string;
    storeCreditId: string;
    saleId: string;
    saleTotalBeforeCredit: number;
    todayCl: string;
  },
): Promise<{ credit: StoreCreditRow; discount: number }> {
  const res = await client.query<StoreCreditRow>(
    `SELECT id, organization_id, branch_id, barcode, redeem_code, amount::text, status,
            issued_at::text, expires_at::text, sale_id, notes
     FROM store_credits
     WHERE id = $1 AND organization_id = $2 AND branch_id = $3
     FOR UPDATE`,
    [params.storeCreditId, params.organizationId, params.branchId],
  );
  const row = res.rows[0];
  if (!row) throw new HttpError(404, 'Crédito no encontrado');
  if (row.status === 'used') throw new HttpError(400, 'Este crédito ya fue usado');
  if (row.status !== 'open') throw new HttpError(400, 'Este crédito no está disponible');
  if (row.expires_at < params.todayCl) {
    await client.query(`UPDATE store_credits SET status = 'expired' WHERE id = $1`, [row.id]);
    throw new HttpError(400, 'Este crédito está vencido');
  }
  const amount = clpPesos(row.amount);
  const cartTotal = clpPesos(params.saleTotalBeforeCredit);
  if (amount > cartTotal) {
    throw new HttpError(
      400,
      `El crédito ($${amount.toLocaleString('es-CL')}) es mayor al total del carrito ($${cartTotal.toLocaleString('es-CL')}). No aplica.`,
    );
  }
  await client.query(
    `UPDATE store_credits
     SET status = 'used', sale_id = $2, used_at = now()
     WHERE id = $1`,
    [row.id, params.saleId],
  );
  return { credit: row, discount: amount };
}

export type StoreCreditListRow = {
  id: string;
  barcode: string;
  redeem_code: string | null;
  amount: string;
  status: string;
  issued_at: string;
  expires_at: string;
  notes: string | null;
  voucher_number: string | null;
  quantity: number | null;
  payment_method: string | null;
  price_diff: string | null;
  original_name: string | null;
  original_code: string | null;
  original_size: string | null;
  new_name: string | null;
  new_code: string | null;
  new_size: string | null;
};

export async function listStoreCredits(params: {
  organizationId: string;
  branchId: string;
  status?: 'open' | 'used' | 'expired' | 'cancelled' | 'all';
  q?: string;
}): Promise<StoreCreditListRow[]> {
  const args: unknown[] = [params.organizationId, params.branchId];
  let where = `WHERE sc.organization_id = $1 AND sc.branch_id = $2`;
  const status = params.status && params.status !== 'all' ? params.status : '';
  if (status === 'open') {
    where += ` AND sc.status = 'open' AND sc.expires_at >= (timezone('America/Santiago', now()))::date`;
  } else if (status === 'expired') {
    where += ` AND (sc.status = 'expired' OR (sc.status = 'open' AND sc.expires_at < (timezone('America/Santiago', now()))::date))`;
  } else if (status) {
    args.push(status);
    where += ` AND sc.status = $${args.length}`;
  }
  const q = params.q?.trim();
  if (q) {
    args.push(`%${q}%`);
    const like = args.length;
    args.push(q.toUpperCase().replace(/\s+/g, ''));
    const exact = args.length;
    where += ` AND (sc.barcode ILIKE $${like} OR COALESCE(cv.voucher_number, '') ILIKE $${like} OR sc.redeem_code = $${exact})`;
  }
  const result = await query<StoreCreditListRow>(
    `SELECT sc.id, sc.barcode, sc.redeem_code, sc.amount::text, 
            CASE
              WHEN sc.status = 'open' AND sc.expires_at < (timezone('America/Santiago', now()))::date
                THEN 'expired'
              ELSE sc.status
            END AS status,
            sc.issued_at::text, sc.expires_at::text, sc.notes,
            cv.voucher_number,
            er.quantity,
            er.payment_method,
            er.price_diff::text,
            po.name AS original_name,
            po.internal_code AS original_code,
            po.size_label AS original_size,
            pn.name AS new_name,
            pn.internal_code AS new_code,
            pn.size_label AS new_size
     FROM store_credits sc
     LEFT JOIN exchange_returns er ON er.id = sc.exchange_return_id
     LEFT JOIN change_vouchers cv ON cv.id = er.voucher_id
     LEFT JOIN products po ON po.id = er.original_product_id
     LEFT JOIN products pn ON pn.id = er.new_product_id
     ${where}
     ORDER BY sc.issued_at DESC, sc.barcode DESC
     LIMIT 100`,
    args,
  );
  return result.rows;
}
