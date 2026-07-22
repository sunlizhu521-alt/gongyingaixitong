import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildKcfxErrorsSummary,
  kcfxErrorsSummaryCacheKey
} from '../server/kcfx-errors-summary.js';

function record(rows, savedAt = '2026-07-22T00:00:00.000Z') {
  return { rows, rowCount: rows.length, rowsSavedAt: savedAt, savedAt };
}

function sampleRecords() {
  return {
    'fact-inventory': record([
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '1001', 物料名称: '产品A', '(结存)数量（库存）': '10' }
    ]),
    'fact-2': record([
      { 库存组织: '组织A', 仓库: '正常仓', 物料编码: '1001', 物料名称: '产品A', 合计库存数量: '10' }
    ]),
    'sales-data': record([
      { 客户名称: '客户A', 物料编码: '1001', 物料名称: '产品A', 应收数量: '2' }
    ]),
    'dim-product': record([]),
    'dim-warehouse': record([{ 仓库名称: '正常仓' }]),
    'dim-warehouse-material': record([
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '1001', 匹配键: '组织A正常仓1001' }
    ]),
    'dim-store-name': record([{ 客户名称: '客户A', 物料编码: '1001' }]),
    'dim-customer-material': record([])
  };
}

test('维度表更新后重新计算会移除已经补齐的商品报错', () => {
  const records = sampleRecords();
  const before = buildKcfxErrorsSummary(records, 'before');
  assert.equal(before.closed.productMissing.length, 1);
  assert.equal(before.detail.productMissing.length, 1);
  assert.equal(before.sales.productMissing.length, 1);

  records['dim-product'] = record([
    { 物料编码: '1001', SKU: 'SKU-A', 金蝶名称: '产品A', 销售产品线: '产品线A', '结算价（含税）': '10' }
  ], '2026-07-22T01:00:00.000Z');
  const after = buildKcfxErrorsSummary(records, 'after');
  assert.equal(after.closed.productMissing.length, 0);
  assert.equal(after.detail.productMissing.length, 0);
  assert.equal(after.sales.productMissing.length, 0);
});

test('报错缓存键同时跟踪文件库时间、维度文件时间和行数', () => {
  const database = { kcfxLibrary: { savedAt: 'library-a', records: sampleRecords() } };
  const initial = kcfxErrorsSummaryCacheKey(database);

  database.kcfxLibrary.records['dim-product'].rowsSavedAt = 'dimension-b';
  assert.notEqual(kcfxErrorsSummaryCacheKey(database), initial);

  const dimensionChanged = kcfxErrorsSummaryCacheKey(database);
  database.kcfxLibrary.records['dim-product'].rowCount = 8;
  assert.notEqual(kcfxErrorsSummaryCacheKey(database), dimensionChanged);

  const rowCountChanged = kcfxErrorsSummaryCacheKey(database);
  database.kcfxLibrary.savedAt = 'library-b';
  assert.notEqual(kcfxErrorsSummaryCacheKey(database), rowCountChanged);
});

test('服务端报错汇总只返回计数和缺失明细，不返回完整事实表行', () => {
  const summary = buildKcfxErrorsSummary(sampleRecords(), 'saved-at');
  assert.equal(summary.closed.stockMaterialCount, 1);
  assert.equal(summary.sales.salesRowCount, 1);
  assert.equal(summary.sales.stockMaterialCount, 1);
  assert.equal('stockMaterials' in summary.closed, false);
  assert.equal('stockMaterials' in summary.sales, false);
  assert.equal('salesRows' in summary.sales, false);
});

test('报错页面使用服务端汇总并在手动刷新时强制重算', async () => {
  const [pageSource, routeSource] = await Promise.all([
    readFile(new URL('../src/components/ErrorsPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8')
  ]);
  assert.match(pageSource, /\/api\/kcfx-library\/errors-summary\$\{force \? '\?refresh=1' : ''\}/);
  assert.doesNotMatch(pageSource, /useKcfxRecordMap|ERROR_RECORD_IDS/);
  assert.match(pageSource, /loadErrorsSummary\(\{ force: true \}\)/);
  assert.match(routeSource, /app\.get\('\/api\/kcfx-library\/errors-summary'/);
  assert.match(routeSource, /kcfxErrorsSummaryCacheKey\(database\)/);
  assert.match(routeSource, /req\.query\.refresh === '1'/);
  assert.match(routeSource, /requirePermission\(database, req, res, 'maintenanceLibrary\.errors'\)/);
  assert.match(pageSource, /trendLoading && !trendSummary/);
  assert.match(pageSource, /ageLoading && !ageSummary/);
  assert.match(pageSource, /errorsSummaryLoading && !errorsSummary/);
});

test('事业部对照按标准化字段重建组合键并兼容旧科学计数法匹配键', () => {
  const records = {
    'fact-inventory': record([
      { 库存组织: '组织A', 仓库名称: '正常仓', 物料编码: '1.007010385E+9', '(结存)数量（库存）': '3' }
    ]),
    'fact-2': record([
      { 库存组织: '组织A', 仓库: '正常仓', 物料编码: '1.007010385E+9', 合计库存数量: '3' }
    ]),
    'sales-data': record([]),
    'dim-product': record([
      { 物料编码: '1007010385', SKU: 'G01-A-BK-1-X', 金蝶名称: '黑色可折叠拐杖 美国G01' }
    ]),
    'dim-warehouse': record([{ 仓库名称: '正常仓' }]),
    'dim-warehouse-material': record([
      {
        库存组织: '组织A',
        仓库名称: '正常仓',
        物料编码: '1007010385',
        匹配键: '组织A正常仓1.007010385E+9',
        事业部: '海外事业一部'
      }
    ]),
    'dim-store-name': record([]),
    'dim-customer-material': record([])
  };

  const summary = buildKcfxErrorsSummary(records, 'saved-at');
  assert.equal(summary.closed.divisionMissing.length, 0);
  assert.equal(summary.detail.divisionMissing.length, 0);
});
