import { describe, expect, it } from 'vitest';
import { clpExact, sameSalePriceExact } from './exchangePrice';

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
});
