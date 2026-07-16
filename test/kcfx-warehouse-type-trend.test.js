import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWarehouseTypeTrendMatrix } from '../shared/kcfxWarehouseTypeTrend.js';

test('warehouse type trend fills missing months and calculates month-over-month values', () => {
  const result = buildWarehouseTypeTrendMatrix([
    { month: '2026-01', warehouseType: '销售出库仓', qty: 10, amount: 100 },
    { month: '2026-02', warehouseType: '销售出库仓', qty: 8, amount: 80 },
    { month: '2026-01', warehouseType: '生产成品仓', qty: 5, amount: 50 }
  ], 'qty', ['2026-01', '2026-02']);

  assert.deepEqual(result.months, ['2026-01', '2026-02']);
  assert.deepEqual(result.warehouseTypes, ['销售出库仓', '生产成品仓']);
  assert.deepEqual(result.matrix[0].values[1], {
    month: '2026-02',
    value: 8,
    previousValue: 10,
    mom: -20
  });
  assert.deepEqual(result.matrix[1].values[1], {
    month: '2026-02',
    value: 0,
    previousValue: 5,
    mom: -100
  });
});

test('warehouse type trend sorts by the latest value for the selected mode', () => {
  const rows = [
    { month: '2026-01', warehouseType: '类型A', qty: 100, amount: 10 },
    { month: '2026-02', warehouseType: '类型A', qty: 1, amount: 100 },
    { month: '2026-01', warehouseType: '类型B', qty: 1, amount: 100 },
    { month: '2026-02', warehouseType: '类型B', qty: 10, amount: 10 }
  ];

  assert.deepEqual(buildWarehouseTypeTrendMatrix(rows, 'qty').warehouseTypes, ['类型B', '类型A']);
  assert.deepEqual(buildWarehouseTypeTrendMatrix(rows, 'amount').warehouseTypes, ['类型A', '类型B']);
});
