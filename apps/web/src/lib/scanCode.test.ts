import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codesMatch, expandProductCodeVariants, normalizeScanCode } from './scanCode.ts';
import { findPosProductByCode, isPosCatalogSellable, type PosCatalogProduct } from './posCatalogCache.ts';

function sample(partial: Partial<PosCatalogProduct>): PosCatalogProduct {
  return {
    id: '1',
    name: 'Jeans Rojo XL',
    internal_code: 'LS-000009',
    barcode: 'LS-000009',
    sale_price: '9980',
    stock: 45,
    ...partial,
  };
}

describe('scanCode', () => {
  it('normalizes apostrophe from scanners', () => {
    assert.equal(normalizeScanCode("BC'000003"), 'BC000003');
  });

  it('expands BC hyphen variants', () => {
    const keys = expandProductCodeVariants('BC-000003');
    assert.ok(keys.includes('BC000003'));
    assert.ok(keys.includes('BC-000003'));
  });

  it('matches barcode to internal equivalents', () => {
    assert.equal(codesMatch('BC000003', 'BC-000003'), true);
    assert.equal(codesMatch('LS-000009', 'LS000009'), true);
    assert.equal(codesMatch('LS100007', 'LS-100007'), true);
    assert.equal(codesMatch('BC000003', 'LS-000009'), false);
  });

  it('pads short LS for match with stored 6-digit codes', () => {
    assert.equal(codesMatch('LS12', 'LS000012'), true);
    assert.equal(codesMatch('LS-12', 'LS-000012'), true);
  });
});

describe('findPosProductByCode', () => {
  const catalog = [
    sample({}),
    sample({
      id: '2',
      name: 'Vestido',
      internal_code: 'LS-000001',
      barcode: null,
    }),
  ];

  it('finds Jeans by unified code LS-000009', () => {
    const hit = findPosProductByCode(catalog, 'LS-000009');
    assert.equal(hit?.name, 'Jeans Rojo XL');
    assert.equal(hit?.barcode, 'LS-000009');
  });

  it('finds Jeans by LS without hyphen', () => {
    const hit = findPosProductByCode(catalog, 'LS000009');
    assert.equal(hit?.internal_code, 'LS-000009');
  });

  it('still resolves a leftover BC-style barcode if present', () => {
    const leftover = [
      sample({ id: '3', name: 'Legado', internal_code: 'LS-000099', barcode: 'BC000099' }),
    ];
    const hit = findPosProductByCode(leftover, 'BC-000099');
    assert.equal(hit?.name, 'Legado');
  });

  it('finds product without barcode by internal code', () => {
    const hit = findPosProductByCode(catalog, 'LS-000001');
    assert.equal(hit?.name, 'Vestido');
  });
});

describe('isPosCatalogSellable', () => {
  it('hides QA and dummy names', () => {
    assert.equal(isPosCatalogSellable({ name: 'Vestido QA Partial', status: 'available' }), false);
    assert.equal(isPosCatalogSellable({ name: 'barcode line CREATED', status: 'available' }), false);
    assert.equal(isPosCatalogSellable({ name: 'Shape', status: 'available' }), false);
    assert.equal(isPosCatalogSellable({ name: 'Blusa seda ivory', status: 'archived' }), false);
    assert.equal(isPosCatalogSellable({ name: 'Blusa seda ivory', status: 'available' }), true);
  });
});
