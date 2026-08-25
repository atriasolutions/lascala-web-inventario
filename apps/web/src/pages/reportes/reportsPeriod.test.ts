import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePeriod, type ReportsPeriodState } from './reportsPeriod.ts';

function base(partial: Partial<ReportsPeriodState>): ReportsPeriodState {
  return {
    preset: 'this_month',
    day: '2026-08-17',
    month: '2026-08',
    year: '2026',
    from: '2026-08-01',
    to: '2026-08-31',
    ...partial,
  };
}

describe('resolvePeriod', () => {
  it('Mes picker usa primer y último día de ese mes', () => {
    const r = resolvePeriod(base({ preset: 'month', month: '2026-06' }));
    assert.equal(r.from, '2026-06-01');
    assert.equal(r.to, '2026-06-30');
  });

  it('Año completo usa 1 ene–31 dic', () => {
    const r = resolvePeriod(base({ preset: 'year', year: '2025' }));
    assert.equal(r.from, '2025-01-01');
    assert.equal(r.to, '2025-12-31');
  });

  it('Rango respeta from/to elegidos', () => {
    const r = resolvePeriod(
      base({ preset: 'range', from: '2026-06-10', to: '2026-08-17' }),
    );
    assert.equal(r.from, '2026-06-10');
    assert.equal(r.to, '2026-08-17');
  });

  it('Día usa from=to', () => {
    const r = resolvePeriod(base({ preset: 'day', day: '2026-07-04' }));
    assert.equal(r.from, '2026-07-04');
    assert.equal(r.to, '2026-07-04');
  });
});
