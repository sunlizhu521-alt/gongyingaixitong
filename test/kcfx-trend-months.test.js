import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INVENTORY_TREND_MONTHS, KCFX_TREND_SCHEMA_VERSION } from '../shared/kcfxTrendMonths.js';
import { allocateInventoryTrendAge, buildInventoryTrendAgeLookup, UNMATCHED_INVENTORY_AGE_BUCKET } from '../shared/kcfxTrendAge.js';
import { formatMonthOverMonth, monthOverMonthPercent } from '../src/components/kcfxUtils.js';

const CURRENT_HEADERS = [
  '库存组织', '物料编码', '物料名称', '仓库', '库存状态', '批号', '货主类型', '货主', '库存单位',
  '数量(库存)', '(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天到90天)数量(库存)',
  '(91天到120天)数量(库存)', '(121天到150天)数量(库存)', '(151天到180天)数量(库存)', '(181天以上)数量(库存)'
];

function rowFrom(headers, values) {
  return Object.assign({ __cells: values }, Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

test('inventory trend month slots cover January through December', () => {
  assert.equal(KCFX_TREND_SCHEMA_VERSION, 6);
  assert.equal(INVENTORY_TREND_MONTHS.length, 12);
  assert.deepEqual(INVENTORY_TREND_MONTHS[5], { id: 'fact-8', label: '6月' });
  assert.deepEqual(INVENTORY_TREND_MONTHS[11], { id: 'fact-14', label: '12月' });
});

test('inventory trend month-over-month labels handle increases, decreases and missing bases', () => {
  assert.equal(formatMonthOverMonth(monthOverMonthPercent(110, 100)), '+10.00%');
  assert.equal(formatMonthOverMonth(monthOverMonthPercent(90, 100)), '-10.00%');
  assert.equal(formatMonthOverMonth(monthOverMonthPercent(100, 100)), '0.00%');
  assert.equal(formatMonthOverMonth(monthOverMonthPercent(100, 0)), '--');
  assert.equal(formatMonthOverMonth(null), '--');
});

test('inventory trend age allocation preserves quantity and value totals', () => {
  const inventoryRow = rowFrom(CURRENT_HEADERS, [
    '组织A', '1001', '产品A', '仓库A', '', '', '', '', '', 5,
    2, 3, 0, 0, 0, 0, 0
  ]);
  const lookup = buildInventoryTrendAgeLookup({ rows: [inventoryRow] });
  const allocations = allocateInventoryTrendAge(lookup, {
    organization: '组织A', warehouse: '仓库A', materialCode: '1001', qty: 10, value: 100
  });
  assert.deepEqual(allocations, [
    { ageGroup: '0-30天', qty: 4, value: 40 },
    { ageGroup: '31-60天', qty: 6, value: 60 }
  ]);
  assert.equal(allocations.reduce((total, row) => total + row.qty, 0), 10);
  assert.equal(allocations.reduce((total, row) => total + row.value, 0), 100);
});

test('inventory trend age allocation supports legacy fallback and unmatched rows', () => {
  const legacyHeaders = ['物料编码', '物料名称', 'SKU', '仓库名称', '库存数量', '>150天'];
  const legacyRow = rowFrom(legacyHeaders, ['1002', '产品B', 'SKU-2', '仓库B', 7, 7]);
  const lookup = buildInventoryTrendAgeLookup({ rows: [legacyRow] });
  assert.deepEqual(allocateInventoryTrendAge(lookup, {
    organization: '任意组织', warehouse: '仓库B', materialCode: '1002', qty: 7, value: 70
  }), [{ ageGroup: '150天以上', qty: 7, value: 70 }]);
  assert.deepEqual(allocateInventoryTrendAge(lookup, {
    organization: '组织C', warehouse: '仓库C', materialCode: '1003', qty: 8, value: 80
  }), [{ ageGroup: UNMATCHED_INVENTORY_AGE_BUCKET, qty: 8, value: 80 }]);
});

test('inventory trend worker uses localized unmatched labels', async () => {
  const source = await readFile(new URL('../server/kcfx-trend-summary-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Unmatched department/);
  assert.match(source, /未匹配事业部/);
  assert.match(source, /departmentMissingRows/);
  assert.match(source, /skuByMaterial/);
});
