import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addMonths, buildChartBuckets, chartMonthRange, monthStart, seriesGrain } from './chileDate.ts';

describe('chartMonthRange', () => {
  it('un mes seleccionado no rellena 12 meses ajenos', () => {
    const r = chartMonthRange('2026-08-01', '2026-08-31');
    assert.equal(r.chartFrom, '2026-08-01');
    assert.equal(r.chartTo, '2026-08-01');
  });

  it('este año recorta al from, no 12 meses hacia atrás desde to', () => {
    const r = chartMonthRange('2026-01-01', '2026-08-18');
    assert.equal(r.chartFrom, '2026-01-01');
    assert.equal(r.chartTo, '2026-08-01');
  });

  it('un año completo son 12 meses de ese año', () => {
    const r = chartMonthRange('2025-01-01', '2025-12-31');
    assert.equal(r.chartFrom, '2025-01-01');
    assert.equal(r.chartTo, '2025-12-01');
  });

  it('respeta tope de 24 meses', () => {
    const r = chartMonthRange('2020-01-01', '2026-08-01');
    assert.equal(r.chartFrom, addMonths(monthStart('2026-08-01'), -23));
    assert.equal(r.chartTo, '2026-08-01');
  });
});

describe('seriesGrain + buildChartBuckets', () => {
  it('agosto 2026 (31 días) es day con 31 puntos', () => {
    assert.equal(seriesGrain('2026-08-01', '2026-08-31'), 'day');
    const { grain, buckets } = buildChartBuckets('2026-08-01', '2026-08-31');
    assert.equal(grain, 'day');
    assert.equal(buckets.length, 31);
    assert.equal(buckets[0]?.period, '2026-08-01');
    assert.equal(buckets[0]?.label, '1 ago');
    assert.equal(buckets[30]?.period, '2026-08-31');
    assert.equal(buckets[30]?.label, '31 ago');
  });

  it('rango de 2 meses es week', () => {
    assert.equal(seriesGrain('2026-07-01', '2026-08-31'), 'week');
    const { grain, buckets } = buildChartBuckets('2026-07-01', '2026-08-31');
    assert.equal(grain, 'week');
    assert.ok(buckets.length >= 8 && buckets.length <= 10);
    assert.match(buckets[0]?.label ?? '', /jul|ago/);
  });

  it('este año es month dentro de from/to', () => {
    assert.equal(seriesGrain('2026-01-01', '2026-08-18'), 'month');
    const { grain, buckets } = buildChartBuckets('2026-01-01', '2026-08-18');
    assert.equal(grain, 'month');
    assert.equal(buckets.length, 8);
    assert.equal(buckets[0]?.period, '2026-01');
    assert.equal(buckets[7]?.period, '2026-08');
    assert.equal(buckets[7]?.end, '2026-08-18');
  });
});
