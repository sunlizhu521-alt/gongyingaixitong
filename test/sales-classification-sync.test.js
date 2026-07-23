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
  assert.match(loader, /salesRowsCacheVersion = 'v11'/);
  assert.match(routes, /outboundQty: Number\(row\.outboundQty\) \|\| 0/);
  assert.match(filters, /targetFilter\.independentOptions/);
  assert.match(inventorySummary, /KCFX_INVENTORY_SUMMARY_VERSION = 19/);
  assert.match(utils, /INTERNAL_SALES_CUSTOMERS = \[/);
  assert.match(utils, /浙江迈德斯特医疗器械科技有限公司/);
  assert.match(utils, /MATESIDE GLOBAL US INC\./);
  assert.match(utils, /香港邁德斯特科技有限公司/);
  assert.match(utils, /if \(nonInternalTransactionStatus === '未匹配'\) return '未匹配'/);
  assert.match(utils, /if \(nonInternalTransactionStatus === '内部交易'\) return '非真实交易'/);
  assert.match(utils, /if \(!normalizeText\(warehouse\)\) return '真实交易'/);

  for (const source of [salesAnalysis, salesTrend]) {
    assert.doesNotMatch(source, /id: 'realTransactionStatus'/);
    assert.doesNotMatch(source, /realTransactionStatus: \['真实交易'\]/);
    assert.match(source, /nonInternalTransactionStatus/);
    assert.match(source, /finishedGoodsStatus/);
    assert.match(source, /\['非内部交易'\]/);
    assert.match(source, /\['成品'\]/);
    assert.match(source, /includeExcluded: true/);
    assert.match(source, /'dim-warehouse'/);
    assert.match(source, /SALES_CLASSIFICATION_NOTE/);
  }

  assert.doesNotMatch(salesAnalysis, /销售口径与销售汇总报表一致/);
  assert.doesNotMatch(salesTrend, /销售口径与销售汇总报表一致/);
  assert.match(utils, /销售数量取“应收数量”，销售金额取“销售额-不含税”/);
  assert.doesNotMatch(utils, /是否真实交易/);
  assert.match(utils, /是否内部交易按客户名称与内部交易客户名单精确匹配/);
  assert.match(utils, /是否成品按商品维表判断/);
  assert.match(utils, /销售系列为“护理床附件”时显示“非成品”/);
  assert.match(utils, /productSeries === '护理床附件'/);
  assert.match(salesAnalysis, /gongyingai:filters:sales-analysis:v3/);
  assert.match(salesTrend, /gongyingai:filters:sales-trend:v3/);

  assert.match(salesAnalysis, /id: 'salesMonth'[^\n]*multiple: true[^\n]*independentOptions: true/);
  assert.match(salesTrend, /id: 'salesMonth'[^\n]*multiple: true[^\n]*independentOptions: true/);
  assert.match(salesAnalysis, /id: 'storeShortName'[^\n]*sortValueField: 'qty'/);
  assert.match(salesTrend, /id: 'storeShortName'[^\n]*sortValueField: 'qty'/);
  assert.match(salesTrend, /Number\(row\[targetFilter\.sortValueField \|\| 'qty'\]\)/);
  assert.match(salesTrend, /allLabel="全部数据月份"[\s\S]*multiple/);
  assert.match(ageAnalysis, /id: 'month'[^\n]*type: 'month'[^\n]*multiple: true/);
});
