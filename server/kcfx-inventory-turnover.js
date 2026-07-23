import { INVENTORY_AGE_FALLBACK_MONTH, INVENTORY_AGE_MONTHS } from '../shared/kcfxAgeMonths.js';
import {
  firstNumber,
  firstText,
  firstValue,
  firstValueByHeaderIncludes,
  getCachedSalesRows,
  mapDepartments,
  mapProducts,
  mapWarehouses,
  normalizeMaterialCode,
  normalizeText,
  rowsOf
} from '../src/components/kcfxUtils.js';

export const KCFX_INVENTORY_TURNOVER_VERSION = 1;
export const INVENTORY_TURNOVER_PAGE_SIZE = 20;

const GROUP_SEPARATOR = '\u001f';
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDepartmentKey(value) {
  return normalizeMaterialCode(value).replace(/&/g, '').toLowerCase();
}

function groupKey(department, productLine) {
  return [department, productLine].map(normalizeText).join(GROUP_SEPARATOR);
}

function groupIdentity(key) {
  const [department = '', productLine = ''] = String(key || '').split(GROUP_SEPARATOR);
  return { department, productLine };
}

function monthIndex(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
}

function monthFromIndex(index) {
  if (!Number.isFinite(index)) return '';
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthLabel(month) {
  const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}年${Number(match[2])}月` : month;
}

export function inventoryTurnoverPeriod(endMonth, requestedMonths, earliestInventoryMonth = '') {
  const endIndex = monthIndex(endMonth);
  const earliestIndex = monthIndex(earliestInventoryMonth);
  if (!Number.isFinite(endIndex)) return null;
  const availableMonths = Number.isFinite(earliestIndex)
    ? Math.max(1, endIndex - earliestIndex + 1)
    : 1;
  const months = Math.min(Math.max(1, Math.trunc(Number(requestedMonths) || 3)), availableMonths);
  const startIndex = endIndex - months + 1;
  const startMonth = monthFromIndex(startIndex);
  const openingTargetMonth = monthFromIndex(startIndex - 1);
  const startDate = new Date(Date.UTC(Math.floor(startIndex / 12), startIndex % 12, 1));
  const endDate = new Date(Date.UTC(Math.floor(endIndex / 12), (endIndex % 12) + 1, 0));
  return {
    months,
    maxMonths: availableMonths,
    startMonth,
    endMonth,
    openingTargetMonth,
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    days: Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1,
    monthList: Array.from({ length: months }, (_, index) => monthFromIndex(startIndex + index))
  };
}

function inventoryQuantity(row) {
  return firstNumber([
    firstValue(row, ['数量(库存)', '数量（库存）', '合计库存数量', '合计数量', '合计', '结余库存数量']),
    firstValueByHeaderIncludes(row, ['合计', '库存', '数量']),
    firstValueByHeaderIncludes(row, ['结余', '库存', '数量']),
    firstValueByHeaderIncludes(row, ['结存', '数量'], ['金额', '天到', '天以上'])
  ]);
}

function inventoryIdentity(row) {
  const organization = firstText([
    firstValue(row, ['库存组织', '使用组织', '组织']),
    firstValueByHeaderIncludes(row, ['组织'])
  ]);
  return {
    organization,
    materialCode: normalizeMaterialCode(firstText([
      firstValue(row, ['物料编码', '货品编码', '商品编码']),
      firstValueByHeaderIncludes(row, ['物料', '编码'])
    ])),
    warehouse: firstText([
      firstValue(row, ['仓库', '仓库名称', '金蝶仓库', '库存仓库']),
      firstValueByHeaderIncludes(row, ['仓库'])
    ])
  };
}

function addMetric(map, key, values) {
  const current = map.get(key) || {
    qty: 0,
    amount: 0,
    salesCost: 0,
    receivableQty: 0,
    outboundQty: 0,
    undeliveredQty: 0,
    missingPriceRows: 0
  };
  for (const [field, value] of Object.entries(values)) {
    current[field] = (Number(current[field]) || 0) + (Number(value) || 0);
  }
  map.set(key, current);
}

function buildInventorySnapshots(records, productMap, warehouseMap, departmentMap) {
  const snapshots = new Map();
  const sources = {};
  for (const month of INVENTORY_AGE_MONTHS) {
    const monthlyRecord = rowsOf(records[month.id]).length ? records[month.id] : null;
    const record = monthlyRecord
      || (month.month === INVENTORY_AGE_FALLBACK_MONTH ? records['fact-2'] : null);
    if (!rowsOf(record).length) continue;
    const totals = new Map();
    for (const sourceRow of rowsOf(record)) {
      const identity = inventoryIdentity(sourceRow);
      if (!identity.materialCode || !identity.warehouse) continue;
      const qty = inventoryQuantity(sourceRow);
      if (!qty) continue;
      const product = productMap.get(identity.materialCode) || {};
      const warehouse = warehouseMap.get(identity.warehouse) || {};
      const department = normalizeText(departmentMap.get(normalizeDepartmentKey(
        `${identity.organization}${identity.warehouse}${identity.materialCode}`
      ))) || '未匹配事业部';
      const productLine = normalizeText(product.productLine) || '未匹配产品线';
      const settlementPrice = Number(product.settlementPrice) || 0;
      addMetric(totals, groupKey(department, productLine), {
        qty,
        amount: qty * settlementPrice,
        missingPriceRows: settlementPrice ? 0 : 1
      });
      const scope = warehouse.location === '海上在途' ? 'inTransitQty' : 'onHandQty';
      const grouped = totals.get(groupKey(department, productLine));
      grouped[scope] = (Number(grouped[scope]) || 0) + qty;
    }
    snapshots.set(month.month, totals);
    sources[month.month] = {
      id: record.id || month.id,
      fileName: record.fileName || record.originalName || '',
      rowCount: Number(record.rowCount || rowsOf(record).length),
      savedAt: record.rowsSavedAt || record.serverSavedAt || record.savedAt || record.appliedAt || ''
    };
  }
  return { snapshots, sources };
}

function buildSalesMonths(records, productMap) {
  const salesRows = getCachedSalesRows(records, { includeExcluded: true });
  const allMonths = new Set(salesRows.map((row) => row.salesMonth).filter(Boolean));
  const totals = new Map();
  for (const row of salesRows) {
    if (!row.salesMonth) continue;
    if (row.nonInternalTransactionStatus !== '非内部交易' || row.finishedGoodsStatus !== '成品') continue;
    const product = productMap.get(row.materialCode) || {};
    const settlementPrice = Number(product.settlementPrice) || 0;
    const department = normalizeText(row.salesOrg) || '未匹配事业部';
    const productLine = normalizeText(product.productLine || row.productLine) || '未匹配产品线';
    if (!totals.has(row.salesMonth)) totals.set(row.salesMonth, new Map());
    addMetric(totals.get(row.salesMonth), groupKey(department, productLine), {
      receivableQty: Number(row.qty) || 0,
      outboundQty: Number(row.outboundQty) || 0,
      salesCost: (Number(row.qty) || 0) * settlementPrice,
      missingPriceRows: settlementPrice || (!(Number(row.qty) || 0) && !(Number(row.outboundQty) || 0)) ? 0 : 1
    });
  }
  return { totals, allMonths };
}

function valueByHeader(row, names) {
  const direct = firstValue(row, names);
  if (normalizeText(direct) !== '') return direct;
  return firstValueByHeaderIncludes(row, names.length > 1 ? names.slice(0, 2) : names);
}

function splitPurchaseDepartment(value) {
  const text = normalizeText(value);
  if (!text) return '未匹配事业部';
  return normalizeText(text.split(/[\*＊]/, 1)[0]) || '未匹配事业部';
}

function buildUndelivered(records, productMap) {
  const totals = new Map();
  for (const row of rowsOf(records['purchase-order-data'])) {
    const materialCode = normalizeMaterialCode(valueByHeader(row, ['物料编码', '货品编码', '商品编码']));
    if (!materialCode) continue;
    if (normalizeText(valueByHeader(row, ['关闭状态'])) !== '未关闭') continue;
    const qty = firstNumber([valueByHeader(row, ['剩余入库数量'])]);
    if (!(qty > 0)) continue;
    const product = productMap.get(materialCode) || {};
    const department = splitPurchaseDepartment(valueByHeader(row, ['事业部']));
    const productLine = normalizeText(product.productLine) || '未匹配产品线';
    addMetric(totals, groupKey(department, productLine), { undeliveredQty: qty });
  }
  return totals;
}

export function buildInventoryTurnoverCache(records = {}, savedAt = '') {
  const productMap = mapProducts(rowsOf(records['dim-product']));
  const warehouseMap = mapWarehouses(rowsOf(records['dim-warehouse']));
  const departmentMap = mapDepartments(rowsOf(records['dim-warehouse-material']));
  const inventory = buildInventorySnapshots(records, productMap, warehouseMap, departmentMap);
  const sales = buildSalesMonths(records, productMap);
  const inventoryMonths = [...inventory.snapshots.keys()].sort();
  const commonMonths = inventoryMonths.filter((month) => sales.allMonths.has(month));
  return {
    ok: true,
    version: KCFX_INVENTORY_TURNOVER_VERSION,
    source: 'server-inventory-turnover',
    savedAt,
    generatedAt: new Date().toISOString(),
    inventorySnapshots: inventory.snapshots,
    inventorySources: inventory.sources,
    salesMonths: sales.totals,
    allSalesMonths: sales.allMonths,
    undelivered: buildUndelivered(records, productMap),
    inventoryMonths,
    commonMonths,
    latestCommonMonth: commonMonths.at(-1) || '',
    earliestInventoryMonth: inventoryMonths[0] || '',
    sources: Object.fromEntries(Object.entries(records).map(([id, record]) => [id, {
      id,
      fileName: record?.fileName || '',
      rowCount: Number(record?.rowCount || rowsOf(record).length),
      savedAt: record?.rowsSavedAt || record?.serverSavedAt || record?.savedAt || record?.appliedAt || ''
    }]))
  };
}

function aggregateMaps(target, source, fields) {
  for (const [key, values] of source || []) {
    addMetric(target, key, Object.fromEntries(fields.map((field) => [field, values[field]])));
  }
}

function calculateRow(identity, opening, closing, sales, undelivered, period, openingApproximate) {
  const openingInventoryCost = Number(opening?.amount) || 0;
  const closingInventoryCost = Number(closing?.amount) || 0;
  const averageInventoryCost = (openingInventoryCost + closingInventoryCost) / 2;
  const periodOperatingCost = Number(sales?.salesCost) || 0;
  const monthlyAverageSalesCost = periodOperatingCost / period.months;
  const outboundQty = Number(sales?.outboundQty) || 0;
  const undeliveredQty = Number(undelivered?.undeliveredQty) || 0;
  const missingPriceRows = (Number(opening?.missingPriceRows) || 0)
    + (Number(closing?.missingPriceRows) || 0)
    + (Number(sales?.missingPriceRows) || 0);
  return {
    ...identity,
    periodDays: period.days,
    openingInventoryCost,
    closingInventoryCost,
    averageInventoryCost,
    monthlyAverageSalesCost,
    periodOperatingCost,
    inventoryTurnoverDays: periodOperatingCost > 0
      ? period.days * (averageInventoryCost / periodOperatingCost)
      : null,
    undeliveredQty,
    outboundQty,
    undeliveredCoverageDays: outboundQty > 0
      ? period.days * (undeliveredQty / outboundQty)
      : null,
    missingPriceRows,
    dataStatus: openingApproximate || missingPriceRows > 0 ? '数据不完整' : '完整'
  };
}

function aggregateCalculatedRows(rows, identity, period, openingApproximate) {
  const totals = rows.reduce((result, row) => ({
    openingInventoryCost: result.openingInventoryCost + row.openingInventoryCost,
    closingInventoryCost: result.closingInventoryCost + row.closingInventoryCost,
    periodOperatingCost: result.periodOperatingCost + row.periodOperatingCost,
    undeliveredQty: result.undeliveredQty + row.undeliveredQty,
    outboundQty: result.outboundQty + row.outboundQty,
    missingPriceRows: result.missingPriceRows + row.missingPriceRows
  }), {
    openingInventoryCost: 0,
    closingInventoryCost: 0,
    periodOperatingCost: 0,
    undeliveredQty: 0,
    outboundQty: 0,
    missingPriceRows: 0
  });
  return calculateRow(identity, {
    amount: totals.openingInventoryCost,
    missingPriceRows: totals.missingPriceRows
  }, {
    amount: totals.closingInventoryCost
  }, {
    salesCost: totals.periodOperatingCost,
    outboundQty: totals.outboundQty
  }, {
    undeliveredQty: totals.undeliveredQty
  }, period, openingApproximate);
}

function selected(filters, field) {
  return Array.isArray(filters?.[field]) ? filters[field].map(normalizeText).filter(Boolean) : [];
}

function filterRows(rows, filters) {
  const departments = selected(filters, 'department');
  const productLines = selected(filters, 'productLine');
  return rows.filter((row) => (
    (!departments.length || departments.includes(row.department))
    && (!productLines.length || productLines.includes(row.productLine))
  ));
}

function linkedOptions(rows, filters, targetField) {
  return [...new Set(filterRows(rows, {
    ...filters,
    [targetField]: []
  }).map((row) => row[targetField]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function chartRows(rows, field, period, openingApproximate) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[field] || '未匹配';
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      ...aggregateCalculatedRows(items, { [field]: name }, period, openingApproximate)
    }))
    .sort((a, b) => (
      (Number(b.inventoryTurnoverDays) || -Infinity) - (Number(a.inventoryTurnoverDays) || -Infinity)
      || a.name.localeCompare(b.name, 'zh-CN')
    ));
}

export function queryInventoryTurnover(cache, input = {}) {
  if (!cache?.latestCommonMonth) {
    return {
      ok: true,
      status: 'blocked',
      source: cache?.source || 'server-inventory-turnover',
      message: '没有同时包含库存快照和销售数据的月份',
      rows: [],
      options: { department: [], productLine: [] },
      pagination: { page: 1, pageSize: INVENTORY_TURNOVER_PAGE_SIZE, totalPages: 1, totalRows: 0 }
    };
  }
  const period = inventoryTurnoverPeriod(
    cache.latestCommonMonth,
    input.periodMonths,
    cache.earliestInventoryMonth
  );
  const openingSnapshotMonth = cache.inventorySnapshots.has(period.openingTargetMonth)
    ? period.openingTargetMonth
    : cache.earliestInventoryMonth;
  const openingApproximate = openingSnapshotMonth !== period.openingTargetMonth;
  const opening = cache.inventorySnapshots.get(openingSnapshotMonth) || new Map();
  const closing = cache.inventorySnapshots.get(period.endMonth) || new Map();
  const sales = new Map();
  for (const month of period.monthList) {
    aggregateMaps(sales, cache.salesMonths.get(month), ['salesCost', 'receivableQty', 'outboundQty', 'missingPriceRows']);
  }
  const keys = new Set([
    ...opening.keys(),
    ...closing.keys(),
    ...sales.keys(),
    ...cache.undelivered.keys()
  ]);
  const allRows = [...keys].map((key) => calculateRow(
    groupIdentity(key),
    opening.get(key),
    closing.get(key),
    sales.get(key),
    cache.undelivered.get(key),
    period,
    openingApproximate
  )).sort((a, b) => (
    a.department.localeCompare(b.department, 'zh-CN')
    || a.productLine.localeCompare(b.productLine, 'zh-CN')
  ));
  const filters = input.filters || {};
  const filteredRows = filterRows(allRows, filters);
  const metrics = aggregateCalculatedRows(filteredRows, {}, period, openingApproximate);
  const pageSize = INVENTORY_TURNOVER_PAGE_SIZE;
  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(Number(input.page) || 1)), totalPages);
  return {
    ok: true,
    status: 'ready',
    source: cache.source,
    savedAt: cache.savedAt,
    generatedAt: cache.generatedAt,
    period: {
      ...period,
      startLabel: monthLabel(period.startMonth),
      endLabel: monthLabel(period.endMonth),
      openingTargetMonth: period.openingTargetMonth,
      openingSnapshotMonth,
      openingSnapshotLabel: monthLabel(openingSnapshotMonth),
      openingApproximate
    },
    metrics,
    charts: {
      department: chartRows(filteredRows, 'department', period, openingApproximate),
      productLine: chartRows(filteredRows, 'productLine', period, openingApproximate)
    },
    diagnostics: {
      openingApproximate,
      missingPriceRows: metrics.missingPriceRows,
      inventoryMonths: cache.inventoryMonths,
      commonMonths: cache.commonMonths
    },
    options: {
      department: linkedOptions(allRows, filters, 'department'),
      productLine: linkedOptions(allRows, filters, 'productLine')
    },
    rows: filteredRows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, totalPages, totalRows }
  };
}

export function exportInventoryTurnoverRows(cache, input = {}) {
  const result = queryInventoryTurnover(cache, { ...input, page: 1 });
  if (result.status !== 'ready') return [];
  const filters = input.filters || {};
  const period = result.period;
  const queryResult = queryInventoryTurnover(cache, {
    ...input,
    filters,
    page: 1
  });
  const allRows = [];
  for (let page = 1; page <= queryResult.pagination.totalPages; page += 1) {
    allRows.push(...queryInventoryTurnover(cache, { ...input, filters, page }).rows);
  }
  return allRows.map((row) => ({ ...row, period }));
}
