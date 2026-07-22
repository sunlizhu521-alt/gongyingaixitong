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
      { 物料编码: '1001', SKU: 'SKU-A', 销售产品线: '产品线A', 金蝶名称: '产品A' },
      { 物料编码: '1002', SKU: 'SKU-B', 销售产品线: '产品线A', 金蝶名称: '产品B' }
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
      { 客户名称: '客户A', 店铺简称: '渠道A' }
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
  assert.equal(cache.version, 4);
  assert.equal(cache.inventoryViews.onHand.length, 2);
  assert.equal(cache.inventoryViews.onHand.reduce((sum, row) => sum + row.qty, 0), 12);
  assert.equal(cache.inventoryViews.inTransit.length, 1);
  assert.equal(cache.inventoryViews.inTransit[0].qty, 5);
  assert.equal(cache.inventoryViews.undelivered.length, 1);
  assert.equal(cache.inventoryViews.undelivered[0].qty, 7);
  assert.equal(cache.inventoryViews.undelivered[0].department, '海外事业一部');
  assert.equal(cache.inventoryViews.undelivered[0].sku, 'SKU-A');
  assert.equal(cache.inventoryViews.undelivered[0].kingdeeName, '产品A');
  assert.equal(cache.inventoryViews.onHand.find((row) => row.materialCode === '1001').kingdeeName, '产品A');
  assert.equal(cache.inventoryViews.inTransit[0].kingdeeName, '产品A');

  const summary = cache.inventoryViews.summary.find((row) => row.materialCode === '1001');
  assert.equal(summary.kingdeeName, '产品A');
  assert.deepEqual(
    [summary.onHandQty, summary.inTransitQty, summary.undeliveredQty, summary.totalQty],
    [12, 5, 7, 24]
  );
  assert.equal(cache.errors.inventory.productMissing.length, 0);
  assert.equal(cache.errors.inventory.departmentMissing.length, 0);
  assert.equal(cache.errors.inventory.warehouseMissing.length, 0);
  assert.equal(cache.errors.inventory.supplierMissing.length, 0);
});

test('销售按年月和物料维度汇总应收数量与不含税金额', () => {
  const cache = buildInventorySummaryCache(sampleRecords(), 'saved-at');
  const result = queryInventorySummary(cache, {
    report: 'sales',
    filters: { salesYear: ['2026'] },
    page: 1
  });
  assert.equal(result.defaultYear, '2026');
  assert.equal(result.rows.length, 2);
  const material1001 = result.rows.find((row) => row.materialCode === '1001');
  const material1002 = result.rows.find((row) => row.materialCode === '1002');
  assert.equal(material1001.dateLabel, '2026年1月');
  assert.equal(material1001.department, '海外事业一部');
  assert.equal(material1001.channel, '渠道A');
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
  assert.equal(cache.errors.sales.channelMissing.length, 0);
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
  assert.equal(cache.errors.sales.channelMissing[0].customer, '未配置客户');
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
  assert.match(inventoryPageSource, /key: 'sku', label: 'SKU'[\s\S]*key: 'kingdeeName', label: '金蝶名称'/);
  assert.doesNotMatch(inventoryPageSource, /materialCodeCount|物料编码数量/);
  assert.match(salesPageSource, /reportType="sales"/);
  assert.match(appSource, /'salesInventory\.inventorySummary'/);
  assert.match(appSource, /'salesInventory\.salesSummary'/);
  assert.match(routeSource, /inventory-summary\/query/);
  assert.match(routeSource, /inventory-summary\/errors/);
  assert.match(routeSource, /requirePermission\(database, req, res, 'maintenanceLibrary\.errors'\)/);
  assert.match(routeSource, /function inventorySummaryPermission\(body = \{\}\)[\s\S]*body\.report === 'sales'[\s\S]*'salesInventory\.salesSummary'[\s\S]*'salesInventory\.inventorySummary'/);
  assert.equal((routeSource.match(/requirePermission\(database, req, res, inventorySummaryPermission\(req\.body\)\)/g) || []).length, 2);
  assert.match(routeSource, /物料编码: row\.materialCode,[\s\S]*SKU: row\.sku,[\s\S]*金蝶名称: row\.kingdeeName/);
  assert.doesNotMatch(routeSource, /物料编码数量|materialCodeCount/);
  assert.match(errorsPageSource, /value: 'inventorySummary', label: '库存汇总报表'/);
  assert.match(errorsPageSource, /value: 'salesSummary', label: '销售汇总报表'/);
  assert.match(errorsPageSource, /inventorySummaryProductMissing/);
  assert.match(errorsPageSource, /salesSummaryChannelMissing/);
});
