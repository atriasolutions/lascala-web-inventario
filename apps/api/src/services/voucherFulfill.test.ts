import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../utils/errors.ts';
import { assertExchangeSameSalePrice, clpPesos } from './voucherFulfill.ts';

describe('clpPesos', () => {
  it('redondea a pesos enteros', () => {
    assert.equal(clpPesos(39990), 39990);
    assert.equal(clpPesos('39990.00'), 39990);
    assert.equal(clpPesos(39990.4), 39990);
    assert.equal(clpPesos(39990.6), 39991);
  });
});

describe('assertExchangeSameSalePrice', () => {
  it('acepta el mismo precio exacto', () => {
    assert.doesNotThrow(() => assertExchangeSameSalePrice(39990, '39990.00'));
    assert.doesNotThrow(() => assertExchangeSameSalePrice(25000, 25000));
  });

  it('rechaza precio distinto con 400 usable en UI', () => {
    assert.throws(
      () => assertExchangeSameSalePrice(39990, 45990),
      (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.match(err.message, /mismo precio de venta/);
        assert.match(err.message, /39\.990|39990/);
        return true;
      },
    );
  });
});
