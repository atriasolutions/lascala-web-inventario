import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyStocktakeDiff, formatTakeLabel, stocktakeAppliedVariance } from './stocktakes.ts';

describe('stocktakes helpers', () => {
  it('formatea correlativo INV sin guión', () => {
    assert.equal(formatTakeLabel(1), 'INV000001');
    assert.equal(formatTakeLabel(77), 'INV000077');
  });

  it('clasifica ok / faltante / sobrante', () => {
    assert.equal(classifyStocktakeDiff(2, 2), 'ok');
    assert.equal(classifyStocktakeDiff(0, 3), 'faltante');
    assert.equal(classifyStocktakeDiff(4, 0), 'sobrante');
  });

  it('neto económico: Conservar anterior no mueve; físico y ajuste sí', () => {
    assert.deepEqual(
      stocktakeAppliedVariance({
        decision: 'keep_system',
        qtyCounted: 0,
        qtySystem: 5,
        qtyOverride: null,
      }),
      { kind: 'ok', units: 0, qtyFinal: 5 },
    );
    assert.deepEqual(
      stocktakeAppliedVariance({
        decision: 'use_physical',
        qtyCounted: 1,
        qtySystem: 4,
        qtyOverride: null,
      }),
      { kind: 'faltante', units: 3, qtyFinal: 1 },
    );
    assert.deepEqual(
      stocktakeAppliedVariance({
        decision: 'adjust',
        qtyCounted: 10,
        qtySystem: 2,
        qtyOverride: 5,
      }),
      { kind: 'sobrante', units: 3, qtyFinal: 5 },
    );
  });
});
