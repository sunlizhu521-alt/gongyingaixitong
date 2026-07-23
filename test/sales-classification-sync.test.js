import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('销售汇总分类和月份控件同步到月度销售、销售趋势及库龄分析', async () => {
  const [routes, loader, filters, utils, inventorySummary, salesAnalysis, salesTrend, ageAnalysis] = await Promise.all([
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/kcfxRecordLoader.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/KcfxFilters.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/kcfxUtils.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/kcfx-inventory-summary.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SalesAnalysisPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SalesTrendPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AgeAnalysisPage.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(routes, /SALES_ROW_RECORD_IDS = \[[^\]]*'dim-warehouse'/);
  assert.match(routes, /getCachedSalesRows\(records, \{ includeExcluded: true \}\)/);
  assert.match(routes, /realTransactionStatus: row\.realTransactionStatus/);
  assert.match(routes, /nonInternalTransactionStatus: row\.nonInternalTransactionStatus/);
  assert.match(routes, /finishedGoodsStatus: row\.finishedGoodsStatus/);
  assert.match(loader, /salesRowsCacheVersion = 'v7'/);
  assert.match(filters, /targetFilter\.independentOptions/);
  assert.match(inventorySummary, /KCFX_INVENTORY_SUMMARY_VERSION = 16/);
  assert.match(utils, /if \(!normalizeText\(warehouse\)\) return '真实交易'/);
  assert.match(utils, /仓库不为空但无法匹配时为“未匹配”/);

  for (const source of [salesAnalysis, salesTrend]) {
    assert.match(source, /realTransactionStatus/);
    assert.match(source, /nonInternalTransactionStatus/);
    assert.match(source, /finishedGoodsStatus/);
    assert.match(source, /\['真实交易'\]/);
    assert.match(source, /\['非内部交易'\]/);
    assert.match(source, /\['成品'\]/);
    assert.match(source, /includeExcluded: true/);
    assert.match(source, /'dim-warehouse'/);
    assert.match(source, /SALES_CLASSIFICATION_NOTE/);
  }

  assert.doesNotMatch(salesAnalysis, /销售口径与销售汇总报表一致/);
  assert.doesNotMatch(salesTrend, /销售口径与销售汇总报表一致/);
  assert.match(utils, /销售数量取“应收数量”，销售金额取“销售额-不含税”/);
  assert.match(utils, /是否真实交易按销售仓库匹配一级仓库分类/);
  assert.match(utils, /是否内部交易按客户名称\+物料编码匹配销售部门/);
  assert.match(utils, /是否成品按商品维表判断/);

  assert.match(salesAnalysis, /id: 'salesMonth'[^\n]*multiple: true[^\n]*independentOptions: true/);
  assert.match(salesTrend, /id: 'salesMonth'[^\n]*multiple: true[^\n]*independentOptions: true/);
  assert.match(salesTrend, /allLabel="全部数据月份"[\s\S]*multiple/);
  assert.match(ageAnalysis, /id: 'month'[^\n]*type: 'month'[^\n]*multiple: true/);
});
