import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chileMoneyFromNumber,
  digitsOnlyMoney,
  formatChileMoneyInput,
  parseChileMoney,
} from './chileMoney.ts';
import { computeMargin } from './margin.ts';

describe('chileMoney', () => {
  it('formatea miles con puntos', () => {
    assert.equal(formatChileMoneyInput('19980'), '19.980');
    assert.equal(formatChileMoneyInput('1.234.567'), '1.234.567');
  });

  it('parsea con o sin puntos Chile', () => {
    assert.equal(parseChileMoney('19.980'), 19980);
    assert.equal(parseChileMoney('12.990'), 12990);
    assert.equal(parseChileMoney('19980'), 19980);
    assert.equal(parseChileMoney(''), null);
  });

  it('paste Chile 790.000 no cae a 790', () => {
    assert.equal(formatChileMoneyInput('790.000'), '790.000');
    assert.equal(parseChileMoney('790.000'), 790000);
    assert.notEqual(Number('790.000'), 790000);
  });

  it('no multiplica ×100 decimales SQL/JSON (12990.00)', () => {
    assert.equal(digitsOnlyMoney('12990.00'), '12990');
    assert.equal(parseChileMoney('12990.00'), 12990);
    assert.equal(chileMoneyFromNumber('12990.00'), '12.990');
    assert.equal(chileMoneyFromNumber('25980.00'), '25.980');
    assert.notEqual(parseChileMoney('12990.00'), 1299000);
  });

  it('round-trip compra: 12.990 → número → input → display', () => {
    const typed = '12.990';
    const saved = parseChileMoney(typed);
    assert.equal(saved, 12990);
    // API numeric::text típico
    const fromApi = `${saved}.00`;
    assert.equal(chileMoneyFromNumber(fromApi), '12.990');
    assert.equal(parseChileMoney(fromApi), 12990);
    // sugerido 2×
    assert.equal(chileMoneyFromNumber(Math.round((saved ?? 0) * 2)), '25.980');
  });

  it('edición a medias no interpreta 13.50 como decimal SQL', () => {
    // "13.500" (13500) → borrar un dígito → "13.50" NO debe virar a 14
    assert.equal(formatChileMoneyInput('13.50'), '1.350');
    assert.equal(formatChileMoneyInput('13.5'), '135');
    assert.equal(parseChileMoney('13.500'), 13500);
  });

  it('round-trip desde número', () => {
    assert.equal(chileMoneyFromNumber(45000), '45.000');
    assert.equal(chileMoneyFromNumber(12990), '12.990');
  });
});

describe('computeMargin', () => {
  it('margen 100% sobre costo cuando venta = 2×', () => {
    const m = computeMargin(10000, 20000);
    assert.ok(m);
    assert.equal(m.amount, 10000);
    assert.equal(m.markupPct, 100);
    assert.equal(m.isLow, false);
  });

  it('alerta si venta &lt; 1.5× costo', () => {
    const m = computeMargin(10000, 14000);
    assert.ok(m);
    assert.equal(m.isLow, true);
  });
});
