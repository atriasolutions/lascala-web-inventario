import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeBrandName, BRAND_TYPO_MAP } from './brands.ts';

describe('normalizeBrandName', () => {
  it('UPPER y colapsa espacios', () => {
    assert.equal(normalizeBrandName('  divine   jeans '), 'DIVINE JEANS');
    assert.equal(normalizeBrandName('zara'), 'ZARA');
  });

  it('merge typos YEANS→JEANS', () => {
    assert.equal(normalizeBrandName('YEANS'), 'JEANS');
    assert.equal(normalizeBrandName('jean'), 'JEANS');
    assert.equal(normalizeBrandName('DivineJeans'), 'DIVINE JEANS');
  });

  it('vacío → null', () => {
    assert.equal(normalizeBrandName(''), null);
    assert.equal(normalizeBrandName('   '), null);
    assert.equal(normalizeBrandName(null), null);
  });

  it('mapa tiene YEANS', () => {
    assert.equal(BRAND_TYPO_MAP.YEANS, 'JEANS');
  });
});
