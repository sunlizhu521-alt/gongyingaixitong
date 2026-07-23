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

export const KCFX_INVENTORY_TURNOVER_VERSION = 5;
export const INVENTORY_TURNOVER_PAGE_SIZE = 20;

const GROUP_SEPARATOR = '\u001f';
const DAY_MS = 24 * 60 * 60 * 1000;
const TURNOVER_CHART_ORDERS = {
  department: [
    '海外事业一部',
    '海外事业二部',
    '国内事业部',
    '全球招商事业部',
    '销售部-工厂'
  ],
  productLine: [
    '手推车',
    '升降椅',
    '防褥疮气床垫',
    '手动轮椅',
    '电动轮椅',
    '老年代步车',
    '移位机',
    '洗澡椅',
    '护理床',
    '其他/成品'
  ]
};
const TURNOVER_CHART_ORDER_ALIASES = {
  department: {
    全球招商部: '全球招商事业部'
  }
};

function normalizeDepartmentKey(value) {
  return normalizeMaterialCode(value).replace(/&/g, '').toLowerCase();
}

function groupKey(department, productLine, productSeries = '') {
  return [department, productLine, productSeries].map(normalizeText).join(GROUP_SEPARATOR);
}

function groupIdentity(key) {
  const [department = '', productLine = '', productSeries = ''] = String(key || '').split(GROUP_SEPARATOR);
  return { department, productLine, productSeries };
}

function salesGroupKey(department, productLine, productSeries, nonInternalTransactionStatus, finishedGoodsStatus) {
  return [
    department,
    productLine,
    productSeries,
    nonInternalTransactionStatus,
    finishedGoodsStatus
  ].map(normalizeText).join(GROUP_SEPARATOR);
}

function salesGroupIdentity(key) {
  const [
    department = '',
    productLine = '',
    productSeries = '',
    nonInternalTransactionStatus = '',
    finishedGoodsStatus = ''
  ] = String(key || '').split(GROUP_SEPARATOR);
  return {
    department,
    productLine,
    productSeries,
    nonInternalTransactionStatus,
    finishedGoodsStatus
  };
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
    salesRecordRows: 0,
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
  const missingPriceRecords = [];
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
      const productSeries = normalizeText(product.productSeries) || '未匹配销售系列';
      const settlementPrice = Number(product.settlementPrice) || 0;
      const key = groupKey(department, productLine, productSeries);
      addMetric(totals, key, {
        qty,
        amount: qty * settlementPrice,
        missingPriceRows: settlementPrice ? 0 : 1
      });
      if (!settlementPrice) {
        missingPriceRecords.push({
          sourceType: '库存快照',
          month: month.month,
          department,
          productLine,
          productSeries,
          materialCode: identity.materialCode,
          sku: normalizeText(product.sku),
          materialName: normalizeText(product.materialName),
          organization: identity.organization,
          warehouse: identity.warehouse,
          quantity: qty
        });
      }
      const scope = warehouse.location === '海上在途' ? 'inTransitQty' : 'onHandQty';
      const grouped = totals.get(key);
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
  return { snapshots, sources, missingPriceRecords };
}

function buildSalesMonths(records, productMap) {
  const salesRows = getCachedSalesRows(records, { includeExcluded: true });
  const allMonths = new Set(salesRows.map((row) => row.salesMonth).filter(Boolean));
  const totals = new Map();
  const missingPriceRecords = [];
  for (const row of salesRows) {
    if (!row.salesMonth) continue;
    const product = productMap.get(row.materialCode) || {};
    const settlementPrice = Number(product.settlementPrice) || 0;
    const department = normalizeText(row.salesOrg) || '未匹配事业部';
    const productLine = normalizeText(product.productLine || row.productLine) || '未匹配产品线';
    const productSeries = normalizeText(product.productSeries || row.productSeries) || '未匹配销售系列';
    const nonInternalTransactionStatus = normalizeText(row.nonInternalTransactionStatus) || '未匹配';
    const finishedGoodsStatus = normalizeText(row.finishedGoodsStatus) || '未匹配';
    if (!totals.has(row.salesMonth)) totals.set(row.salesMonth, new Map());
    addMetric(totals.get(row.salesMonth), salesGroupKey(
      department,
      productLine,
      productSeries,
      nonInternalTransactionStatus,
      finishedGoodsStatus
    ), {
      receivableQty: Number(row.qty) || 0,
      outboundQty: Number(row.outboundQty) || 0,
      salesCost: (Number(row.qty) || 0) * settlementPrice,
      salesRecordRows: 1,
      missingPriceRows: settlementPrice || (!(Number(row.qty) || 0) && !(Number(row.outboundQty) || 0)) ? 0 : 1
    });
    if (!settlementPrice && ((Number(row.qty) || 0) || (Number(row.outboundQty) || 0))) {
      missingPriceRecords.push({
        sourceType: '销售数据',
        month: row.salesMonth,
        department,
        productLine,
        productSeries,
        materialCode: normalizeMaterialCode(row.materialCode),
        sku: normalizeText(product.sku || row.sku),
        materialName: normalizeText(product.materialName || row.materialName),
        customer: normalizeText(row.customer),
        nonInternalTransactionStatus,
        finishedGoodsStatus,
        quantity: Number(row.qty) || 0,
        outboundQty: Number(row.outboundQty) || 0
      });
    }
  }
  return { totals, allMonths, missingPriceRecords };
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
    const productSeries = normalizeText(product.productSeries) || '未匹配销售系列';
    addMetric(totals, groupKey(department, productLine, productSeries), { undeliveredQty: qty });
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
    missingPriceRecords: [
      ...inventory.missingPriceRecords,
      ...sales.missingPriceRecords
    ],
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

function uniqueMaterialCodes(values) {
  return [...new Set((values || []).map(normalizeMaterialCode).filter(Boolean))].sort((a, b) => (
    a.localeCompare(b, 'zh-CN', { numeric: true })
  ));
}

function missingPriceStatus(label, count, materialCodes) {
  if (!count) return '';
  const codes = uniqueMaterialCodes(materialCodes);
  return `${label}缺少结算价${count}条${codes.length ? `（物料编码：${codes.join('、')}）` : ''}`;
}

function calculateRow(
  identity,
  opening,
  closing,
  sales,
  undelivered,
  period,
  openingApproximate,
  missingPriceCodes = {}
) {
  const openingInventoryCost = Number(opening?.amount) || 0;
  const closingInventoryCost = Number(closing?.amount) || 0;
  const averageInventoryCost = (openingInventoryCost + closingInventoryCost) / 2;
  const periodOperatingCost = Number(sales?.salesCost) || 0;
  const salesRecordRows = Number(sales?.salesRecordRows) || 0;
  const monthlyAverageSalesCost = periodOperatingCost / period.months;
  const outboundQty = Number(sales?.outboundQty) || 0;
  const undeliveredQty = Number(undelivered?.undeliveredQty) || 0;
  const openingMissingPriceRows = Number(opening?.missingPriceRows) || 0;
  const closingMissingPriceRows = Number(closing?.missingPriceRows) || 0;
  const salesMissingPriceRows = Number(sales?.missingPriceRows) || 0;
  const missingPriceRows = openingMissingPriceRows + closingMissingPriceRows + salesMissingPriceRows;
  const openingMissingPriceMaterialCodes = uniqueMaterialCodes(missingPriceCodes.opening);
  const closingMissingPriceMaterialCodes = uniqueMaterialCodes(missingPriceCodes.closing);
  const salesMissingPriceMaterialCodes = uniqueMaterialCodes(missingPriceCodes.sales);
  const statusDetails = [
    openingApproximate ? `缺少${period.openingTargetMonth}期初库存快照，使用最早可用快照` : '',
    missingPriceStatus('期初库存', openingMissingPriceRows, openingMissingPriceMaterialCodes),
    missingPriceStatus('期末库存', closingMissingPriceRows, closingMissingPriceMaterialCodes),
    missingPriceStatus('销售数据', salesMissingPriceRows, salesMissingPriceMaterialCodes)
  ].filter(Boolean);
  return {
    ...identity,
    periodDays: period.days,
    openingInventoryCost,
    closingInventoryCost,
    averageInventoryCost,
    monthlyAverageSalesCost,
    periodOperatingCost,
    salesRecordRows,
    hasSalesData: salesRecordRows > 0 ? '有销售数据' : '无销售数据',
    inventoryTurnoverDays: periodOperatingCost > 0
      ? period.days * (averageInventoryCost / periodOperatingCost)
      : null,
    undeliveredQty,
    outboundQty,
    undeliveredCoverageDays: outboundQty > 0
      ? period.days * (undeliveredQty / outboundQty)
      : null,
    openingMissingPriceRows,
    closingMissingPriceRows,
    salesMissingPriceRows,
    missingPriceRows,
    openingMissingPriceMaterialCodes,
    closingMissingPriceMaterialCodes,
    salesMissingPriceMaterialCodes,
    dataStatus: statusDetails.length ? statusDetails.join('；') : '完整'
  };
}

function aggregateCalculatedRows(rows, identity, period, openingApproximate) {
  const totals = rows.reduce((result, row) => ({
    openingInventoryCost: result.openingInventoryCost + row.openingInventoryCost,
    closingInventoryCost: result.closingInventoryCost + row.closingInventoryCost,
    periodOperatingCost: result.periodOperatingCost + row.periodOperatingCost,
    salesRecordRows: result.salesRecordRows + row.salesRecordRows,
    undeliveredQty: result.undeliveredQty + row.undeliveredQty,
    outboundQty: result.outboundQty + row.outboundQty,
    openingMissingPriceRows: result.openingMissingPriceRows + row.openingMissingPriceRows,
    closingMissingPriceRows: result.closingMissingPriceRows + row.closingMissingPriceRows,
    salesMissingPriceRows: result.salesMissingPriceRows + row.salesMissingPriceRows
  }), {
    openingInventoryCost: 0,
    closingInventoryCost: 0,
    periodOperatingCost: 0,
    salesRecordRows: 0,
    undeliveredQty: 0,
    outboundQty: 0,
    openingMissingPriceRows: 0,
    closingMissingPriceRows: 0,
    salesMissingPriceRows: 0
  });
  const missingPriceCodes = {
    opening: uniqueMaterialCodes(rows.flatMap((row) => row.openingMissingPriceMaterialCodes || [])),
    closing: uniqueMaterialCodes(rows.flatMap((row) => row.closingMissingPriceMaterialCodes || [])),
    sales: uniqueMaterialCodes(rows.flatMap((row) => row.salesMissingPriceMaterialCodes || []))
  };
  return calculateRow(identity, {
    amount: totals.openingInventoryCost,
    missingPriceRows: totals.openingMissingPriceRows
  }, {
    amount: totals.closingInventoryCost,
    missingPriceRows: totals.closingMissingPriceRows
  }, {
    salesCost: totals.periodOperatingCost,
    salesRecordRows: totals.salesRecordRows,
    outboundQty: totals.outboundQty,
    missingPriceRows: totals.salesMissingPriceRows
  }, {
    undeliveredQty: totals.undeliveredQty
  }, period, openingApproximate, missingPriceCodes);
}

function selected(filters, field) {
  return Array.isArray(filters?.[field]) ? filters[field].map(normalizeText).filter(Boolean) : [];
}

function inputFilters(input) {
  if (input?.filters && typeof input.filters === 'object') return input.filters;
  return {
    nonInternalTransactionStatus: ['非内部交易'],
    finishedGoodsStatus: ['成品'],
    hasSalesData: ['有销售数据']
  };
}

function matchesFilters(identity, filters, fields) {
  return fields.every((field) => {
    const values = selected(filters, field);
    return !values.length || values.includes(normalizeText(identity[field]));
  });
}

function aggregateInventoryComponents(source, filters) {
  const target = new Map();
  for (const [key, values] of source || []) {
    const identity = groupIdentity(key);
    if (!matchesFilters(identity, filters, ['department', 'productLine', 'productSeries'])) continue;
    addMetric(target, groupKey(identity.department, identity.productLine, identity.productSeries), values);
  }
  return target;
}

function aggregateSalesComponents(cache, period, filters) {
  const target = new Map();
  for (const month of period.monthList) {
    for (const [key, values] of cache.salesMonths.get(month) || []) {
      const identity = salesGroupIdentity(key);
      if (!matchesFilters(identity, filters, [
        'department',
        'productLine',
        'productSeries',
        'nonInternalTransactionStatus',
        'finishedGoodsStatus'
      ])) continue;
      addMetric(target, groupKey(identity.department, identity.productLine, identity.productSeries), values);
    }
  }
  return target;
}

function inventoryTurnoverOptions(cache) {
  const values = {
    department: new Set(),
    productLine: new Set(),
    productSeries: new Set(),
    nonInternalTransactionStatus: new Set(),
    finishedGoodsStatus: new Set()
  };
  for (const snapshot of cache.inventorySnapshots.values()) {
    for (const key of snapshot.keys()) {
      const identity = groupIdentity(key);
      values.department.add(identity.department);
      values.productLine.add(identity.productLine);
      values.productSeries.add(identity.productSeries);
    }
  }
  for (const month of cache.salesMonths.values()) {
    for (const key of month.keys()) {
      const identity = salesGroupIdentity(key);
      for (const field of Object.keys(values)) values[field].add(identity[field]);
    }
  }
  for (const key of cache.undelivered.keys()) {
    const identity = groupIdentity(key);
    values.department.add(identity.department);
    values.productLine.add(identity.productLine);
    values.productSeries.add(identity.productSeries);
  }
  const statusOrder = ['非内部交易', '内部交易', '未匹配'];
  const finishedOrder = ['成品', '非成品', '未匹配'];
  const sortText = (items) => [...items].filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const sortPreferred = (items, order) => [...items].filter(Boolean).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi)
      || a.localeCompare(b, 'zh-CN');
  });
  return {
    department: sortText(values.department),
    productLine: sortText(values.productLine),
    productSeries: sortText(values.productSeries),
    nonInternalTransactionStatus: sortPreferred(values.nonInternalTransactionStatus, statusOrder),
    finishedGoodsStatus: sortPreferred(values.finishedGoodsStatus, finishedOrder),
    hasSalesData: ['有销售数据', '无销售数据']
  };
}

function missingPriceRowsForQuery(cache, period, filters, openingSnapshotMonth, sales) {
  const inventoryMonths = new Set([openingSnapshotMonth, period.endMonth]);
  const salesMonths = new Set(period.monthList);
  return (cache.missingPriceRecords || []).filter((row) => {
    if (!matchesFilters(row, filters, ['department', 'productLine', 'productSeries'])) return false;
    const hasSalesData = sales.has(groupKey(row.department, row.productLine, row.productSeries))
      ? '有销售数据'
      : '无销售数据';
    if (!matchesFilters({ hasSalesData }, filters, ['hasSalesData'])) return false;
    if (row.sourceType === '库存快照') return inventoryMonths.has(row.month);
    return salesMonths.has(row.month)
      && matchesFilters(row, filters, ['nonInternalTransactionStatus', 'finishedGoodsStatus']);
  });
}

function missingPriceCodesByGroup(rows, openingSnapshotMonth, closingSnapshotMonth) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row.department, row.productLine, row.productSeries);
    if (!groups.has(key)) groups.set(key, { opening: [], closing: [], sales: [] });
    const group = groups.get(key);
    if (row.sourceType === '销售数据') {
      group.sales.push(row.materialCode);
      continue;
    }
    if (row.month === openingSnapshotMonth) group.opening.push(row.materialCode);
    if (row.month === closingSnapshotMonth) group.closing.push(row.materialCode);
  }
  for (const group of groups.values()) {
    group.opening = uniqueMaterialCodes(group.opening);
    group.closing = uniqueMaterialCodes(group.closing);
    group.sales = uniqueMaterialCodes(group.sales);
  }
  return groups;
}

export function sortInventoryTurnoverChartRows(rows, field) {
  const order = TURNOVER_CHART_ORDERS[field] || [];
  const aliases = TURNOVER_CHART_ORDER_ALIASES[field] || {};
  const orderIndex = new Map(order.map((value, index) => [value, index]));
  const rank = (name) => orderIndex.get(aliases[name] || name) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => (
    rank(a.name) - rank(b.name)
    || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
  ));
}

function chartRows(rows, field, period, openingApproximate) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[field] || '未匹配';
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return sortInventoryTurnoverChartRows([...groups.entries()]
    .map(([name, items]) => ({
      name,
      ...aggregateCalculatedRows(items, { [field]: name }, period, openingApproximate)
    })), field);
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
  const filters = inputFilters(input);
  const opening = aggregateInventoryComponents(cache.inventorySnapshots.get(openingSnapshotMonth), filters);
  const closing = aggregateInventoryComponents(cache.inventorySnapshots.get(period.endMonth), filters);
  const sales = aggregateSalesComponents(cache, period, filters);
  const undelivered = aggregateInventoryComponents(cache.undelivered, filters);
  const missingPriceRows = missingPriceRowsForQuery(cache, period, filters, openingSnapshotMonth, sales);
  const missingPriceCodes = missingPriceCodesByGroup(
    missingPriceRows,
    openingSnapshotMonth,
    period.endMonth
  );
  const keys = new Set([
    ...opening.keys(),
    ...closing.keys(),
    ...sales.keys(),
    ...undelivered.keys()
  ]);
  const allRows = [...keys].map((key) => calculateRow(
    groupIdentity(key),
    opening.get(key),
    closing.get(key),
    sales.get(key),
    undelivered.get(key),
    period,
    openingApproximate,
    missingPriceCodes.get(key)
  )).sort((a, b) => (
    a.department.localeCompare(b.department, 'zh-CN')
    || a.productLine.localeCompare(b.productLine, 'zh-CN')
    || a.productSeries.localeCompare(b.productSeries, 'zh-CN')
  ));
  const filteredRows = allRows.filter((row) => matchesFilters(row, filters, ['hasSalesData']));
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
      missingPriceRows: missingPriceRows.length,
      inventoryMonths: cache.inventoryMonths,
      commonMonths: cache.commonMonths
    },
    options: inventoryTurnoverOptions(cache),
    rows: filteredRows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, totalPages, totalRows }
  };
}

export function exportInventoryTurnoverRows(cache, input = {}) {
  const result = queryInventoryTurnover(cache, { ...input, page: 1 });
  if (result.status !== 'ready') return [];
  const filters = inputFilters(input);
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

export function exportInventoryTurnoverMissingPriceRows(cache, input = {}) {
  const result = queryInventoryTurnover(cache, { ...input, page: 1 });
  if (result.status !== 'ready') return [];
  const filters = inputFilters(input);
  const sales = aggregateSalesComponents(cache, result.period, filters);
  return missingPriceRowsForQuery(
    cache,
    result.period,
    filters,
    result.period.openingSnapshotMonth,
    sales
  );
}
