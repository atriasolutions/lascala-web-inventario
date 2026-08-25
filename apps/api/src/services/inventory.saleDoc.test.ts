import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expandSaleDocNumberVariants } from './inventory.ts';

describe('expandSaleDocNumberVariants', () => {
  it('acepta boleta demo V-D000056 y variante sin guión', () => {
    const a = new Set(expandSaleDocNumberVariants('V-D000056'));
    const b = new Set(expandSaleDocNumberVariants('VD000056'));
    assert.ok(a.has('V-D000056'));
    assert.ok(a.has('VD000056'));
    assert.ok(b.has('V-D000056'));
    assert.equal(a.has('V-000056'), false);
  });

  it('acepta ticket VC-000019 y VC000019', () => {
    const keys = new Set(expandSaleDocNumberVariants('VC-000019'));
    assert.ok(keys.has('VC-000019'));
    assert.ok(keys.has('VC000019'));
  });

  it('acepta boleta V-000019 y V000019', () => {
    const withHyphen = new Set(expandSaleDocNumberVariants('V-000019'));
    const bare = new Set(expandSaleDocNumberVariants('V000019'));
    assert.ok(withHyphen.has('V-000019'));
    assert.ok(withHyphen.has('V000019'));
    assert.ok(bare.has('V-000019'));
    assert.ok(bare.has('V000019'));
  });

  it('limpia apóstrofe de pistola', () => {
    const keys = new Set(expandSaleDocNumberVariants("V'D000056"));
    assert.ok(keys.has('V-D000056'));
  });
});
