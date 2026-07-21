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
  assert.equal(cache.inventoryViews.onHand.length, 2);
  assert.equal(cache.inventoryViews.onHand.reduce((sum, row) => sum + row.qty, 0), 12);
  assert.equal(cache.inventoryViews.inTransit.length, 1);
  assert.equal(cache.inventoryViews.inTransit[0].qty, 5);
  assert.equal(cache.inventoryViews.undelivered.length, 1);
  assert.equal(cache.inventoryViews.undelivered[0].qty, 7);
  assert.equal(cache.inventoryViews.undelivered[0].department, '海外事业一部');
  assert.equal(cache.inventoryViews.undelivered[0].sku, 'SKU-A');

  const summary = cache.inventoryViews.summary.find((row) => row.materialCode === '1001');
  assert.deepEqual(
    [summary.onHandQty, summary.inTransitQty, summary.undeliveredQty, summary.totalQty],
    [12, 5, 7, 24]
  );
});

test('销售按年月维度汇总应收数量、不含税金额和物料编码去重数', () => {
  const cache = buildInventorySummaryCache(sampleRecords(), 'saved-at');
  const result = queryInventorySummary(cache, {
    report: 'sales',
    filters: { salesYear: ['2026'] },
    page: 1
  });
  assert.equal(result.defaultYear, '2026');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].dateLabel, '2026年1月');
  assert.equal(result.rows[0].department, '海外事业一部');
  assert.equal(result.rows[0].channel, '渠道A');
  assert.equal(result.rows[0].materialCodeCount, 2);
  assert.equal(result.rows[0].salesQty, 5);
  assert.equal(result.rows[0].salesAmount, 300);

  const searched = exportInventorySummaryRows(cache, { report: 'sales', search: '1001' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].materialCodeCount, 1);
  assert.equal(searched[0].salesAmount, 100);
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
  const [constantsSource, mainSource, inventoryPageSource, salesPageSource, appSource, routeSource] = await Promise.all([
    readFile(new URL('../src/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/InventorySummaryPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SalesSummaryPage.jsx', import.meta.url), 'utf8'),
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
  assert.match(salesPageSource, /reportType="sales"/);
  assert.match(appSource, /'salesInventory\.inventorySummary'/);
  assert.match(appSource, /'salesInventory\.salesSummary'/);
  assert.match(routeSource, /inventory-summary\/query/);
  assert.match(routeSource, /function inventorySummaryPermission\(body = \{\}\)[\s\S]*body\.report === 'sales'[\s\S]*'salesInventory\.salesSummary'[\s\S]*'salesInventory\.inventorySummary'/);
  assert.equal((routeSource.match(/requirePermission\(database, req, res, inventorySummaryPermission\(req\.body\)\)/g) || []).length, 2);
});
