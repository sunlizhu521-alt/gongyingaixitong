import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDimensionTrendMatrix } from '../shared/kcfxDimensionTrend.js';

test('builds a complete monthly matrix with zero fill and month over month values', () => {
  const result = buildDimensionTrendMatrix([
    { month: '2026-01', name: '事业部A', qty: 10, amount: 100 },
    { month: '2026-03', name: '事业部A', qty: 15, amount: 180 },
    { month: '2026-02', name: '事业部B', qty: 4, amount: 40 }
  ], 'amount', ['2026-01', '2026-02', '2026-03']);

  assert.deepEqual(result.months, ['2026-01', '2026-02', '2026-03']);
  assert.equal(result.rows[0].name, '事业部A');
  assert.deepEqual(result.rows[0].values.map((item) => item.value), [100, 0, 180]);
  assert.equal(result.rows[0].values[0].mom, null);
  assert.equal(result.rows[0].values[1].mom, -100);
  assert.equal(result.rows[0].values[2].mom, null);
});

test('sorts by the latest selected metric and keeps amount and quantity independent', () => {
  const rows = [
    { month: '2026-06', name: '系列A', qty: 50, amount: 100 },
    { month: '2026-06', name: '系列B', qty: 10, amount: 500 }
  ];

  assert.deepEqual(
    buildDimensionTrendMatrix(rows, 'amount').rows.map((row) => row.name),
    ['系列B', '系列A']
  );
  assert.deepEqual(
    buildDimensionTrendMatrix(rows, 'qty').rows.map((row) => row.name),
    ['系列A', '系列B']
  );
});

test('paginates all categories at twenty rows and clamps invalid pages', () => {
  const rows = Array.from({ length: 45 }, (_, index) => ({
    month: '2026-06',
    name: `系列${String(index + 1).padStart(2, '0')}`,
    qty: index + 1,
    amount: index + 1
  }));
  const first = buildDimensionTrendMatrix(rows, 'qty', [], { page: 1, pageSize: 20 });
  const second = buildDimensionTrendMatrix(rows, 'qty', [], { page: 2, pageSize: 20 });
  const last = buildDimensionTrendMatrix(rows, 'qty', [], { page: 99, pageSize: 20 });

  assert.equal(first.totalRows, 45);
  assert.equal(first.totalPages, 3);
  assert.equal(first.rows.length, 20);
  assert.equal(second.rows.length, 20);
  assert.equal(last.page, 3);
  assert.equal(last.rows.length, 5);
  assert.equal(new Set([...first.rows, ...second.rows, ...last.rows].map((row) => row.name)).size, 45);
});

test('automatically appends future months supplied by the API', () => {
  const result = buildDimensionTrendMatrix(
    [{ month: '2026-07', name: '产品线A', qty: 1, amount: 2 }],
    'qty',
    ['2026-01', '2026-06']
  );
  assert.deepEqual(result.months, ['2026-01', '2026-06', '2026-07']);
  assert.deepEqual(result.rows[0].values.map((item) => item.value), [0, 0, 1]);
});
