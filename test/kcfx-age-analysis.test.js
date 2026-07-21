import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  INVENTORY_AGE_MONTHS,
  latestInventoryAgeSlotId
} from '../shared/kcfxAgeMonths.js';
import {
  inventoryMonthAgeBuckets,
  inventoryMonthAgeQuantity
} from '../shared/kcfxInventoryMonth.js';
import {
  ageAnalysisDepartmentMissingRows,
  buildAgeAnalysisCache,
  exportAgeAnalysisRows,
  queryAgeAnalysis
} from '../server/kcfx-age-analysis.js';

function rowFrom(headers, values) {
  return Object.assign(
    { __cells: values },
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  );
}

const BASE_HEADERS = [
  '库存组织',
  '物料编码',
  '物料名称',
  '仓库',
  '库存状态',
  '批号',
  '货主类型',
  '货主',
  '库存单位',
  '数量(库存)'
];

test('inventory age slots cover the fixed 2026 calendar year', () => {
  assert.equal(INVENTORY_AGE_MONTHS.length, 12);
  assert.deepEqual(INVENTORY_AGE_MONTHS[0], {
    id: 'inventory-age-2026-01',
    year: 2026,
    monthNumber: 1,
    month: '2026-01',
    label: '2026年1月'
  });
  assert.equal(INVENTORY_AGE_MONTHS[11].id, 'inventory-age-2026-12');
});

test('selects the latest successful inventory age record and falls back to fact-2', () => {
  assert.equal(latestInventoryAgeSlotId({
    'fact-2': { rowCount: 10 },
    'inventory-age-2026-05': { rowCount: 20 },
    'inventory-age-2026-06': { rowCount: 0 },
    'inventory-age-2026-07': { rowCount: 30, parseStatus: 'failed' }
  }), 'fact-2');
  assert.equal(latestInventoryAgeSlotId({ 'fact-2': { rowCount: 10 } }), 'fact-2');
  assert.equal(latestInventoryAgeSlotId({
    'fact-2': { rowCount: 10 },
    'inventory-age-2026-06': { rowCount: 20 }
  }), 'inventory-age-2026-06');
  assert.equal(latestInventoryAgeSlotId({
    'fact-2': { rowCount: 10 },
    'inventory-age-2026-07': { rowCount: 20 }
  }), 'inventory-age-2026-07');
});

test('detects each historical month final age bucket without splitting it', () => {
  const cases = [
    [['(0天到30天)数量(库存)', '(31天以上)数量(库存)'], ['0-30天', '31天以上']],
    [['(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天以上)数量(库存)'], ['0-30天', '31-60天', '61天以上']],
    [['(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天到90天)数量(库存)', '(91天以上)数量(库存)'], ['0-30天', '31-60天', '61-90天', '91天以上']],
    [['(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天到90天)数量(库存)', '(91天到120天)数量(库存)', '(121天以上)数量(库存)'], ['0-30天', '31-60天', '61-90天', '91-120天', '121天以上']],
    [['(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天到90天)数量(库存)', '(91天到120天)数量(库存)', '(121天到150天)数量(库存)', '(151天以上)数量(库存)'], ['0-30天', '31-60天', '61-90天', '91-120天', '121-150天', '151天以上']],
    [['(0天到30天)数量(库存)', '(31天到60天)数量(库存)', '(61天到90天)数量(库存)', '(91天到120天)数量(库存)', '(121天到150天)数量(库存)', '(151天到180天)数量(库存)', '(181天以上)数量(库存)'], ['0-30天', '31-60天', '61-90天', '91-120天', '121-150天', '151-180天', '181天以上']]
  ];

  for (const [ageHeaders, expected] of cases) {
    const headers = [...BASE_HEADERS, ...ageHeaders];
    const row = rowFrom(headers, [...Array(BASE_HEADERS.length).fill(''), ...ageHeaders.map((_, index) => index + 1)]);
    assert.deepEqual(inventoryMonthAgeBuckets({ rows: [row] }), expected);
    expected.forEach((bucket, index) => assert.equal(inventoryMonthAgeQuantity(row, bucket), index + 1));
  }
});

test('builds, filters, paginates and exports age analysis rows', () => {
  const headers = [...BASE_HEADERS, '(0天到30天)数量(库存)', '(31天以上)数量(库存)'];
  const januaryRows = [
    rowFrom(headers, ['组织A', '1001', '产品A', '仓库A', '可用', '', '', '', '个', 5, 2, 3]),
    rowFrom(headers, ['组织A', '1002', '产品B', '仓库B', '可用', '', '', '', '个', 4, 4, 0])
  ];
  const februaryRows = [
    rowFrom(headers, ['组织A', '1001', '产品A', '仓库A', '可用', '', '', '', '个', 6, 1, 5])
  ];
  const records = {
    'inventory-age-2026-01': { id: 'inventory-age-2026-01', rows: januaryRows, rowCount: 2 },
    'inventory-age-2026-02': { id: 'inventory-age-2026-02', rows: februaryRows, rowCount: 1 },
    'dim-product': {
      rows: [
        rowFrom(['物料编码', '名称', 'SKU', '金蝶名称', '分类', '状态', '销售产品线', '销售系列', '', '结算价'], ['1001', '', 'SKU-1', '产品A', '', '', '产品线A', '系列A', '', 10]),
        rowFrom(['物料编码', '名称', 'SKU', '金蝶名称', '分类', '状态', '销售产品线', '销售系列', '', '结算价'], ['1002', '', 'SKU-2', '产品B', '', '', '产品线B', '系列B', '', 20])
      ]
    },
    'dim-warehouse': {
      rows: [
        rowFrom(['', '仓库名称', '', '', '', '', '仓库类型', '仓库位置'], ['', '仓库A', '', '', '', '', '销售出库仓', '国内']),
        rowFrom(['', '仓库名称', '', '', '', '', '仓库类型', '仓库位置'], ['', '仓库B', '', '', '', '', '生产成品仓', '海外'])
      ]
    },
    'dim-warehouse-material': {
      rows: [
        rowFrom(['', '', '', '', '', '匹配键', '事业部'], ['', '', '', '', '', '组织A仓库A1001', '事业部A']),
        rowFrom(['', '', '', '', '', '匹配键', '事业部'], ['', '', '', '', '', '组织A仓库B1002', '事业部B'])
      ]
    }
  };
  const cache = buildAgeAnalysisCache(records, 'saved-at');
  assert.equal(cache.rows.length, 5);
  assert.equal(cache.activeRecordId, 'inventory-age-2026-02');

  const result = queryAgeAnalysis(cache, {
    filters: { month: ['2026-02'], department: ['事业部A'] },
    page: 1,
    pageSize: 1
  });
  assert.equal(result.metrics.qty, 6);
  assert.equal(result.metrics.amount, 60);
  assert.equal(result.pagination.totalRows, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.metrics.comparisonMonth, '2026-01');
  assert.equal(result.metrics.qtyMom, 20);
  assert.equal(result.metrics.amountMom, 20);
  assert.deepEqual(result.dimensionTrends.department, [
    { month: '2026-01', monthLabel: '2026年1月', name: '事业部A', qty: 5, amount: 50 },
    { month: '2026-02', monthLabel: '2026年2月', name: '事业部A', qty: 6, amount: 60 }
  ]);
  assert.deepEqual(result.dimensionTrends.productLine, [
    { month: '2026-01', monthLabel: '2026年1月', name: '产品线A', qty: 5, amount: 50 },
    { month: '2026-02', monthLabel: '2026年2月', name: '产品线A', qty: 6, amount: 60 }
  ]);
  assert.deepEqual(result.dimensionTrends.productSeries, [
    { month: '2026-01', monthLabel: '2026年1月', name: '系列A', qty: 5, amount: 50 },
    { month: '2026-02', monthLabel: '2026年2月', name: '系列A', qty: 6, amount: 60 }
  ]);
  const panorama = queryAgeAnalysis(cache, {});
  const monthOnly = queryAgeAnalysis(cache, { filters: { month: ['2026-02'] } });
  assert.deepEqual(monthOnly.dimensionTrends, panorama.dimensionTrends);
  for (const dimensionRows of Object.values(panorama.dimensionTrends)) {
    for (const trendRow of panorama.trend) {
      const sameMonthRows = dimensionRows.filter((row) => row.month === trendRow.month);
      assert.equal(sameMonthRows.reduce((total, row) => total + row.qty, 0), trendRow.qty);
      assert.equal(sameMonthRows.reduce((total, row) => total + row.amount, 0), trendRow.amount);
    }
  }
  const searchedDimensions = queryAgeAnalysis(cache, { search: '产品B' });
  assert.equal(searchedDimensions.dimensionTrends.department.length, 1);
  assert.equal(searchedDimensions.dimensionTrends.productLine[0].name, '产品线B');
  assert.equal(searchedDimensions.dimensionTrends.productSeries[0].name, '系列B');
  assert.deepEqual(result.ageTrend, panorama.ageTrend);
  assert.deepEqual(result.warehouseTypeTrend, panorama.warehouseTypeTrend);
  assert.deepEqual(result.salesOutboundWarehouseLocationTrend, panorama.salesOutboundWarehouseLocationTrend);
  assert.deepEqual(panorama.salesOutboundWarehouseLocationTrend, [
    { month: '2026-01', monthLabel: '2026年1月', warehouseLocation: '国内', qty: 5, amount: 50 },
    { month: '2026-02', monthLabel: '2026年2月', warehouseLocation: '国内', qty: 6, amount: 60 }
  ]);
  const allWarehouseTypes = queryAgeAnalysis(cache, {
    filters: { month: ['2026-02'], warehouseType: ['生产成品仓'] }
  });
  assert.deepEqual(allWarehouseTypes.ageTrend, panorama.ageTrend);
  assert.deepEqual(allWarehouseTypes.warehouseTypeTrend, panorama.warehouseTypeTrend);
  assert.deepEqual(allWarehouseTypes.salesOutboundWarehouseLocationTrend, panorama.salesOutboundWarehouseLocationTrend);
  assert.equal(allWarehouseTypes.warehouseTypeTrend.reduce((total, row) => total + row.qty, 0), 15);
  assert.equal(allWarehouseTypes.warehouseTypeTrend.reduce((total, row) => total + row.amount, 0), 190);
  const departmentWarehouseTypes = queryAgeAnalysis(cache, {
    filters: { month: ['2026-02'], warehouseType: ['生产成品仓'], department: ['事业部A'] }
  });
  assert.deepEqual(departmentWarehouseTypes.ageTrend, panorama.ageTrend);
  assert.deepEqual(departmentWarehouseTypes.warehouseTypeTrend, panorama.warehouseTypeTrend);
  assert.deepEqual(departmentWarehouseTypes.salesOutboundWarehouseLocationTrend, panorama.salesOutboundWarehouseLocationTrend);
  const searchedWarehouseTypes = queryAgeAnalysis(cache, { search: '产品B' });
  assert.deepEqual(searchedWarehouseTypes.ageTrend, panorama.ageTrend);
  assert.deepEqual(searchedWarehouseTypes.warehouseTypeTrend, panorama.warehouseTypeTrend);
  assert.deepEqual(searchedWarehouseTypes.salesOutboundWarehouseLocationTrend, panorama.salesOutboundWarehouseLocationTrend);
  assert.equal(exportAgeAnalysisRows(cache, {
    filters: { month: ['2026-01'], department: ['事业部A'] }
  }).length, 2);
});

test('uses fact-2 as the June analysis source until the June slot is uploaded', () => {
  const headers = [...BASE_HEADERS, '(0天到30天)数量(库存)', '(181天以上)数量(库存)'];
  const cache = buildAgeAnalysisCache({
    'fact-2': {
      id: 'fact-2',
      rows: [rowFrom(headers, ['组织A', '1001', '产品A', '仓库A', '可用', '', '', '', '个', 6, 4, 2])],
      rowCount: 1
    }
  }, 'saved-at');
  assert.equal(cache.activeRecordId, 'inventory-age-2026-06');
  assert.equal(cache.monthSummaries.length, 1);
  assert.equal(cache.monthSummaries[0].month, '2026-06');
  assert.equal(cache.monthSummaries[0].sourceQty, 6);
  assert.equal(cache.monthSummaries[0].expandedQty, 6);
});

test('groups every unmatched age-analysis row for the error report without double counting age buckets', () => {
  const rows = [
    {
      month: '2026-05',
      monthLabel: '2026年5月',
      organization: '组织A',
      warehouse: '仓库A',
      materialCode: '1001',
      sku: 'SKU-1',
      materialName: '产品A',
      department: '未匹配事业部',
      ageGroup: '0-30天',
      qty: 2
    },
    {
      month: '2026-05',
      monthLabel: '2026年5月',
      organization: '组织A',
      warehouse: '仓库A',
      materialCode: '1001',
      sku: 'SKU-1',
      materialName: '产品A',
      department: '未匹配事业部',
      ageGroup: '31-60天',
      qty: 3
    },
    {
      month: '2026-06',
      monthLabel: '2026年6月',
      organization: '组织A',
      warehouse: '仓库A',
      materialCode: '1001',
      department: '事业部A',
      ageGroup: '0-30天',
      qty: 9
    }
  ];

  assert.deepEqual(ageAnalysisDepartmentMissingRows({ rows }), [{
    month: '2026-05',
    monthLabel: '2026年5月',
    organization: '组织A',
    warehouse: '仓库A',
    materialCode: '1001',
    sku: 'SKU-1',
    materialName: '产品A',
    qty: 5,
    reason: '有库存仓库物料事业部对照表没有信息'
  }]);
});

test('orders department and age filter options by the business sequence', () => {
  const departments = ['其他事业部B', '品牌市场部', '海外事业二部', '国内事业部', '全球招商部', '海外事业一部', '其他事业部A'];
  const ageGroups = ['181天以上', '121-150天', '31-60天', '0-30天', '151-180天', '91-120天', '61-90天', '31天以上'];
  const rows = departments.flatMap((department, departmentIndex) => ageGroups.map((ageGroup, ageIndex) => ({
    id: `${departmentIndex}-${ageIndex}`,
    month: '2026-06',
    warehouseType: '销售出库仓',
    department,
    ageGroup,
    saleStatus: '可售-全新品',
    productCategory: '分类A',
    productLine: '产品线A',
    productSeries: '系列A',
    warehouseLocation: '国内',
    materialCode: `M${departmentIndex}${ageIndex}`,
    warehouse: '仓库A',
    qty: 1,
    amount: 1
  })));

  const result = queryAgeAnalysis({ rows }, {});
  assert.deepEqual(result.options.department, [
    '国内事业部',
    '海外事业一部',
    '海外事业二部',
    '全球招商部',
    '品牌市场部',
    '其他事业部A',
    '其他事业部B'
  ]);
  assert.deepEqual(result.options.ageGroup, [
    '0-30天',
    '31-60天',
    '61-90天',
    '91-120天',
    '121-150天',
    '151-180天',
    '181天以上',
    '31天以上'
  ]);
});

test('server serializes background file parsing to protect library writes', async () => {
  const source = await readFile(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(source, /let kcfxFileParseQueue = Promise\.resolve\(\)/);
  assert.match(source, /kcfxFileParseQueue = kcfxFileParseQueue\s*\.then\(\(\) => parseKcfxStoredFile\(job\)\)/);
});

test('age-analysis department-missing endpoint is protected by the error-page permission', async () => {
  const source = await readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8');
  assert.match(source, /age-analysis\/department-missing/);
  assert.match(source, /getKcfxAgeAnalysisDepartmentMissing\(\)/);
  assert.match(source, /salesInventory\.errors/);
});
