import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  barcodeSafeCode,
  buildChangeTickets,
  resolveAccessScanCode,
  type SalePrintItem,
  type SalePrintSale,
  type SalePrintVoucher,
} from './salePrint.ts';

const sale: SalePrintSale = {
  receipt_number: 'V000077',
  total: '10000',
  discount: '0',
  sold_at: '2026-08-20T15:00:00.000Z',
  seller_name: 'Ana',
  pos_name: 'Caja 1',
  notes: null,
};

function item(partial: Partial<SalePrintItem> & Pick<SalePrintItem, 'id' | 'product_id'>): SalePrintItem {
  return {
    name: 'Jeans',
    internal_code: 'LS100004',
    barcode: 'LS100004',
    quantity: 1,
    unit_price: '29980',
    line_total: '29980',
    allows_exchange: true,
    allows_return: true,
    ...partial,
  };
}

describe('barcodeSafeCode', () => {
  it('quita guiones', () => {
    assert.equal(barcodeSafeCode('VC-000095'), 'VC000095');
    assert.equal(barcodeSafeCode('V-D000056'), 'VD000056');
    assert.equal(barcodeSafeCode('LS-100007'), 'LS100007');
  });
});

describe('buildChangeTickets', () => {
  it('usa solo el n° de ticket, sin sufijo -1/-2', () => {
    const vouchers: SalePrintVoucher[] = [
      {
        id: 'v1',
        sale_item_id: 'si1',
        product_id: 'p1',
        voucher_number: 'VC-000094',
        expires_at: '2026-08-27',
        conditions: null,
        product_name: 'Jeans',
        internal_code: 'LS-100004',
        barcode: 'LS-100004',
        size_label: 'M',
        color: 'Azul',
      },
    ];
    const tickets = buildChangeTickets(
      sale,
      [item({ id: 'si1', product_id: 'p1', quantity: 3 })],
      vouchers,
    );
    assert.equal(tickets.length, 3);
    for (const t of tickets) {
      assert.equal(t.voucherNumber, 'VC000094');
      assert.equal(resolveAccessScanCode(t), 'VC000094');
      assert.equal(t.voucherNumber.includes('-'), false);
    }
  });

  it('sin voucher usa receipt sin guión ni correlativo inventado', () => {
    const tickets = buildChangeTickets(
      { ...sale, receipt_number: 'V-000019' },
      [item({ id: 'si2', product_id: 'p2', quantity: 2 })],
      [],
    );
    assert.equal(tickets.length, 2);
    assert.equal(tickets[0]!.voucherNumber, 'V000019');
    assert.equal(tickets[1]!.voucherNumber, 'V000019');
  });
});
