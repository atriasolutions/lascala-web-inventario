import { describe, expect, it } from 'vitest';
import { clpExact, exchangePriceDiff, sameSalePriceExact } from './exchangePrice';

describe('exchangePrice', () => {
  it('redondea a CLP entero', () => {
    expect(clpExact(19990)).toBe(19990);
    expect(clpExact('19990.4')).toBe(19990);
    expect(clpExact('19990.6')).toBe(19991);
  });

  it('exige igualdad exacta de precio', () => {
    expect(sameSalePriceExact(19990, '19990')).toBe(true);
    expect(sameSalePriceExact(19990, 18990)).toBe(false);
    expect(sameSalePriceExact(null, 19990)).toBe(false);
  });

  it('clasifica diferencia de cambio', () => {
    expect(exchangePriceDiff(19990, 19990).kind).toBe('same');
    expect(exchangePriceDiff(19990, 24990)).toEqual({
      returned: 19990,
      neu: 24990,
      diff: 5000,
      kind: 'more_expensive',
    });
    expect(exchangePriceDiff(24990, 19990).kind).toBe('cheaper');
    expect(exchangePriceDiff(24990, 19990).diff).toBe(-5000);
  });
});
