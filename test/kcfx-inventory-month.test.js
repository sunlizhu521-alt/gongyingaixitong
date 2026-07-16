import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_INVENTORY_AGE_BUCKETS,
  LEGACY_INVENTORY_AGE_BUCKETS,
  filterInventoryMonthSummaryRows,
  findInventoryMonthHeaderRowIndex,
  inventoryMonthAgeBuckets
} from '../shared/kcfxInventoryMonth.js';
import { buildInventoryTrendRows, getInventoryRows } from '../src/components/kcfxUtils.js';

const NEW_HEADERS = [
  '库存组织', '物料编码', '物料名称', '仓库', '库存状态', '批号', '货主类型', '货主', '库存单位',
  '数量(库存)', '(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天到90天)数量(库存)',
  '(91天到120天)数量(库存)', '(121天到150天)数量(库存)', '(151天到180天)数量(库存)', '(181天以上)数量(库存)'
];

function rowFrom(headers, values) {
  return Object.assign({ __cells: values }, Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

test('detects row 3 as the new inventory month header', () => {
  const matrix = [
    ['物料范围:全部'],
    ['参考价来源:期初加权平均价'],
    NEW_HEADERS,
    ['组织A', '1001', '产品A', '仓库A']
  ];
  assert.equal(findInventoryMonthHeaderRowIndex(matrix), 2);
});

test('removes only the trailing numeric summary row', () => {
  const detail = rowFrom(NEW_HEADERS, ['组织A', '1001', '产品A', '仓库A', '可用', '', '业务组织', '组织A', '个', 5, 5]);
  const summary = rowFrom(NEW_HEADERS, ['', '', '', '', '', '', '', '', '', 5, 5]);
  assert.deepEqual(filterInventoryMonthSummaryRows([detail, summary]), { rows: [detail], removed: 1 });
  assert.deepEqual(filterInventoryMonthSummaryRows([detail]), { rows: [detail], removed: 0 });
});

test('selects current seven age buckets and keeps the legacy schema readable', () => {
  assert.deepEqual(inventoryMonthAgeBuckets({ rows: [rowFrom(NEW_HEADERS, [])] }), CURRENT_INVENTORY_AGE_BUCKETS);
  assert.deepEqual(inventoryMonthAgeBuckets({ headers: ['物料编码', '物料名称', '仓库名称', '主体名称', '>150天', '合计'] }), LEGACY_INVENTORY_AGE_BUCKETS);
});

test('maps the new inventory month fields and long-age buckets by header', () => {
  const pRow = rowFrom(NEW_HEADERS, ['组织A', '1001', '产品A', '仓库A', '可用', '', '业务组织', '组织A', '个', 5, 0, 0, 0, 0, 0, 5, 0]);
  const qRow = rowFrom(NEW_HEADERS, ['组织B', '1002', '产品B', '仓库B', '可用', '', '业务组织', '组织B', '个', 7, 0, 0, 0, 0, 0, 0, 7]);
  const rows = getInventoryRows({ 'fact-2': { rows: [pRow, qRow] } });
  assert.deepEqual(rows.map(({ materialCode, warehouse, organization, qty, ageGroup }) => ({ materialCode, warehouse, organization, qty, ageGroup })), [
    { materialCode: '1001', warehouse: '仓库A', organization: '组织A', qty: 5, ageGroup: '151-180天' },
    { materialCode: '1002', warehouse: '仓库B', organization: '组织B', qty: 7, ageGroup: '181天以上' }
  ]);
});

test('does not use an inventory age column as a fallback settlement price', () => {
  const product = rowFrom(['物料编码', '名称', 'SKU', '金蝶名称', '分类', '状态', '销售产品线', '销售系列', '结算价(含税)'], ['1001', '', 'SKU-1', '产品A', '', '', '产品线A', '系列A', 100]);
  const inventoryMonth = rowFrom(NEW_HEADERS, ['组织A', '1001', '产品A', '仓库A', '可用', '', '业务组织', '组织A', '个', 5, 0, 0, 0, 0, 0, 999, 0]);
  const trendHeaders = ['库存组织', '物料编码', '物料名称', '仓库名称', '结存数量'];
  const trendRow = rowFrom(trendHeaders, ['组织A', '1001', '产品A', '仓库A', 2]);
  const trendTotal = rowFrom(trendHeaders, ['', '', '合计', '', 2]);
  const rows = buildInventoryTrendRows({
    'fact-2': { rows: [inventoryMonth] },
    'fact-3': { rows: [trendRow, trendTotal] },
    'dim-product': { rows: [product] }
  });
  assert.equal(rows[0].totalValue, 200);
});
