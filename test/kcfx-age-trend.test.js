import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgeTrendMatrix } from '../shared/kcfxAgeTrend.js';

test('age trend matrix includes zero values for missing month buckets', () => {
  const result = buildAgeTrendMatrix([
    { month: '2026-01', ageGroup: '0-30天', qty: 10, amount: 100 },
    { month: '2026-01', ageGroup: '31天以上', qty: 5, amount: 50 },
    { month: '2026-02', ageGroup: '0-30天', qty: 8, amount: 80 },
    { month: '2026-02', ageGroup: '31-60天', qty: 2, amount: 20 }
  ], 'qty');

  assert.deepEqual(result.ageGroups, ['0-30天', '31天以上', '31-60天']);
  assert.deepEqual(result.matrix[1], {
    month: '2026-02',
    values: [
      { ageGroup: '0-30天', value: 8, previousValue: 10, mom: -20 },
      { ageGroup: '31天以上', value: 0, previousValue: 5, mom: -100 },
      { ageGroup: '31-60天', value: 2, previousValue: 0, mom: null }
    ],
    total: 10,
    previousTotal: 15,
    totalMom: -33.33333333333333
  });
});

test('age trend matrix leaves first month and zero bases without a month-over-month percentage', () => {
  const result = buildAgeTrendMatrix([
    { month: '2026-01', ageGroup: '0-30天', qty: 0, amount: 0 },
    { month: '2026-02', ageGroup: '0-30天', qty: 12.4, amount: 100 }
  ], 'qty');

  assert.equal(result.matrix[0].values[0].mom, null);
  assert.equal(result.matrix[1].values[0].mom, null);
  assert.equal(result.matrix[1].totalMom, null);
});
