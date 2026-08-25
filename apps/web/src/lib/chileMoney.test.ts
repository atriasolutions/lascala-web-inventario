import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chileMoneyFromNumber,
  formatChileMoneyInput,
  parseChileMoney,
} from './chileMoney.ts';
import { computeMargin } from './margin.ts';

describe('chileMoney', () => {
  it('formatea miles con puntos', () => {
    assert.equal(formatChileMoneyInput('19980'), '19.980');
    assert.equal(formatChileMoneyInput('1.234.567'), '1.234.567');
  });

  it('parsea con o sin puntos', () => {
    assert.equal(parseChileMoney('19.980'), 19980);
    assert.equal(parseChileMoney('19980'), 19980);
    assert.equal(parseChileMoney(''), null);
  });

  it('paste Chile 790.000 no cae a 790', () => {
    assert.equal(formatChileMoneyInput('790.000'), '790.000');
    assert.equal(parseChileMoney('790.000'), 790000);
    assert.notEqual(Number('790.000'), 790000);
  });

  it('round-trip desde número', () => {
    assert.equal(chileMoneyFromNumber(45000), '45.000');
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
