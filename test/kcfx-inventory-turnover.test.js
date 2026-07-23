import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildInventoryTurnoverCache,
  exportInventoryTurnoverRows,
  inventoryTurnoverPeriod,
  queryInventoryTurnover
} from '../server/kcfx-inventory-turnover.js';

function record(rows, id = '') {
  return { id, rows, rowCount: rows.length, savedAt: '2026-07-24T00:00:00.000Z' };
}

function sampleRecords() {
  const records = {
    'dim-product': record([
      { 物料编码: '1001', SKU: 'SKU-1', 金蝶名称: '产品A', 销售产品线: '产品线A', 一级分类: '成品', 结算价: 10 },
      { 物料编码: '1002', SKU: 'SKU-2', 金蝶名称: '配件B', 销售产品线: '健康办公', 一级分类: '成品', 结算价: 20 }
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

test('周转成本使用应收数量而未交付覆盖使用出库数量', () => {
  const cache = buildInventoryTurnoverCache(sampleRecords(), 'saved-at');
  const result = queryInventoryTurnover(cache, { periodMonths: 3 });
  assert.equal(result.status, 'ready');
  assert.equal(result.period.openingSnapshotMonth, '2026-01');
  assert.equal(result.period.openingApproximate, false);
  assert.equal(result.metrics.openingInventoryCost, 1000);
  assert.equal(result.metrics.closingInventoryCost, 800);
  assert.equal(result.metrics.averageInventoryCost, 900);
  assert.equal(result.metrics.monthlyAverageSalesCost, 100);
  assert.equal(result.metrics.periodOperatingCost, 300);
  assert.equal(result.metrics.inventoryTurnoverDays, 267);
  assert.equal(result.metrics.undeliveredQty, 12);
  assert.equal(result.metrics.outboundQty, 24);
  assert.equal(result.metrics.undeliveredCoverageDays, 44.5);
  assert.equal(result.rows[0].dataStatus, '完整');
  assert.equal(result.pagination.pageSize, 20);
  assert.equal(result.rows.length, 1);
  assert.equal(exportInventoryTurnoverRows(cache, { periodMonths: 3 }).length, 1);
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
  assert.equal(result.metrics.dataStatus, '数据不完整');
});

test('零分母返回空周转天数且缺失结算价标记不完整', () => {
  const records = sampleRecords();
  records['dim-product'].rows[0].结算价 = 0;
  for (const row of records['sales-data'].rows) row.出库数量 = 0;
  const result = queryInventoryTurnover(buildInventoryTurnoverCache(records), { periodMonths: 3 });
  assert.equal(result.metrics.inventoryTurnoverDays, null);
  assert.equal(result.metrics.undeliveredCoverageDays, null);
  assert.ok(result.diagnostics.missingPriceRows > 0);
  assert.equal(result.metrics.dataStatus, '数据不完整');
});

test('菜单、独立权限、查询和导出接口已接入', async () => {
  const [constants, main, app, routes] = await Promise.all([
    readFile(new URL('../src/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8')
  ]);
  assert.match(constants, /inventorySummary', label: '库存汇总报表' \},[\s\S]*inventoryTurnover', label: '库存周转天数' \},[\s\S]*salesSummary'/);
  assert.match(main, /InventoryTurnoverPage/);
  assert.match(app, /'salesInventory\.inventoryTurnover'/);
  assert.match(app, /item !== 'salesInventory\.inventoryTurnover'/);
  assert.match(constants, /!\['ageAnalysis', 'inventoryTurnover'\]\.includes\(page\.key\)/);
  assert.equal((routes.match(/requirePermission\(database, req, res, 'salesInventory\.inventoryTurnover'\)/g) || []).length, 2);
  assert.match(routes, /\/api\/kcfx-library\/inventory-turnover\/query/);
  assert.match(routes, /\/api\/kcfx-library\/inventory-turnover\/export/);
});

function rowsForMonth(qty) {
  return [{ 库存组织: '组织A', 物料编码: '1001', 仓库: '销售仓', '数量(库存)': qty }];
}
