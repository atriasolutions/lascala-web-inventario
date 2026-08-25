import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { saleDocLookupKind } from './inventory.ts';
import { pickVoucherForSaleLookup } from './voucherLookup.ts';

describe('saleDocLookupKind', () => {
  it('VC es ticket concreto, V es venta', () => {
    assert.equal(saleDocLookupKind('VC-000095'), 'voucher');
    assert.equal(saleDocLookupKind('VC000095'), 'voucher');
    assert.equal(saleDocLookupKind('V-000077'), 'sale');
    assert.equal(saleDocLookupKind('V-D000056'), 'sale');
  });
});

describe('pickVoucherForSaleLookup', () => {
  const a = { status: 'used', internal_code: 'LS-100001', barcode: null };
  const b = { status: 'open', internal_code: 'LS-100002', barcode: 'LS100002' };

  it('no cae en el usado si queda un hermano vigente', () => {
    const pick = pickVoucherForSaleLookup([a, b], []);
    assert.equal(pick.result, 'picked');
    if (pick.result === 'picked') assert.equal(pick.index, 1);
  });

  it('pide prenda si hay dos vigentes', () => {
    const pick = pickVoucherForSaleLookup(
      [
        { status: 'open', internal_code: 'LS-100001', barcode: null },
        { status: 'open', internal_code: 'LS-100002', barcode: null },
      ],
      [],
    );
    assert.equal(pick.result, 'need_garment');
    if (pick.result === 'need_garment') assert.equal(pick.openCount, 2);
  });

  it('con prenda elige el voucher de esa línea', () => {
    const pick = pickVoucherForSaleLookup([a, b], ['LS-100002', 'LS100002']);
    assert.equal(pick.result, 'picked');
    if (pick.result === 'picked') assert.equal(pick.index, 1);
  });

  it('prenda usada no tapa al hermano vigente', () => {
    const pick = pickVoucherForSaleLookup([a, b], ['LS-100001']);
    assert.equal(pick.result, 'garment_used');
    if (pick.result === 'garment_used') assert.equal(pick.openSiblings, 1);
  });

  it('todos usados', () => {
    const pick = pickVoucherForSaleLookup(
      [
        { status: 'used', internal_code: 'LS-1', barcode: null },
        { status: 'used', internal_code: 'LS-2', barcode: null },
      ],
      [],
    );
    assert.equal(pick.result, 'all_closed');
  });
});
