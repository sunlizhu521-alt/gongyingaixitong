import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildInventorySummaryCache,
  exportInventorySummaryRows,
  queryInventorySummary,
  splitPurchaseDepartment
} from '../server/kcfx-inventory-summary.js';

function record(rows) {
  return { rows, rowCount: rows.length, savedAt: '2026-07-22T00:00:00.000Z' };
}

function sampleRecords() {
  return {
    'dim-product': record([
      { 物料编码: '1001', SKU: 'SKU-A', 销售产品线: '产品线A', 金蝶名称: '产品A', 结算价: '10' },
      { 物料编码: '1002', SKU: 'SKU-B', 销售产品线: '产品线A', 金蝶名称: '产品B', 结算价: '20' }
    ]),
    'dim-warehouse': record([
      { 仓库名称: '正常仓', 二级仓库分类: '华南仓' },
      { 仓库名称: '海运仓', 二级仓库分类: '海上在途' },
      { 仓库名称: 'FBA调仓', 二级仓库分类: 'FBA仓-调仓在途' }
    ]),
    'dim-warehouse-material': record([
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '1001', 事业部: '海外事业一部' },
      { 库存组织: '组织A', 仓库名称: '海运仓', 物料编码: '1001', 事业部: '海外事业一部' },
      { 库存组织: '组织A', 仓库名称: 'FBA调仓', 物料编码: '1001', 事业部: '海外事业一部' }
    ]),
    'fact-inventory': record([
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '1001', '(结存)数量（库存）': '10' },
      { 库存组织: '组织A', 仓库名称: '海运仓', 物料编码: '1001', '(结存)数量（库存）': '5' },
      { 库存组织: '组织A', 仓库名称: 'FBA调仓', 物料编码: '1001', '(结存)数量（库存）': '2' },
      { 库存组织: '', 仓库名称: '', 物料编码: '', '(结存)数量（库存）': '999' }
    ]),
    'purchase-order-data': record([
      { 供应商: '供应商A', 事业部: ' 海外事业一部*运营A*项目组 ', 物料编码: '1001', SKU: '错误SKU', 关闭状态: '未关闭', 剩余入库数量: '7' },
      { 供应商: '供应商A', 事业部: '海外事业一部', 物料编码: '1001', 关闭状态: '已关闭', 剩余入库数量: '100' },
      { 供应商: '供应商A', 事业部: '海外事业一部', 物料编码: '1001', 关闭状态: '未关闭', 剩余入库数量: '0' },
      { 供应商: '', 事业部: '', 物料编码: '', 关闭状态: '未关闭', 剩余入库数量: '500' }
    ]),
    'dim-store-name': record([
      { 匹配键: '客户A1001', 销售部门: '海外事业一部' },
      { 匹配键: '客户A1002', 销售部门: '海外事业一部' }
    ]),
    'dim-customer-material': record([
      { 客户名称: '客户A', 店铺简称: '渠道A', 国家: '美国', 平台: 'Amazon' }
    ]),
    'sales-data': record([
      { 日期: '2026-01-10', 客户名称: '客户A', 物料编码: '1001', 物料名称: '产品A', 客户物料编码: '客户A1001', 应收数量: '2', '销售额-不含税': '100' },
      { 日期: '2026-01-20', 客户名称: '客户A', 物料编码: '1002', 物料名称: '产品B', 客户物料编码: '客户A1002', 应收数量: '3', '销售额-不含税': '200' }
    ])
  };
}

test('采购订单事业部只保留第一个星号前的内容', () => {
  assert.equal(splitPurchaseDepartment(' 海外事业一部*运营A*项目组 '), '海外事业一部');
  assert.equal(splitPurchaseDepartment('国内事业部'), '国内事业部');
  assert.equal(splitPurchaseDepartment(' ＊运营A'), '未匹配事业部');
  assert.equal(splitPurchaseDepartment(''), '未匹配事业部');
});

test('库存汇总按海上在途精确分段并排除汇总行', () => {
  const cache = buildInventorySummaryCache(sampleRecords(), 'saved-at');
  assert.equal(cache.version, 13);
  assert.equal(cache.inventoryViews.onHand.length, 2);
  assert.equal(cache.inventoryViews.onHand.reduce((sum, row) => sum + row.qty, 0), 12);
  assert.equal(cache.inventoryViews.inTransit.length, 1);
  assert.equal(cache.inventoryViews.inTransit[0].qty, 5);
  assert.equal(cache.inventoryViews.undelivered.length, 1);
  assert.equal(cache.inventoryViews.undelivered[0].qty, 7);
  assert.equal(cache.inventoryViews.undelivered[0].department, '海外事业一部');
  assert.equal(cache.inventoryViews.undelivered[0].sku, 'SKU-A');
  assert.equal(cache.inventoryViews.undelivered[0].kingdeeName, '产品A');
  assert.equal(cache.inventoryViews.undelivered[0].settlementPrice, 10);
  assert.equal(cache.inventoryViews.onHand.find((row) => row.materialCode === '1001').kingdeeName, '产品A');
  assert.equal(cache.inventoryViews.inTransit[0].kingdeeName, '产品A');

  const summary = cache.inventoryViews.summary.find((row) => row.materialCode === '1001');
  assert.equal(summary.kingdeeName, '产品A');
  assert.equal(summary.settlementPrice, 10);
  assert.equal(summary.inventoryValue, 240);
  assert.deepEqual(
    [summary.onHandQty, summary.inTransitQty, summary.undeliveredQty, summary.totalQty],
    [12, 5, 7, 24]
  );
  const result = queryInventorySummary(cache, { report: 'inventory', view: 'summary' });
  assert.equal(result.metrics.inventoryValue, 240);
  const onHandResult = queryInventorySummary(cache, { report: 'inventory', view: 'onHand' });
  assert.equal(onHandResult.metrics.inventoryValue, 120);
  assert.equal(cache.errors.inventory.productMissing.length, 0);
  assert.equal(cache.errors.inventory.departmentMissing.length, 0);
  assert.equal(cache.errors.inventory.warehouseMissing.length, 0);
  assert.equal(cache.errors.inventory.supplierMissing.length, 0);
  assert.equal(cache.errors.inventory.settlementMissing.length, 0);
});

test('库存汇总按文本关联前导零和科学计数法物料编码', () => {
  const cache = buildInventorySummaryCache({
    'dim-product': record([
      { 物料编码: '00000011', SKU: '', 金蝶名称: '', 销售产品线: '其他/配件', 结算价: '0' },
      { 物料编码: '11', SKU: 'SKU-11', 金蝶名称: '拆卸报废虚拟料号', 销售产品线: '其他/配件', 结算价: '12' },
      { 物料编码: '1007010385', SKU: 'G01-A-BK-1-X', 金蝶名称: '黑色可折叠拐杖 美国G01', 销售产品线: '其他/成品', 结算价: '33' }
    ]),
    'dim-warehouse': record([{ 仓库名称: '正常仓', 二级仓库分类: '华南仓' }]),
    'dim-warehouse-material': record([]),
    'fact-inventory': record([
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '00000011', '(结存)数量（库存）': '2' },
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '1.007010385E+9', '(结存)数量（库存）': '3' }
    ]),
    'purchase-order-data': record([]),
    'sales-data': record([]),
    'dim-store-name': record([]),
    'dim-customer-material': record([])
  }, 'saved-at');

  const padded = cache.inventoryViews.summary.find((row) => row.materialCode === '00000011');
  assert.equal(padded.kingdeeName, '拆卸报废虚拟料号');
  assert.equal(padded.settlementPrice, 12);
  assert.equal(padded.inventoryValue, 24);

  const scientific = cache.inventoryViews.summary.find((row) => row.materialCode === '1007010385');
  assert.equal(scientific.sku, 'G01-A-BK-1-X');
  assert.equal(scientific.kingdeeName, '黑色可折叠拐杖 美国G01');
  assert.equal(scientific.settlementPrice, 33);
  assert.equal(scientific.inventoryValue, 99);
  assert.equal(cache.errors.inventory.productMissing.length, 0);
});

test('销售按年月和物料维度汇总应收数量与不含税金额', () => {
  const cache = buildInventorySummaryCache(sampleRecords(), 'saved-at');
  const result = queryInventorySummary(cache, {
    report: 'sales',
    filters: { salesMonth: ['2026-01'] },
    page: 1
  });
  assert.deepEqual(result.options.salesMonth, ['2026-01']);
  assert.equal(Object.hasOwn(result, 'defaultYear'), false);
  assert.equal(result.rows.length, 2);
  const material1001 = result.rows.find((row) => row.materialCode === '1001');
  const material1002 = result.rows.find((row) => row.materialCode === '1002');
  assert.equal(material1001.dateLabel, '2026年1月');
  assert.equal(material1001.department, '海外事业一部');
  assert.equal(material1001.country, '美国');
  assert.equal(material1001.platform, 'Amazon');
  assert.equal(Object.hasOwn(material1001, 'channel'), false);
  assert.equal(material1001.sku, 'SKU-A');
  assert.equal(material1001.kingdeeName, '产品A');
  assert.equal(material1001.salesQty, 2);
  assert.equal(material1001.salesAmount, 100);
  assert.equal(material1002.sku, 'SKU-B');
  assert.equal(material1002.kingdeeName, '产品B');
  assert.equal(material1002.salesQty, 3);
  assert.equal(material1002.salesAmount, 200);
  assert.equal(result.metrics.salesQty, 5);
  assert.equal(result.metrics.salesAmount, 300);
  assert.equal(Object.hasOwn(result.metrics, 'materialCodeCount'), false);

  const searched = exportInventorySummaryRows(cache, { report: 'sales', search: '1001' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].sku, 'SKU-A');
  assert.equal(searched[0].kingdeeName, '产品A');
  assert.equal(searched[0].salesAmount, 100);
  assert.equal(cache.errors.sales.productMissing.length, 0);
  assert.equal(cache.errors.sales.departmentMissing.length, 0);
  assert.equal(cache.errors.sales.countryMissing.length, 0);
  assert.equal(cache.errors.sales.platformMissing.length, 0);
  assert.equal(Object.hasOwn(cache.errors.sales, 'channelMissing'), false);
  assert.equal(cache.errors.sales.settlementMissing.length, 0);
});

test('销售汇总报表分别提示店铺简称维表国家和平台缺失', () => {
  const countryMissingRecords = sampleRecords();
  countryMissingRecords['dim-customer-material'].rows[0].国家 = '';
  const countryMissingCache = buildInventorySummaryCache(countryMissingRecords, 'saved-at');
  assert.equal(countryMissingCache.errors.sales.countryMissing.length, 2);
  assert.equal(countryMissingCache.errors.sales.platformMissing.length, 0);
  assert.equal(countryMissingCache.errors.sales.countryMissing[0].reason, '店铺简称维表国家缺失');
  assert.equal(countryMissingCache.errors.sales.countryMissing[0].country, '未匹配国家');
  assert.equal(countryMissingCache.errors.sales.countryMissing[0].platform, 'Amazon');

  const platformMissingRecords = sampleRecords();
  platformMissingRecords['dim-customer-material'].rows[0].平台 = '';
  const platformMissingCache = buildInventorySummaryCache(platformMissingRecords, 'saved-at');
  assert.equal(platformMissingCache.errors.sales.countryMissing.length, 0);
  assert.equal(platformMissingCache.errors.sales.platformMissing.length, 2);
  assert.equal(platformMissingCache.errors.sales.platformMissing[0].reason, '店铺简称维表平台缺失');
  assert.equal(platformMissingCache.errors.sales.platformMissing[0].country, '美国');
  assert.equal(platformMissingCache.errors.sales.platformMissing[0].platform, '未匹配平台');
});

test('店铺简称维表重复客户使用非空国家和平台补全', () => {
  const records = sampleRecords();
  records['dim-customer-material'].rows = [
    { 客户名称: 'ANTARSP.J.', 店铺简称: 'ANTARSP.J.', 国家: '', 平台: 'Amazon' },
    { 客户名称: 'ANTARSPJ', 国家: '波兰', 平台: '' }
  ];
  records['sales-data'].rows = [{
    日期: '2026-01-10',
    客户名称: 'ANTARSP.J.',
    物料编码: '1001',
    客户物料编码: '客户A1001',
    应收数量: '2',
    '销售额-不含税': '100'
  }];

  const cache = buildInventorySummaryCache(records, 'saved-at');
  const result = queryInventorySummary(cache, { report: 'sales' });
  assert.equal(result.rows[0].country, '波兰');
  assert.equal(result.rows[0].platform, 'Amazon');
  assert.equal(cache.errors.sales.countryMissing.length, 0);
  assert.equal(cache.errors.sales.platformMissing.length, 0);
});

test('库存和销售汇总报表提示内部结算价缺失', () => {
  const records = sampleRecords();
  records['dim-product'].rows[1].销售系列 = '系列B';
  records['dim-product'].rows[1].结算价 = '0';
  records['fact-inventory'].rows.push({
    库存组织: '组织A',
    仓库名称: '正常仓',
    物料编码: '1002',
    '(结存)数量（库存）': '4'
  });
  records['dim-warehouse-material'].rows.push({
    库存组织: '组织A',
    仓库名称: '正常仓',
    物料编码: '1002',
    事业部: '海外事业一部'
  });

  const cache = buildInventorySummaryCache(records, 'saved-at');
  assert.equal(cache.errors.inventory.settlementMissing.length, 1);
  assert.deepEqual(cache.errors.inventory.settlementMissing[0], {
    sourceType: '在库数量',
    organization: '组织A',
    warehouse: '正常仓',
    supplier: '',
    department: '海外事业一部',
    productLine: '产品线A',
    productSeries: '系列B',
    materialCode: '1002',
    sku: 'SKU-B',
    kingdeeName: '产品B',
    settlementPrice: '',
    inventoryLocation: '华南仓',
    reason: '内部结算价为空或为0',
    qty: 4
  });
  assert.equal(cache.errors.sales.settlementMissing.length, 1);
  assert.equal(cache.errors.sales.settlementMissing[0].materialCode, '1002');
  assert.equal(cache.errors.sales.settlementMissing[0].productSeries, '系列B');
  assert.equal(cache.errors.sales.settlementMissing[0].settlementPrice, '');
  assert.equal(cache.errors.sales.settlementMissing[0].qty, 3);
  assert.equal(cache.errors.sales.settlementMissing[0].amount, 200);
  assert.equal(cache.errors.sales.settlementMissing[0].reason, '内部结算价为空或为0');
});

test('库存和销售汇总报表错误检查沿用报表匹配结果', () => {
  const records = sampleRecords();
  records['fact-inventory'].rows.push({
    库存组织: '组织X',
    仓库名称: '未配置仓',
    物料编码: '9999',
    '(结存)数量（库存）': '4'
  });
  records['purchase-order-data'].rows.push({
    供应商: '',
    事业部: '',
    物料编码: '9998',
    关闭状态: '未关闭',
    剩余入库数量: '6'
  });
  records['sales-data'].rows.push({
    日期: '2026-01-25',
    客户名称: '未配置客户',
    物料编码: '9997',
    应收数量: '5',
    '销售额-不含税': '50'
  });

  const cache = buildInventorySummaryCache(records, 'saved-at');
  assert.equal(cache.errors.inventory.rowCount, 6);
  assert.deepEqual(cache.errors.inventory.productMissing.map((row) => row.materialCode).sort(), ['9998', '9999']);
  assert.deepEqual(cache.errors.inventory.departmentMissing.map((row) => row.materialCode).sort(), ['9998', '9999']);
  assert.equal(cache.errors.inventory.warehouseMissing[0].warehouse, '未配置仓');
  assert.equal(cache.errors.inventory.supplierMissing[0].materialCode, '9998');
  assert.equal(cache.errors.sales.rowCount, 3);
  assert.equal(cache.errors.sales.productMissing[0].materialCode, '9997');
  assert.equal(cache.errors.sales.departmentMissing[0].customer, '未配置客户');
  assert.equal(cache.errors.sales.countryMissing[0].customer, '未配置客户');
  assert.equal(cache.errors.sales.platformMissing[0].customer, '未配置客户');
  assert.equal(Object.hasOwn(cache.errors.sales, 'channelMissing'), false);
});

test('查询接口固定每页20行并导出全部筛选结果', () => {
  const records = sampleRecords();
  records['fact-inventory'] = record(Array.from({ length: 25 }, (_, index) => ({
    库存组织: '组织A',
    仓库名称: '正常仓',
    物料编码: String(2000 + index),
    '(结存)数量（库存）': 1
  })));
  records['dim-product'] = record(Array.from({ length: 25 }, (_, index) => ({
    物料编码: String(2000 + index),
    SKU: `SKU-${index}`,
    销售产品线: '产品线A'
  })));
  records['dim-warehouse-material'] = record(Array.from({ length: 25 }, (_, index) => ({
    库存组织: '组织A',
    仓库名称: '正常仓',
    物料编码: String(2000 + index),
    事业部: '海外事业一部'
  })));
  records['purchase-order-data'] = record([]);
  const cache = buildInventorySummaryCache(records, 'saved-at');
  const page = queryInventorySummary(cache, { report: 'inventory', view: 'summary', page: 1, pageSize: 100 });
  assert.equal(page.rows.length, 20);
  assert.equal(page.pagination.totalRows, 25);
  assert.equal(exportInventorySummaryRows(cache, { report: 'inventory', view: 'summary' }).length, 25);
});

test('库存和销售汇总报表已分别接入菜单、页面、权限和受保护接口', async () => {
  const [constantsSource, mainSource, inventoryPageSource, salesPageSource, errorsPageSource, appSource, routeSource] = await Promise.all([
    readFile(new URL('../src/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/InventorySummaryPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SalesSummaryPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ErrorsPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8')
  ]);
  assert.match(constantsSource, /salesInventoryInventorySummary/);
  assert.match(constantsSource, /key: 'inventorySummary'/);
  assert.match(constantsSource, /salesInventorySalesSummary/);
  assert.match(constantsSource, /key: 'salesSummary'/);
  assert.match(mainSource, /<InventorySummaryPage/);
  assert.match(mainSource, /<SalesSummaryPage/);
  assert.match(inventoryPageSource, /reportType = 'inventory'/);
  assert.match(inventoryPageSource, /isSalesReport \? '销售汇总报表' : '库存汇总报表'/);
  assert.match(inventoryPageSource, /id: 'salesMonth', field: 'salesMonth', type: 'month', allLabel: '全部销售月份', monthAllLabel: '全部数据月份'/);
  assert.doesNotMatch(inventoryPageSource, /全部年份|id: 'salesYear'|id: 'salesMonthNumber'/);
  assert.match(inventoryPageSource, /label: '销售金额（亿元）'[\s\S]*100000000[\s\S]*亿元/);
  assert.match(inventoryPageSource, /label: '销售金额', value: `[\s\S]*100000000[\s\S]*亿元/);
  assert.match(inventoryPageSource, /key: 'department', label: '事业部'[\s\S]*key: 'country', label: '国家'[\s\S]*key: 'platform', label: '平台'[\s\S]*key: 'productLine', label: '产品线'/);
  assert.doesNotMatch(inventoryPageSource, /key: 'channel'|label: '渠道'|全部渠道|、渠道/);
  assert.match(inventoryPageSource, /key: 'sku', label: 'SKU'[\s\S]*key: 'kingdeeName', label: '金蝶名称'[\s\S]*key: 'settlementPrice', label: '内部结算价'/);
  assert.match(inventoryPageSource, /key: 'totalQty', label: '合计'[\s\S]*key: 'inventoryValue', label: '货值'/);
  assert.match(inventoryPageSource, /label: '货值', value: `¥\$\{formatNumber\(metrics\.inventoryValue, 2\)\}`/);
  assert.doesNotMatch(inventoryPageSource, /materialCodeCount|物料编码数量/);
  assert.match(salesPageSource, /reportType="sales"/);
  assert.match(appSource, /'salesInventory\.inventorySummary'/);
  assert.match(appSource, /'salesInventory\.salesSummary'/);
  assert.match(routeSource, /inventory-summary\/query/);
  assert.match(routeSource, /inventory-summary\/errors/);
  assert.match(routeSource, /requirePermission\(database, req, res, 'maintenanceLibrary\.errors'\)/);
  assert.match(routeSource, /function inventorySummaryPermission\(body = \{\}\)[\s\S]*body\.report === 'sales'[\s\S]*'salesInventory\.salesSummary'[\s\S]*'salesInventory\.inventorySummary'/);
  assert.equal((routeSource.match(/requirePermission\(database, req, res, inventorySummaryPermission\(req\.body\)\)/g) || []).length, 2);
  assert.match(routeSource, /物料编码: row\.materialCode,[\s\S]*SKU: row\.sku,[\s\S]*金蝶名称: row\.kingdeeName,[\s\S]*内部结算价: Number\(row\.settlementPrice\)[\s\S]*合计: Number\(row\.totalQty\)[\s\S]*货值: Number\(row\.inventoryValue\)/);
  assert.match(routeSource, /事业部: row\.department,[\s\S]*国家: row\.country,[\s\S]*平台: row\.platform,[\s\S]*产品线: row\.productLine/);
  assert.doesNotMatch(routeSource, /渠道: row\.channel/);
  assert.doesNotMatch(routeSource, /物料编码数量|materialCodeCount/);
  assert.match(errorsPageSource, /value: 'inventorySummary', label: '库存汇总报表'/);
  assert.match(errorsPageSource, /value: 'salesSummary', label: '销售汇总报表'/);
  assert.match(errorsPageSource, /inventorySummaryProductMissing/);
  assert.doesNotMatch(errorsPageSource, /salesSummaryChannelMissing|店铺简称匹配缺失/);
  assert.match(errorsPageSource, /salesSummaryCountryMissing[\s\S]*国家信息缺失/);
  assert.match(errorsPageSource, /salesSummaryPlatformMissing[\s\S]*平台信息缺失/);
  assert.match(errorsPageSource, /inventorySummarySettlementMissing[\s\S]*内部结算价缺失/);
  assert.match(errorsPageSource, /salesSummarySettlementMissing[\s\S]*内部结算价缺失/);
  assert.match(errorsPageSource, /productLine', '产品线'[\s\S]*productSeries', '销售系列'/);
  assert.match(errorsPageSource, /productLine', '销售产品线'[\s\S]*productSeries', '销售系列'/);
});
