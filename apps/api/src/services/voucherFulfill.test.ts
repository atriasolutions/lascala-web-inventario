import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../utils/errors.ts';
import {
  assertExchangeSameSalePrice,
  clpPesos,
  computeExchangePriceDiff,
  voucherStockInMovementType,
} from './voucherFulfill.ts';

describe('clpPesos', () => {
  it('redondea a pesos enteros', () => {
    assert.equal(clpPesos(39990), 39990);
    assert.equal(clpPesos('39990.00'), 39990);
    assert.equal(clpPesos(39990.4), 39990);
    assert.equal(clpPesos(39990.6), 39991);
  });
});

describe('computeExchangePriceDiff', () => {
  it('detecta mismo precio', () => {
    assert.deepEqual(computeExchangePriceDiff(39990, '39990.00'), {
      returned: 39990,
      neu: 39990,
      diff: 0,
    });
  });

  it('detecta prenda más cara (cobrar diferencia)', () => {
    assert.deepEqual(computeExchangePriceDiff(39990, 45990), {
      returned: 39990,
      neu: 45990,
      diff: 6000,
    });
  });

  it('detecta prenda más barata (crédito)', () => {
    assert.deepEqual(computeExchangePriceDiff(45990, 39990), {
      returned: 45990,
      neu: 39990,
      diff: -6000,
    });
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
        return true;
      },
    );
  });
});

describe('voucherStockInMovementType', () => {
  it('devolución reingresa como RETURN_IN', () => {
    assert.equal(voucherStockInMovementType('cash_refund'), 'RETURN_IN');
  });

  it('cambio reingresa la original como EXCHANGE_IN', () => {
    assert.equal(voucherStockInMovementType('exchange'), 'EXCHANGE_IN');
  });
});
