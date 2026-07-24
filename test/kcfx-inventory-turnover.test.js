import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildInventoryTurnoverCache,
  exportInventoryTurnoverMissingPriceRows,
  exportInventoryTurnoverRows,
  inventoryTurnoverPeriod,
  queryInventoryTurnover,
  sortInventoryTurnoverChartRows
} from '../server/kcfx-inventory-turnover.js';

function record(rows, id = '') {
  return { id, rows, rowCount: rows.length, savedAt: '2026-07-24T00:00:00.000Z' };
}

function sampleRecords() {
  const records = {
    'dim-product': record([
      { 物料编码: '1001', SKU: 'SKU-1', 金蝶名称: '产品A', 销售产品线: '产品线A', 销售系列: '系列A', 一级分类: '成品', 结算价: 10 },
      { 物料编码: '1002', SKU: 'SKU-2', 金蝶名称: '配件B', 销售产品线: '健康办公', 销售系列: '护理床附件', 一级分类: '成品', 结算价: 20 }
    ]),
    'dim-warehouse': record([
      { 仓库名称: '销售仓', 一级仓库分类: '销售出库仓', 二级仓库分类: '国内' },
      { 仓库名称: '海上仓', 一级仓库分类: '销售海上在途仓', 二级仓库分类: '海上在途' }
    ]),
    'dim-warehouse-material': record([
      { 库存组织: '组织A', 仓库名称: '销售仓', 物料编码: '1001', 事业部: '国内事业部' },
      { 库存组织: '组织A', 仓库名称: '海上仓', 物料编码: '1001', 事业部: '国内事业部' }
    ]),
    'dim-store-name': record([
      { 匹配键: '客户A1001', 销售部门名称: '国内事业部' },
      { 匹配键: '内部客户1001', 销售部门名称: '国内事业部' },
      { 匹配键: '客户A1002', 销售部门名称: '国内事业部' }
    ]),
    'dim-customer-material': record([
      { 客户名称: '客户A', 店铺简称: '店铺A' }
    ]),
    'purchase-order-data': record([
      { 关闭状态: '未关闭', 剩余入库数量: 12, 事业部: '国内事业部*补充说明', 物料编码: '1001' },
      { 关闭状态: '已关闭', 剩余入库数量: 100, 事业部: '国内事业部', 物料编码: '1001' }
    ])
  };
  records['inventory-age-2026-01'] = record([
    { 库存组织: '组织A', 物料编码: '1001', 仓库: '销售仓', '数量(库存)': 60 },
    { 库存组织: '组织A', 物料编码: '1001', 仓库: '海上仓', '数量(库存)': 40 }
  ], 'inventory-age-2026-01');
  records['inventory-age-2026-04'] = record([
    { 库存组织: '组织A', 物料编码: '1001', 仓库: '销售仓', '数量(库存)': 50 },
    { 库存组织: '组织A', 物料编码: '1001', 仓库: '海上仓', '数量(库存)': 30 }
  ], 'inventory-age-2026-04');
  records['sales-data'] = record([
    { 销售日期: '2026-02-05', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 应收数量: 10, 出库数量: 8 },
    { 销售日期: '2026-03-05', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 应收数量: 10, 出库数量: 8 },
    { 销售日期: '2026-04-05', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 应收数量: 10, 出库数量: 8 },
    { 销售日期: '2026-04-06', 客户名称: '杭州国源养老科技有限公司', 物料编码: '1001', 客户物料编码: '内部客户1001', 应收数量: 100, 出库数量: 100 },
    { 销售日期: '2026-04-07', 客户名称: '客户A', 物料编码: '1002', 客户物料编码: '客户A1002', 应收数量: 100, 出库数量: 100 }
  ]);
  return records;
}

test('完整自然月期间正确处理大小月和闰年', () => {
  assert.deepEqual(
    inventoryTurnoverPeriod('2026-04', 3, '2026-01'),
    {
      months: 3,
      maxMonths: 4,
      startMonth: '2026-02',
      endMonth: '2026-04',
      openingTargetMonth: '2026-01',
      startDate: '2026-02-01',
      endDate: '2026-04-30',
      days: 89,
      monthList: ['2026-02', '2026-03', '2026-04']
    }
  );
  assert.equal(inventoryTurnoverPeriod('2024-03', 2, '2024-01').days, 60);
});

test('截止月份筛选使用共同可用月份并让无效月份回退到最新月', () => {
  const records = sampleRecords();
  records['inventory-age-2026-03'] = record([
    { 库存组织: '组织A', 物料编码: '1001', 仓库: '销售仓', '数量(库存)': 55 },
    { 库存组织: '组织A', 物料编码: '1001', 仓库: '海上仓', '数量(库存)': 35 }
  ], 'inventory-age-2026-03');
  const cache = buildInventoryTurnoverCache(records);
  const march = queryInventoryTurnover(cache, { endMonth: '2026-03', periodMonths: 2 });
  assert.equal(march.period.startMonth, '2026-02');
  assert.equal(march.period.endMonth, '2026-03');
  assert.equal(march.period.days, 59);
  assert.deepEqual(march.period.availableEndMonths, ['2026-03', '2026-04']);
  assert.equal(
    exportInventoryTurnoverRows(cache, { endMonth: '2026-03', periodMonths: 2 })[0].period.endMonth,
    '2026-03'
  );
  assert.equal(
    queryInventoryTurnover(cache, { endMonth: '2026-12', periodMonths: 2 }).period.endMonth,
    '2026-04'
  );
});

test('周转图表按固定事业部和产品线业务顺序排列', () => {
  const rows = (names) => names.map((name) => ({ name }));
  assert.deepEqual(
    sortInventoryTurnoverChartRows(rows([
      '其他事业部',
      '销售部-工厂',
      '国内事业部',
      '海外事业二部',
      '全球招商事业部',
      '海外事业一部'
    ]), 'department').map((row) => row.name),
    ['海外事业一部', '海外事业二部', '国内事业部', '全球招商事业部', '销售部-工厂', '其他事业部']
  );
  assert.deepEqual(
    sortInventoryTurnoverChartRows(rows(['销售部-工厂', '全球招商部', '国内事业部']), 'department')
      .map((row) => row.name),
    ['国内事业部', '全球招商部', '销售部-工厂']
  );
  assert.deepEqual(
    sortInventoryTurnoverChartRows(rows([
      '其他/成品',
      '护理床',
      '洗澡椅',
      '移位机',
      '老年代步车',
      '电动轮椅',
      '手动轮椅',
      '防褥疮气床垫',
      '升降椅',
      '手推车',
      '未配置产品线'
    ]), 'productLine').map((row) => row.name),
    ['手推车', '升降椅', '防褥疮气床垫', '手动轮椅', '电动轮椅', '老年代步车', '移位机', '洗澡椅', '护理床', '其他/成品', '未配置产品线']
  );
});

test('在库、在途与未交付库存成本分别计算周转天数', () => {
  const cache = buildInventoryTurnoverCache(sampleRecords(), 'saved-at');
  const result = queryInventoryTurnover(cache, { periodMonths: 3 });
  assert.equal(result.status, 'ready');
  assert.equal(result.period.openingSnapshotMonth, '2026-01');
  assert.equal(result.period.openingApproximate, false);
  assert.equal(result.metrics.openingOnHandInventoryCost, 600);
  assert.equal(result.metrics.openingInTransitInventoryCost, 400);
  assert.equal(result.metrics.closingOnHandInventoryCost, 500);
  assert.equal(result.metrics.closingInTransitInventoryCost, 300);
  assert.equal(result.metrics.averageOnHandInventoryCost, 550);
  assert.equal(result.metrics.averageInTransitInventoryCost, 350);
  assert.equal(result.metrics.monthlyAverageSalesCost, 100);
  assert.equal(result.metrics.periodOperatingCost, 300);
  assert.equal(result.metrics.onHandInventoryTurnoverDays, 89 * (550 / 300));
  assert.equal(result.metrics.inTransitInventoryTurnoverDays, 89 * (350 / 300));
  assert.equal(
    result.metrics.onHandInventoryTurnoverDays + result.metrics.inTransitInventoryTurnoverDays,
    267
  );
  assert.equal(result.metrics.undeliveredQty, 12);
  assert.equal(result.metrics.undeliveredInventoryCost, 120);
  assert.equal(result.metrics.openingUndeliveredInventoryCost, 120);
  assert.equal(result.metrics.closingUndeliveredInventoryCost, 120);
  assert.equal(result.metrics.averageUndeliveredInventoryCost, 120);
  assert.equal(result.metrics.openingInventoryTotalCost, 1120);
  assert.equal(result.metrics.closingInventoryTotalCost, 920);
  assert.equal(result.metrics.averageInventoryTotalCost, 1020);
  assert.equal(result.metrics.outboundQty, 24);
  assert.equal(result.metrics.undeliveredTurnoverDays, 89 * (120 / 300));
  assert.equal(result.metrics.inventoryTotalTurnoverDays, 89 * (1020 / 300));
  assert.ok(Math.abs(
    result.metrics.onHandInventoryTurnoverDays
      + result.metrics.inTransitInventoryTurnoverDays
      + result.metrics.undeliveredTurnoverDays
      - result.metrics.inventoryTotalTurnoverDays
  ) < 1e-9);
  assert.equal(result.metrics.onHandQty, 50);
  assert.equal(result.metrics.inTransitQty, 30);
  assert.equal(result.metrics.inventoryTotalQty, 92);
  assert.equal('inventoryTurnoverDays' in result.metrics, false);
  assert.equal('undeliveredCoverageDays' in result.metrics, false);
  assert.equal(result.rows[0].dataStatus, '完整');
  assert.equal(result.rows[0].productSeries, '系列A');
  assert.equal(result.pagination.pageSize, 20);
  assert.equal(result.rows.length, 1);
  assert.equal(exportInventoryTurnoverRows(cache, { periodMonths: 3 }).length, 1);
});

test('库存段筛选按所选段裁剪成本和未交付库存并保留营业成本分母', () => {
  const cache = buildInventoryTurnoverCache(sampleRecords());
  const onHand = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      inventorySegment: ['在库量'],
      nonInternalTransactionStatus: ['非内部交易'],
      finishedGoodsStatus: ['成品'],
      hasSalesData: ['有销售数据']
    }
  });
  assert.deepEqual(onHand.options.inventorySegment, ['在库量', '在途量', '未交付数量']);
  assert.equal(onHand.metrics.openingOnHandInventoryCost, 600);
  assert.equal(onHand.metrics.openingInTransitInventoryCost, 0);
  assert.equal(onHand.metrics.averageOnHandInventoryCost, 550);
  assert.equal(onHand.metrics.averageInTransitInventoryCost, 0);
  assert.equal(onHand.metrics.undeliveredQty, 0);
  assert.equal(onHand.metrics.onHandQty, 50);
  assert.equal(onHand.metrics.inTransitQty, 0);
  assert.equal(onHand.metrics.inventoryTotalQty, 50);
  assert.equal(onHand.metrics.periodOperatingCost, 300);
  assert.equal(onHand.metrics.outboundQty, 24);

  const inTransit = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      inventorySegment: ['在途量'],
      nonInternalTransactionStatus: ['非内部交易'],
      finishedGoodsStatus: ['成品'],
      hasSalesData: ['有销售数据']
    }
  });
  assert.equal(inTransit.metrics.openingOnHandInventoryCost, 0);
  assert.equal(inTransit.metrics.openingInTransitInventoryCost, 400);
  assert.equal(inTransit.metrics.averageInTransitInventoryCost, 350);
  assert.equal(inTransit.metrics.onHandQty, 0);
  assert.equal(inTransit.metrics.inTransitQty, 30);
  assert.equal(inTransit.metrics.inventoryTotalQty, 30);
  assert.equal(inTransit.metrics.periodOperatingCost, 300);

  const undelivered = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      inventorySegment: ['未交付数量'],
      nonInternalTransactionStatus: ['非内部交易'],
      finishedGoodsStatus: ['成品'],
      hasSalesData: ['有销售数据']
    }
  });
  assert.equal(undelivered.metrics.openingOnHandInventoryCost, 0);
  assert.equal(undelivered.metrics.openingInTransitInventoryCost, 0);
  assert.equal(undelivered.metrics.undeliveredQty, 12);
  assert.equal(undelivered.metrics.undeliveredInventoryCost, 120);
  assert.equal(undelivered.metrics.undeliveredTurnoverDays, 89 * (120 / 300));
  assert.equal(undelivered.metrics.onHandQty, 0);
  assert.equal(undelivered.metrics.inTransitQty, 0);
  assert.equal(undelivered.metrics.inventoryTotalQty, 12);
  assert.equal(undelivered.metrics.periodOperatingCost, 300);
  assert.equal(exportInventoryTurnoverRows(cache, {
    periodMonths: 3,
    filters: {
      inventorySegment: ['未交付数量'],
      nonInternalTransactionStatus: ['非内部交易'],
      finishedGoodsStatus: ['成品'],
      hasSalesData: ['有销售数据']
    }
  }).length, 1);
});

test('缺少严格期初时使用最早库存快照并标记数据不完整', () => {
  const records = sampleRecords();
  records['inventory-age-2026-02'] = record(rowsForMonth(95), 'inventory-age-2026-02');
  records['inventory-age-2026-03'] = record(rowsForMonth(90), 'inventory-age-2026-03');
  records['inventory-age-2026-05'] = record(rowsForMonth(75), 'inventory-age-2026-05');
  records['inventory-age-2026-06'] = record(rowsForMonth(70), 'inventory-age-2026-06');
  records['sales-data'].rows.push(
    { 销售日期: '2026-01-05', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 应收数量: 10, 出库数量: 8 },
    { 销售日期: '2026-05-05', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 应收数量: 10, 出库数量: 8 },
    { 销售日期: '2026-06-05', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 应收数量: 10, 出库数量: 8 }
  );
  const result = queryInventoryTurnover(buildInventoryTurnoverCache(records), { periodMonths: 6 });
  assert.equal(result.period.days, 181);
  assert.equal(result.period.openingTargetMonth, '2025-12');
  assert.equal(result.period.openingSnapshotMonth, '2026-01');
  assert.equal(result.period.openingApproximate, true);
  assert.match(result.metrics.dataStatus, /缺少2025-12期初库存快照/);
});

test('零分母返回空周转天数且缺失结算价标记不完整', () => {
  const records = sampleRecords();
  records['dim-product'].rows[0].结算价 = 0;
  for (const row of records['sales-data'].rows) row.出库数量 = 0;
  const result = queryInventoryTurnover(buildInventoryTurnoverCache(records), { periodMonths: 3 });
  assert.equal(result.metrics.onHandInventoryTurnoverDays, null);
  assert.equal(result.metrics.inTransitInventoryTurnoverDays, null);
  assert.equal(result.metrics.undeliveredTurnoverDays, null);
  assert.ok(result.diagnostics.missingPriceRows > 0);
  assert.match(result.metrics.dataStatus, /期初库存缺少结算价2条/);
  assert.match(result.metrics.dataStatus, /期末库存缺少结算价2条/);
  assert.match(result.metrics.dataStatus, /销售数据缺少结算价3条（物料编码：1001）/);
  assert.match(result.metrics.dataStatus, /采购订单未交付库存缺少结算价1条（物料编码：1001）/);
  assert.match(result.rows[0].dataStatus, /销售数据缺少结算价3条（物料编码：1001）/);
  assert.match(result.rows[0].dataStatus, /采购订单未交付库存缺少结算价1条（物料编码：1001）/);
  assert.deepEqual(result.rows[0].salesMissingPriceMaterialCodes, ['1001']);
  assert.deepEqual(result.rows[0].undeliveredMissingPriceMaterialCodes, ['1001']);
  const missingRows = exportInventoryTurnoverMissingPriceRows(buildInventoryTurnoverCache(records), { periodMonths: 3 });
  assert.equal(missingRows.length, result.diagnostics.missingPriceRows);
  assert.deepEqual(
    [...new Set(missingRows.map((row) => row.sourceType))].sort(),
    ['库存快照', '采购订单', '销售数据']
  );

  const onHandInput = {
    periodMonths: 3,
    filters: {
      inventorySegment: ['在库量'],
      nonInternalTransactionStatus: ['非内部交易'],
      finishedGoodsStatus: ['成品'],
      hasSalesData: ['有销售数据']
    }
  };
  const onHandResult = queryInventoryTurnover(buildInventoryTurnoverCache(records), onHandInput);
  const onHandMissingRows = exportInventoryTurnoverMissingPriceRows(
    buildInventoryTurnoverCache(records),
    onHandInput
  );
  assert.equal(onHandResult.diagnostics.missingPriceRows, 5);
  assert.equal(onHandMissingRows.length, 5);
  assert.deepEqual(
    [...new Set(onHandMissingRows.filter((row) => row.sourceType === '库存快照').map((row) => row.inventorySegment))],
    ['在库量']
  );
});

test('销售系列、内部交易和成品筛选分别作用于正确的数据范围', () => {
  const cache = buildInventoryTurnoverCache(sampleRecords());
  const allSeriesA = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      productSeries: ['系列A'],
      nonInternalTransactionStatus: [],
      finishedGoodsStatus: []
    }
  });
  assert.equal(allSeriesA.metrics.periodOperatingCost, 1300);
  assert.equal(allSeriesA.metrics.outboundQty, 124);
  assert.deepEqual(allSeriesA.options.nonInternalTransactionStatus, ['非内部交易', '内部交易']);
  assert.deepEqual(allSeriesA.options.finishedGoodsStatus, ['成品']);

  const accessories = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      productSeries: ['护理床附件'],
      nonInternalTransactionStatus: [],
      finishedGoodsStatus: ['非成品']
    }
  });
  assert.equal(accessories.metrics.periodOperatingCost, 2000);
  assert.equal(accessories.metrics.outboundQty, 100);

  const linked = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      productLine: ['健康办公'],
      nonInternalTransactionStatus: [],
      finishedGoodsStatus: [],
      hasSalesData: ['有销售数据']
    }
  });
  assert.deepEqual(linked.options.department, ['国内事业部']);
  assert.deepEqual(linked.options.productSeries, ['护理床附件']);
  assert.deepEqual(linked.options.nonInternalTransactionStatus, ['非内部交易']);
  assert.deepEqual(linked.options.finishedGoodsStatus, ['非成品']);
});

test('同一事业部和产品线按销售系列拆分周转明细', () => {
  const records = sampleRecords();
  records['dim-product'].rows[1].销售产品线 = '产品线A';
  const result = queryInventoryTurnover(buildInventoryTurnoverCache(records), {
    periodMonths: 3,
    filters: {
      nonInternalTransactionStatus: [],
      finishedGoodsStatus: [],
      hasSalesData: []
    }
  });
  const productLineRows = result.rows.filter((row) => row.productLine === '产品线A');
  assert.deepEqual(
    productLineRows.map((row) => row.productSeries).sort(),
    ['系列A', '护理床附件'].sort()
  );
  assert.equal(result.charts.productLine.find((row) => row.name === '产品线A').periodOperatingCost, 3300);
});

test('是否有销售数据默认只保留期间内存在销售记录的汇总组合', () => {
  const records = sampleRecords();
  records['dim-product'].rows.push({
    物料编码: '1003',
    SKU: 'SKU-3',
    金蝶名称: '无销售库存',
    销售产品线: '产品线B',
    销售系列: '系列B',
    一级分类: '成品',
    结算价: 5
  });
  records['dim-warehouse-material'].rows.push({
    库存组织: '组织A',
    仓库名称: '销售仓',
    物料编码: '1003',
    事业部: '国内事业部'
  });
  records['inventory-age-2026-01'].rows.push({
    库存组织: '组织A',
    物料编码: '1003',
    仓库: '销售仓',
    '数量(库存)': 10
  });
  records['inventory-age-2026-04'].rows.push({
    库存组织: '组织A',
    物料编码: '1003',
    仓库: '销售仓',
    '数量(库存)': 8
  });
  const cache = buildInventoryTurnoverCache(records);
  const defaultResult = queryInventoryTurnover(cache, { periodMonths: 3 });
  assert.equal(defaultResult.pagination.totalRows, 1);
  assert.equal(defaultResult.rows[0].hasSalesData, '有销售数据');
  assert.deepEqual(defaultResult.options.hasSalesData, ['有销售数据', '无销售数据']);

  const withoutSales = queryInventoryTurnover(cache, {
    periodMonths: 3,
    filters: {
      productLine: ['产品线B'],
      hasSalesData: ['无销售数据']
    }
  });
  assert.equal(withoutSales.pagination.totalRows, 1);
  assert.equal(withoutSales.rows[0].productLine, '产品线B');
  assert.equal(withoutSales.rows[0].hasSalesData, '无销售数据');
  assert.equal(withoutSales.metrics.periodOperatingCost, 0);
  assert.deepEqual(withoutSales.options.productSeries, ['系列B']);
  assert.deepEqual(withoutSales.options.hasSalesData, ['无销售数据']);
  assert.deepEqual(withoutSales.options.nonInternalTransactionStatus, []);
  assert.deepEqual(withoutSales.options.finishedGoodsStatus, []);
});

test('菜单、独立权限、筛选器、查询和导出接口已接入', async () => {
  const [constants, main, app, routes, page, filters, authPage, styles] = await Promise.all([
    readFile(new URL('../src/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/InventoryTurnoverPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/KcfxFilters.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AuthPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(constants, /inventorySummary', label: '库存汇总报表' \},[\s\S]*inventoryTurnover', label: '库存周转天数' \},[\s\S]*salesSummary'/);
  assert.match(main, /InventoryTurnoverPage/);
  assert.match(app, /'salesInventory\.inventoryTurnover'/);
  assert.match(app, /item !== 'salesInventory\.inventoryTurnover'/);
  assert.match(constants, /!\['ageAnalysis', 'inventoryTurnover'\]\.includes\(page\.key\)/);
  assert.equal((routes.match(/requirePermission\(database, req, res, 'salesInventory\.inventoryTurnover'\)/g) || []).length, 3);
  assert.match(routes, /\/api\/kcfx-library\/inventory-turnover\/query/);
  assert.match(routes, /\/api\/kcfx-library\/inventory-turnover\/export/);
  assert.match(routes, /\/api\/kcfx-library\/inventory-turnover\/missing-price\/export/);
  assert.match(page, /inventorySegment[\s\S]*productSeries[\s\S]*nonInternalTransactionStatus[\s\S]*finishedGoodsStatus[\s\S]*hasSalesData/);
  assert.match(page, /allLabel: '全部库存段'/);
  assert.match(page, /payload\?\.options[\s\S]*currentValues\.filter\(\(value\) => allowed\.has\(value\)\)/);
  assert.match(page, /key: 'productLine', label: '产品线' \},[\s\S]*key: 'productSeries', label: '销售系列'/);
  assert.match(routes, /产品线: row\.productLine,[\s\S]*销售系列: row\.productSeries,[\s\S]*期间月数/);
  assert.match(page, /事业部＋产品线＋销售系列汇总明细/);
  assert.match(page, /在库量 = 非海上在途仓库库存；在途量 = 海上在途仓库存；未交付数量 = 采购订单剩余数量/);
  assert.match(page, /在库量存货周转天数[\s\S]*在途量存货周转天数[\s\S]*未交付存货周转天数[\s\S]*库存合计存货周转天数/);
  assert.match(page, /key: 'openingUndeliveredInventoryCost', label: '期初未交付库存成本'[\s\S]*key: 'averageUndeliveredInventoryCost', label: '平均未交付库存成本'[\s\S]*key: 'undeliveredTurnoverDays', label: '未交付存货周转天数'[\s\S]*key: 'openingInventoryTotalCost', label: '期初库存合计成本'[\s\S]*key: 'inventoryTotalTurnoverDays', label: '库存合计存货周转天数'/);
  assert.doesNotMatch(page, /未交付覆盖天数|inventoryTurnoverDays|undeliveredCoverageDays/);
  assert.match(page, /className="turnover-metric-scroll"[\s\S]*<MetricCards/);
  assert.match(styles, /\.turnover-metric-scroll\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(page, /turnover-metric-row-summary[\s\S]*月均销售产品成本[\s\S]*期间营业成本[\s\S]*期间天数/);
  assert.equal((page.match(/className="turnover-metric-row(?: |")/g) || []).length, 5);
  assert.match(styles, /\.turnover-metric-row \.kcfx-metric-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,/);
  assert.match(styles, /\.turnover-metric-row-summary \.kcfx-metric-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,/);
  assert.match(styles, /\.turnover-metric-scroll \.kcfx-metric-card span,[\s\S]*white-space:\s*nowrap/);
  assert.match(page, /库存周转明细[\s\S]*TablePagination[\s\S]*详细计算逻辑[\s\S]*className="turnover-detail-formulas"/);
  assert.match(page, /<strong>存货周转天数<\/strong> = 期间天数 ×（平均存货成本 ÷ 期间营业成本）/);
  assert.match(page, /<strong>期间营业成本<\/strong> = 月均销售产品成本 × 月数/);
  assert.doesNotMatch(page, /className="turnover-formulas"/);
  assert.match(styles, /\.turnover-detail-formulas\s*\{[\s\S]*grid-template-columns:/);
  assert.doesNotMatch(styles, /\.turnover-formulas\s*\{/);
  assert.match(styles, /\.turnover-detail-panel \.kcfx-table-wrap th:nth-child\(-n \+ 3\),[\s\S]*position:\s*sticky/);
  assert.match(styles, /\.turnover-detail-panel \.kcfx-table-wrap th:nth-child\(1\),[\s\S]*left:\s*0/);
  assert.match(styles, /\.turnover-detail-panel \.kcfx-table-wrap th:nth-child\(2\),[\s\S]*left:\s*var\(--turnover-department-width\)/);
  assert.match(styles, /\.turnover-detail-panel \.kcfx-table-wrap th:nth-child\(3\),[\s\S]*left:\s*calc\(var\(--turnover-department-width\) \+ var\(--turnover-product-line-width\)\)/);
  assert.match(page, /按仓库维表二级仓库分类拆分库存成本[\s\S]*“海上在途”计入在途库存成本[\s\S]*其他有效库存计入在库库存成本/);
  assert.match(page, /平均在库库存成本 =（期初在库库存成本 \+ 期末在库库存成本）÷ 2/);
  assert.match(page, /平均在途库存成本 =（期初在途库存成本 \+ 期末在途库存成本）÷ 2/);
  assert.match(page, /在库量、在途量和未交付存货周转天数三项相加等于库存合计存货周转天数/);
  assert.match(page, /未交付库存成本<\/strong> = 采购订单剩余入库数量 × 2026年结算价/);
  assert.match(page, /未交付存货周转天数 = 期间天数 ×（平均未交付库存成本 ÷ 期间营业成本）/);
  assert.match(page, /库存合计存货周转天数<\/strong> = 期间天数 ×（平均库存合计成本 ÷ 期间营业成本）/);
  assert.match(page, /期间营业成本小于等于0时，对应周转天数显示“--”/);
  assert.match(styles, /\.turnover-calculation-details\s*\{[\s\S]*border-top:/);
  assert.match(routes, /期初在库库存成本: row\.openingOnHandInventoryCost[\s\S]*期初在途库存成本: row\.openingInTransitInventoryCost/);
  assert.match(routes, /期初未交付库存成本: row\.openingUndeliveredInventoryCost[\s\S]*平均未交付库存成本: row\.averageUndeliveredInventoryCost[\s\S]*期初库存合计成本: row\.openingInventoryTotalCost[\s\S]*平均库存合计成本: row\.averageInventoryTotalCost/);
  assert.match(routes, /未交付存货周转天数: row\.undeliveredTurnoverDays,[\s\S]*库存合计存货周转天数: row\.inventoryTotalTurnoverDays,[\s\S]*在库量: row\.onHandQty/);
  assert.match(page, /库存合计<\/strong> = 在库量 \+ 在途量 \+ 未交付总数量/);
  assert.match(page, /turnoverBarTitle\([\s\S]*期末在库库存成本[\s\S]*closingOnHandInventoryCost/);
  assert.match(page, /turnoverBarTitle\([\s\S]*期末在途库存成本[\s\S]*closingInTransitInventoryCost/);
  assert.match(page, /turnoverBarTitle\([\s\S]*期末未交付库存成本[\s\S]*closingUndeliveredInventoryCost/);
  assert.match(page, /导出缺少内部结算价明细/);
  assert.doesNotMatch(page, /近1月|近3月|近6月/);
  assert.match(page, /className="turnover-filter-toolbar"[\s\S]*leadingContent/);
  assert.match(page, /截止月份[\s\S]*<select[\s\S]*availableEndMonths[\s\S]*期间（月）/);
  assert.equal((page.match(/JSON\.stringify\(\{ endMonth, periodMonths, filters/g) || []).length, 3);
  assert.match(filters, /\{leadingContent\}[\s\S]*filters\.map/);
  assert.doesNotMatch(authPage, /setAuthMode\('register'\)/);
  assert.equal((authPage.match(/auth-switch-button/g) || []).length, 1);
  assert.match(styles, /\.turnover-chart-heading h3[\s\S]*white-space:\s*nowrap/);
  assert.match(styles, /\.turnover-comparison-panel\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.turnover-comparison-rows\s*\{[\s\S]*align-content:\s*start/);
  assert.match(styles, /\.turnover-comparison-row\s*\{[\s\S]*border-left:\s*4px solid[\s\S]*background:/);
  assert.match(styles, /\.turnover-comparison-row:nth-child\(even\)\s*\{[\s\S]*background:/);
});

function rowsForMonth(qty) {
  return [{ 库存组织: '组织A', 物料编码: '1001', 仓库: '销售仓', '数量(库存)': qty }];
}
