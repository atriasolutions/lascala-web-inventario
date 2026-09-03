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
    assert.equal(normalizeBrandName('DIVINE YEANS'), 'DIVINE JEANS');
    assert.equal(normalizeBrandName('DIVENE JEANS'), 'DIVINE JEANS');
    assert.equal(normalizeBrandName('JULLIETA'), 'JULIETTA');
    assert.equal(normalizeBrandName('LINIATRE'), 'LINEATRE');
    assert.equal(normalizeBrandName('MOHICAN0'), 'MOHICANO');
    assert.equal(normalizeBrandName('SYMPONY'), 'SYMPHONY');
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
