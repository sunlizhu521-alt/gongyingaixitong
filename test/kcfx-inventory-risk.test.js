import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildInventoryRiskCache,
  normalizeInventoryRiskParams,
  parseForecastMonthHeader,
  queryInventoryRisk
} from '../server/kcfx-inventory-risk.js';

function record(rows) {
  return { rows, rowCount: rows.length, savedAt: '2026-08-03T00:00:00.000Z' };
}

function sampleRecords() {
  return {
    'dim-product': record([
      { 物料编码: '1001', SKU: 'SKU-1001', 销售产品线: '升降桌', 一级分类: '成品' },
      { 物料编码: '1002', SKU: 'SKU-1002', 销售产品线: '移位机', 一级分类: '成品' },
      { 物料编码: '1003', SKU: 'SKU-1003', 销售产品线: '手推车', 一级分类: '成品' }
    ]),
    'dim-warehouse': record([
      { 仓库名称: '国内仓', 一级仓库分类: '销售出库仓', 二级仓库分类: '中国' },
      { 仓库名称: '海外仓', 一级仓库分类: '销售出库仓', 二级仓库分类: 'FBA仓-美国' },
      { 仓库名称: '海运仓', 一级仓库分类: '销售海上在途仓', 二级仓库分类: '海上在途' },
      { 仓库名称: '未知仓', 一级仓库分类: '销售出库仓', 二级仓库分类: '待维护位置' },
      { 仓库名称: '样品仓', 一级仓库分类: '样品仓', 二级仓库分类: '中国' }
    ]),
    'fact-inventory': record([
      { 仓库名称: '国内仓', 物料编码: '1001', '(结存)数量（库存）': '60' },
      { 仓库名称: '海外仓', 物料编码: '1001', '(结存)数量（库存）': '120' },
      { 仓库名称: '海运仓', 物料编码: '1001', '(结存)数量（库存）': '30' },
      { 仓库名称: '未知仓', 物料编码: '1002', '(结存)数量（库存）': '7' },
      { 仓库名称: '样品仓', 物料编码: '1003', '(结存)数量（库存）': '99' }
    ]),
    'sales-forecast': record([
      {
        事业部: '国内事业部*运营一组',
        物料编码: '1001',
        '2026年8月': '60',
        '2026-09': '60'
      },
      {
        事业部: '海外事业一部',
        物料编码: '1001',
        '2026/08': '90',
        '2026.09': '90'
      },
      {
        事业部: '国内事业部',
        物料编码: '1002',
        '2026年8月': '0',
        '2026年9月': '0'
      }
    ]),
    'purchase-order-data': record([
      { 事业部: '国内事业部', 物料编码: '1001', 关闭状态: '未关闭', 剩余入库数量: '30' },
      { 事业部: '海外事业一部', 物料编码: '1001', 关闭状态: '未关闭', 剩余入库数量: '60' },
      { 事业部: '国内事业部', 物料编码: '1002', 关闭状态: '未关闭', 剩余入库数量: '12' },
      { 事业部: '国内事业部', 物料编码: '1003', 关闭状态: '已关闭', 剩余入库数量: '999' }
    ]),
    'dim-store-name': record([
      { 匹配键: '客户A1001', 销售部门名称: '国内事业部' },
      { 匹配键: '客户B1001', 销售部门名称: '海外事业一部' }
    ]),
    'dim-customer-material': record([
      { 客户名称: '客户A', 店铺简称: '客户A' },
      { 客户名称: '客户B', 店铺简称: '客户B' }
    ]),
    'sales-data': record([
      { 销售日期: '2026-06-10', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 出库数量: '40' },
      { 销售日期: '2026-07-10', 客户名称: '客户A', 物料编码: '1001', 客户物料编码: '客户A1001', 出库数量: '80' },
      { 销售日期: '2026-06-10', 客户名称: '客户B', 物料编码: '1001', 客户物料编码: '客户B1001', 出库数量: '60' },
      { 销售日期: '2026-07-10', 客户名称: '客户B', 物料编码: '1001', 客户物料编码: '客户B1001', 出库数量: '120' }
    ])
  };
}

const TWO_MONTH_PARAMS = {
  forecastMonths: 2,
  historicalMonths: 2,
  deliveryPeriod: 45,
  transitHighDomestic: 30,
  transitSevereDomestic: 60,
  chainAttentionDomestic: 60,
  chainInterventionDomestic: 90,
  transitHighOverseas: 30,
  transitSevereOverseas: 60,
  chainAttentionOverseas: 60,
  chainInterventionOverseas: 90
};

test('销售预测月份表头统一为 YYYY-MM', () => {
  assert.equal(parseForecastMonthHeader('2026年8月'), '2026-08');
  assert.equal(parseForecastMonthHeader('2026-09'), '2026-09');
  assert.equal(parseForecastMonthHeader('2026/10'), '2026-10');
  assert.equal(parseForecastMonthHeader('2026.11'), '2026-11');
  assert.equal(parseForecastMonthHeader('预测合计'), '');
});

test('同一物料按国内和海外分别计算库存风险', () => {
  const cache = buildInventoryRiskCache(sampleRecords(), 'saved-at');
  const result = queryInventoryRisk(cache, TWO_MONTH_PARAMS, new Date('2026-08-03T00:00:00+08:00'));

  assert.equal(result.ok, true);
  assert.deepEqual(result.periods.forecastMonths, ['2026-08', '2026-09']);
  assert.deepEqual(result.periods.historicalMonths, ['2026-06', '2026-07']);
  const domestic = result.stopped.find((row) => row.id === '国内\u001f1001');
  const overseas = result.stopped.find((row) => row.id === '海外\u001f1001');
  assert.ok(domestic);
  assert.ok(overseas);
  assert.deepEqual(
    [domestic.onHandQty, domestic.inTransitQty, domestic.undeliveredQty],
    [60, 0, 30]
  );
  assert.deepEqual(
    [overseas.onHandQty, overseas.inTransitQty, overseas.undeliveredQty],
    [120, 30, 60]
  );
  assert.equal(domestic.forecastMonthlyAverage, 60);
  assert.equal(domestic.historicalMonthlyAverage, 60);
  assert.equal(overseas.forecastMonthlyAverage, 90);
  assert.equal(overseas.historicalMonthlyAverage, 90);
  assert.equal(domestic.transitTurnoverDays, 30);
  assert.equal(domestic.fullChainCoverageDays, 90);
  assert.equal(domestic.action, '停止采购');
});

test('无预测和预测为0均按999天落入停止采购', () => {
  const records = sampleRecords();
  records['fact-inventory'].rows.push({ 仓库名称: '国内仓', 物料编码: '1003', '(结存)数量（库存）': '5' });
  const result = queryInventoryRisk(
    buildInventoryRiskCache(records, 'saved-at'),
    TWO_MONTH_PARAMS,
    new Date('2026-08-03T00:00:00+08:00')
  );
  const zeroForecast = result.stopped.find((row) => row.materialCode === '1002');
  const noForecast = result.stopped.find((row) => row.materialCode === '1003');
  assert.equal(zeroForecast.forecastStatus, '销售预测为0');
  assert.equal(noForecast.forecastStatus, '无销售预测');
  assert.equal(zeroForecast.transitTurnoverDays, 999);
  assert.equal(noForecast.fullChainCoverageDays, 999);
});

test('未知仓库位置进入诊断，排除仓不进入风险或诊断', () => {
  const cache = buildInventoryRiskCache(sampleRecords(), 'saved-at');
  assert.equal(cache.unknownLocations.length, 1);
  assert.equal(cache.unknownLocations[0].materialCode, '1002');
  assert.equal(cache.unknownLocations[0].qty, 7);
  assert.equal(cache.unknownLocations.some((row) => row.materialCode === '1003'), false);
});

test('缺少销售预测文件时阻断计算，阈值顺序错误时返回参数错误', () => {
  const records = sampleRecords();
  records['sales-forecast'] = record([]);
  const missing = queryInventoryRisk(buildInventoryRiskCache(records), {}, new Date('2026-08-03T00:00:00+08:00'));
  assert.equal(missing.status, 'missing_data');
  assert.ok(missing.missingSources.some((source) => source.id === 'sales-forecast'));

  assert.throws(
    () => normalizeInventoryRiskParams({ transitHighDomestic: 100, transitSevereDomestic: 80 }),
    /严重线不得低于偏高线/
  );
});

test('库存风险页面、权限、接口及销售预测单工作表约束已接入', async () => {
  const [appSource, routeSource, constantsSource, mainSource, librarySource, pageSource] = await Promise.all([
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SalesLibraryPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/InventoryRiskPage.jsx', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /salesInventory\.inventoryRisk/);
  assert.match(appSource, /slot\.id === 'sales-forecast' && \(workbookIndex\.SheetNames \|\| \[\]\)\.length !== 1/);
  assert.match(routeSource, /risk-analysis\/query/);
  assert.match(routeSource, /risk-analysis\/export/);
  assert.match(constantsSource, /salesInventoryInventoryRisk/);
  assert.match(mainSource, /InventoryRiskPage/);
  assert.match(librarySource, /sales-forecast/);
  assert.match(pageSource, /计算逻辑说明/);
});
