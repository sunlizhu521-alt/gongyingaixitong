import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesOutboundWarehouseTrend, buildWarehouseFlowTrend } from '../shared/kcfxWarehouseTypeTrend.js';

test('warehouse flow trend groups warehouse types in the configured logistics order', () => {
  const rows = [
    { month: '2026-01', warehouseType: '销售供应商仓', qty: 1, amount: 10 },
    { month: '2026-01', warehouseType: '销售海上在途', qty: 2, amount: 20 },
    { month: '2026-01', warehouseType: '销售出库仓', qty: 3, amount: 30 },
    { month: '2026-01', warehouseType: '销售退货拆检仓', qty: 4, amount: 40 },
    { month: '2026-01', warehouseType: '生成材料仓', qty: 5, amount: 50 },
    { month: '2026-01', warehouseType: '生产成品仓', qty: 6, amount: 60 },
    { month: '2026-01', warehouseType: '系统集成仓', qty: 7, amount: 70 },
    { month: '2026-01', warehouseType: '样品展厅仓', qty: 8, amount: 80 },
    { month: '2026-01', warehouseType: '销售售后配件仓', qty: 9, amount: 90 },
    { month: '2026-01', warehouseType: '未分类仓库类型', qty: 10, amount: 100 }
  ];

  const result = buildWarehouseFlowTrend(rows, 'qty', ['2026-01']);

  assert.deepEqual(result.groups.map((group) => group.id), ['forward', 'reverse', 'factory', 'other']);
  assert.deepEqual(result.groups[0].series.map((item) => item.warehouseType), [
    '销售供应商仓',
    '销售海上在途仓',
    '销售出库仓'
  ]);
  assert.deepEqual(result.groups[2].series.map((item) => item.warehouseType), ['生产材料仓', '生产成品仓']);
  assert.deepEqual(result.groups[3].series.map((item) => item.warehouseType), [
    '系统集成仓',
    '样品/展厅仓',
    '销售售后配件仓',
    '未分类仓库类型'
  ]);
  assert.equal(result.groups[0].series[1].values[0].value, 2);
  assert.equal(result.groups[2].series[0].values[0].value, 5);
  assert.equal(result.groups[3].series[1].values[0].value, 8);
  assert.equal(result.groups[3].series[3].dashed, true);
});

test('warehouse flow trend fills missing months and reports new and down states', () => {
  const result = buildWarehouseFlowTrend([
    { month: '2026-02', warehouseType: '销售供应商仓', qty: 10, amount: 100 },
    { month: '2026-01', warehouseType: '销售出库仓', qty: 10, amount: 100 },
    { month: '2026-02', warehouseType: '销售出库仓', qty: 8, amount: 80 }
  ], 'qty', ['2026-01', '2026-02']);
  const supplier = result.groups[0].series[0];
  const outbound = result.groups[0].series[2];

  assert.deepEqual(result.months, ['2026-01', '2026-02']);
  assert.deepEqual(supplier.values, [
    { month: '2026-01', value: 0, previousValue: 0, mom: null },
    { month: '2026-02', value: 10, previousValue: 0, mom: null }
  ]);
  assert.equal(supplier.trendDirection, 'new');
  assert.equal(supplier.trendPercent, null);
  assert.equal(outbound.trendDirection, 'down');
  assert.equal(outbound.trendPercent, -20);
  assert.equal(outbound.values[1].mom, -20);
});

test('warehouse flow trend appends unknown types to other and preserves totals', () => {
  const rows = [
    { month: '2026-01', warehouseType: '销售出库仓', qty: 2, amount: 20 },
    { month: '2026-01', warehouseType: '新仓库类型', qty: 3, amount: 30 },
    { month: '2026-01', warehouseType: '新仓库类型', qty: 4, amount: 40 },
    { month: '2026-02', warehouseType: '', qty: 5, amount: 50 }
  ];
  const qtyResult = buildWarehouseFlowTrend(rows, 'qty', ['2026-01', '2026-02']);
  const amountResult = buildWarehouseFlowTrend(rows, 'amount', ['2026-01', '2026-02']);
  const unknown = qtyResult.groups[3].series.find((item) => item.warehouseType === '新仓库类型');
  const total = (result) => result.groups.reduce((groupTotal, group) => (
    groupTotal + group.series.reduce((seriesTotal, item) => (
      seriesTotal + item.values.reduce((valueTotal, value) => valueTotal + value.value, 0)
    ), 0)
  ), 0);

  assert.equal(unknown.dashed, true);
  assert.equal(unknown.unknown, true);
  assert.deepEqual(unknown.values.map((item) => item.value), [7, 0]);
  assert.equal(total(qtyResult), 14);
  assert.equal(total(amountResult), 140);
});

test('warehouse flow trend appends future months and reports a flat state', () => {
  const result = buildWarehouseFlowTrend([
    { month: '2026-01', warehouseType: '销售出库仓', qty: 10, amount: 100 },
    { month: '2026-07', warehouseType: '销售出库仓', qty: 10, amount: 100 }
  ], 'amount', ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  const outbound = result.groups[0].series[2];

  assert.deepEqual(result.months, [
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'
  ]);
  assert.equal(outbound.trendDirection, 'flat');
  assert.equal(outbound.trendPercent, 0);
});

test('sales outbound warehouse trend includes every warehouse and fills missing months', () => {
  const result = buildSalesOutboundWarehouseTrend([
    { month: '2026-01', warehouse: '出库仓A', qty: 10, amount: 100 },
    { month: '2026-01', warehouse: '出库仓B', qty: 20, amount: 200 },
    { month: '2026-02', warehouse: '出库仓A', qty: 15, amount: 150 },
    { month: '2026-02', warehouse: '出库仓C', qty: 30, amount: 300 }
  ], 'qty', ['2026-01', '2026-02']);

  assert.deepEqual(result.months, ['2026-01', '2026-02']);
  assert.deepEqual(result.series.map((item) => item.warehouseType), ['出库仓C', '出库仓A', '出库仓B']);
  assert.deepEqual(result.series[0].values.map((item) => item.value), [0, 30]);
  assert.deepEqual(result.series[1].values.map((item) => item.value), [10, 15]);
  assert.equal(result.series[1].values[1].mom, 50);
  assert.deepEqual(result.series[2].values.map((item) => item.value), [20, 0]);
});
