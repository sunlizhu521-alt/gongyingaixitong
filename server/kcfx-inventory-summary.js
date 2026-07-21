import {
  firstText,
  firstValue,
  firstValueByHeaderIncludes,
  getCachedSalesRows,
  mapDepartments,
  mapProducts,
  mapWarehouses,
  normalizeMaterialCode,
  normalizeText,
  rowsOf,
  toNumber
} from '../src/components/kcfxUtils.js';

export const KCFX_INVENTORY_SUMMARY_VERSION = 1;

const INVENTORY_VIEW_FIELDS = {
  summary: ['department', 'productLine'],
  onHand: ['department', 'productLine', 'inventoryLocation'],
  inTransit: ['department', 'productLine'],
  undelivered: ['supplier', 'department', 'productLine']
};
const SALES_FILTER_FIELDS = ['salesYear', 'salesMonthNumber', 'department', 'channel', 'productLine'];

function normalizeHeader(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/[()\[\]（）【】\s_：:，,、-]/g, '')
    .toLowerCase();
}

function valueByHeader(row, names) {
  const direct = firstValue(row, names);
  if (normalizeText(direct) !== '') return direct;
  const wanted = names.map(normalizeHeader);
  for (const [key, value] of Object.entries(row || {})) {
    const header = normalizeHeader(key);
    if (wanted.includes(header) && normalizeText(value) !== '') return value;
  }
  return '';
}

function numberByHeader(row, names, includes = [], excludes = []) {
  const direct = valueByHeader(row, names);
  if (normalizeText(direct) !== '') return toNumber(direct);
  if (includes.length) return toNumber(firstValueByHeaderIncludes(row, includes, excludes));
  return 0;
}

function normalizeDepartmentKey(value) {
  return normalizeMaterialCode(value).replace(/&/g, '').toLowerCase();
}

function splitPurchaseDepartment(value) {
  const text = normalizeText(value);
  if (!text) return '未匹配事业部';
  const department = text.split(/[\*＊]/, 1)[0].trim();
  return department || '未匹配事业部';
}

function normalizeDimension(value, fallback) {
  return normalizeText(value) || fallback;
}

function inventoryQuantity(row) {
  return numberByHeader(row, [
    '(结存)数量（库存）',
    '(结存)数量(库存)',
    '结存数量（库存）',
    '结存数量(库存)',
    '数量（库存）',
    '数量(库存)',
    '结余库存数量',
    '合计库存数量'
  ], ['结存', '数量'], ['天到', '天以上', '金额', '单价']);
}

function groupRows(rows, keyFields, valueFields) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFields.map((field) => row[field] || '').join('\u0001');
    let target = grouped.get(key);
    if (!target) {
      target = Object.fromEntries(keyFields.map((field) => [field, row[field] || '']));
      for (const field of valueFields) target[field] = 0;
      grouped.set(key, target);
    }
    for (const field of valueFields) target[field] += Number(row[field]) || 0;
  }
  return [...grouped.values()].filter((row) => valueFields.some((field) => Number(row[field]) !== 0));
}

function compareInventoryRows(a, b) {
  return String(a.department || '').localeCompare(String(b.department || ''), 'zh-CN')
    || String(a.productLine || '').localeCompare(String(b.productLine || ''), 'zh-CN')
    || String(a.materialCode || '').localeCompare(String(b.materialCode || ''), 'zh-CN')
    || String(a.supplier || a.inventoryLocation || '').localeCompare(String(b.supplier || b.inventoryLocation || ''), 'zh-CN');
}

function buildInventoryRows(records, productMap) {
  const warehouseMap = mapWarehouses(rowsOf(records['dim-warehouse']));
  const departmentMap = mapDepartments(rowsOf(records['dim-warehouse-material']));
  const onHand = [];
  const inTransit = [];

  for (const sourceRow of rowsOf(records['fact-inventory'])) {
    const materialCode = normalizeMaterialCode(firstText([
      valueByHeader(sourceRow, ['物料编码', '货品编码', '商品编码']),
      firstValueByHeaderIncludes(sourceRow, ['物料', '编码'])
    ]));
    const warehouse = normalizeText(firstText([
      valueByHeader(sourceRow, ['仓库名称', '仓库', '金蝶仓库', '库存仓库']),
      firstValueByHeaderIncludes(sourceRow, ['仓库'])
    ]));
    if (!materialCode || !warehouse) continue;

    const organization = normalizeText(firstText([
      valueByHeader(sourceRow, ['库存组织', '使用组织', '组织', '主体名称']),
      firstValueByHeaderIncludes(sourceRow, ['组织'])
    ]));
    const qty = inventoryQuantity(sourceRow);
    if (!qty) continue;
    const product = productMap.get(materialCode) || {};
    const warehouseInfo = warehouseMap.get(warehouse) || {};
    const departmentKey = normalizeDepartmentKey(`${organization}${warehouse}${materialCode}`);
    const row = {
      department: normalizeDimension(departmentMap.get(departmentKey), '未匹配事业部'),
      productLine: normalizeDimension(product.productLine, '未匹配产品线'),
      materialCode,
      sku: normalizeDimension(product.sku, '未匹配SKU'),
      inventoryLocation: normalizeDimension(warehouseInfo.location, '未匹配库存所在地'),
      qty
    };
    if (normalizeText(warehouseInfo.location) === '海上在途') inTransit.push(row);
    else onHand.push(row);
  }
  return { onHand, inTransit };
}

function buildUndeliveredRows(records, productMap) {
  const rows = [];
  for (const sourceRow of rowsOf(records['purchase-order-data'])) {
    const materialCode = normalizeMaterialCode(valueByHeader(sourceRow, ['物料编码', '货品编码', '商品编码']));
    if (!materialCode) continue;
    if (normalizeText(valueByHeader(sourceRow, ['关闭状态'])) !== '未关闭') continue;
    const qty = numberByHeader(sourceRow, ['剩余入库数量']);
    if (!(qty > 0)) continue;
    const product = productMap.get(materialCode) || {};
    rows.push({
      supplier: normalizeDimension(valueByHeader(sourceRow, ['供应商', '供应商名称']), '未匹配供应商'),
      department: splitPurchaseDepartment(valueByHeader(sourceRow, ['事业部'])),
      productLine: normalizeDimension(product.productLine, '未匹配产品线'),
      materialCode,
      sku: normalizeDimension(product.sku, '未匹配SKU'),
      qty
    });
  }
  return rows;
}

function addInventoryMetric(map, row, field) {
  const keyFields = ['department', 'productLine', 'materialCode', 'sku'];
  const key = keyFields.map((keyField) => row[keyField] || '').join('\u0001');
  let target = map.get(key);
  if (!target) {
    target = {
      department: row.department,
      productLine: row.productLine,
      materialCode: row.materialCode,
      sku: row.sku,
      onHandQty: 0,
      inTransitQty: 0,
      undeliveredQty: 0,
      totalQty: 0
    };
    map.set(key, target);
  }
  target[field] += Number(row.qty) || 0;
  target.totalQty = target.onHandQty + target.inTransitQty + target.undeliveredQty;
}

function buildSalesDetails(records) {
  return getCachedSalesRows(records)
    .filter((row) => row.salesMonth)
    .map((row) => ({
      salesMonth: row.salesMonth,
      salesYear: row.salesYear,
      salesMonthNumber: row.salesMonthNumber,
      department: normalizeDimension(row.salesOrg, '未匹配事业部'),
      channel: normalizeDimension(row.storeShortName, '未匹配渠道'),
      productLine: normalizeDimension(row.productLine, '未匹配产品线'),
      materialCode: normalizeMaterialCode(row.materialCode),
      qty: Number(row.qty) || 0,
      amount: Number(row.amount) || 0,
      searchText: [row.materialCode, row.materialName, row.customer, row.storeShortName, row.salesOrg, row.productLine]
        .map(normalizeText)
        .join('\u0001')
        .toLowerCase()
    }));
}

export function buildInventorySummaryCache(records = {}, savedAt = '') {
  const productMap = mapProducts(rowsOf(records['dim-product']));
  const inventory = buildInventoryRows(records, productMap);
  const undelivered = buildUndeliveredRows(records, productMap);
  const summaryMap = new Map();
  inventory.onHand.forEach((row) => addInventoryMetric(summaryMap, row, 'onHandQty'));
  inventory.inTransit.forEach((row) => addInventoryMetric(summaryMap, row, 'inTransitQty'));
  undelivered.forEach((row) => addInventoryMetric(summaryMap, row, 'undeliveredQty'));

  return {
    ok: true,
    version: KCFX_INVENTORY_SUMMARY_VERSION,
    source: 'server-inventory-summary',
    savedAt,
    generatedAt: new Date().toISOString(),
    inventoryViews: {
      summary: [...summaryMap.values()].filter((row) => row.totalQty !== 0).sort(compareInventoryRows),
      onHand: groupRows(inventory.onHand, ['department', 'productLine', 'materialCode', 'sku', 'inventoryLocation'], ['qty']).sort(compareInventoryRows),
      inTransit: groupRows(inventory.inTransit, ['department', 'productLine', 'materialCode', 'sku'], ['qty']).sort(compareInventoryRows),
      undelivered: groupRows(undelivered, ['supplier', 'department', 'productLine', 'materialCode', 'sku'], ['qty']).sort(compareInventoryRows)
    },
    salesDetails: buildSalesDetails(records),
    sources: Object.fromEntries(Object.entries(records).map(([id, record]) => [id, {
      id,
      fileName: record?.fileName || '',
      rowCount: record?.rowCount || record?.rows?.length || 0,
      savedAt: record?.rowsSavedAt || record?.serverSavedAt || record?.savedAt || record?.appliedAt || ''
    }]))
  };
}

function normalizedSelections(filters = {}) {
  return Object.fromEntries(Object.entries(filters || {}).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : []
  ]));
}

function matchesSelections(row, fields, selections, excludedField = '') {
  return fields.every((field) => {
    if (field === excludedField) return true;
    const selected = selections[field] || [];
    return !selected.length || selected.includes(normalizeText(row[field]));
  });
}

function matchesSearch(row, search, fields) {
  const wanted = normalizeText(search).toLowerCase();
  if (!wanted) return true;
  return fields.some((field) => normalizeText(row[field]).toLowerCase().includes(wanted));
}

function sortedOptions(values, field) {
  const unique = [...new Set(values.map(normalizeText).filter(Boolean))];
  if (field === 'salesYear' || field === 'salesMonthNumber') return unique.sort((a, b) => a.localeCompare(b));
  return unique.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function buildOptions(rows, fields, selections, search, searchFields) {
  return Object.fromEntries(fields.map((field) => [field, sortedOptions(
    rows
      .filter((row) => matchesSelections(row, fields, selections, field) && matchesSearch(row, search, searchFields))
      .map((row) => row[field]),
    field
  )]));
}

function groupSalesRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const fields = ['salesMonth', 'department', 'channel', 'productLine'];
    const key = fields.map((field) => row[field] || '').join('\u0001');
    let target = map.get(key);
    if (!target) {
      target = {
        salesMonth: row.salesMonth,
        dateLabel: `${Number(row.salesYear)}年${Number(row.salesMonthNumber)}月`,
        department: row.department,
        channel: row.channel,
        productLine: row.productLine,
        materialCodes: new Set(),
        materialCodeCount: 0,
        salesQty: 0,
        salesAmount: 0
      };
      map.set(key, target);
    }
    if (row.materialCode) target.materialCodes.add(row.materialCode);
    target.salesQty += Number(row.qty) || 0;
    target.salesAmount += Number(row.amount) || 0;
  }
  return [...map.values()]
    .map(({ materialCodes, ...row }) => ({ ...row, materialCodeCount: materialCodes.size }))
    .sort((a, b) => a.salesMonth.localeCompare(b.salesMonth)
      || a.department.localeCompare(b.department, 'zh-CN')
      || a.channel.localeCompare(b.channel, 'zh-CN')
      || a.productLine.localeCompare(b.productLine, 'zh-CN'));
}

function resolveRows(cache, request = {}) {
  const report = request.report === 'sales' ? 'sales' : 'inventory';
  const selections = normalizedSelections(request.filters);
  const search = request.search || '';
  if (report === 'sales') {
    const searchFields = ['searchText', 'department', 'channel', 'productLine'];
    const baseRows = cache.salesDetails || [];
    const options = buildOptions(baseRows, SALES_FILTER_FIELDS, selections, search, searchFields);
    const filteredDetails = baseRows.filter((row) => (
      matchesSelections(row, SALES_FILTER_FIELDS, selections)
      && matchesSearch(row, search, searchFields)
    ));
    return {
      report,
      view: 'sales',
      rows: groupSalesRows(filteredDetails),
      options,
      defaultYear: sortedOptions(baseRows.map((row) => row.salesYear), 'salesYear').at(-1) || '',
      materialCodeCount: new Set(filteredDetails.map((row) => row.materialCode).filter(Boolean)).size
    };
  }

  const view = Object.prototype.hasOwnProperty.call(INVENTORY_VIEW_FIELDS, request.view) ? request.view : 'summary';
  const fields = INVENTORY_VIEW_FIELDS[view];
  const searchFields = ['materialCode', 'sku', 'department', 'productLine', 'supplier', 'inventoryLocation'];
  const baseRows = cache.inventoryViews?.[view] || [];
  return {
    report,
    view,
    rows: baseRows.filter((row) => matchesSelections(row, fields, selections) && matchesSearch(row, search, searchFields)),
    options: buildOptions(baseRows, fields, selections, search, searchFields),
    defaultYear: ''
  };
}

function metricsForRows(report, view, rows, materialCodeCount = 0) {
  if (report === 'sales') return {
    rowCount: rows.length,
    materialCodeCount,
    salesQty: rows.reduce((total, row) => total + (Number(row.salesQty) || 0), 0),
    salesAmount: rows.reduce((total, row) => total + (Number(row.salesAmount) || 0), 0)
  };
  if (view === 'summary') return {
    rowCount: rows.length,
    onHandQty: rows.reduce((total, row) => total + (Number(row.onHandQty) || 0), 0),
    inTransitQty: rows.reduce((total, row) => total + (Number(row.inTransitQty) || 0), 0),
    undeliveredQty: rows.reduce((total, row) => total + (Number(row.undeliveredQty) || 0), 0),
    totalQty: rows.reduce((total, row) => total + (Number(row.totalQty) || 0), 0)
  };
  return { rowCount: rows.length, qty: rows.reduce((total, row) => total + (Number(row.qty) || 0), 0) };
}

export function queryInventorySummary(cache, request = {}) {
  const resolved = resolveRows(cache, request);
  const totalRows = resolved.rows.length;
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(1, Number(request.page) || 1), totalPages);
  const start = (page - 1) * pageSize;
  return {
    ok: true,
    status: 'ready',
    source: cache.source,
    savedAt: cache.savedAt,
    generatedAt: cache.generatedAt,
    report: resolved.report,
    view: resolved.view,
    defaultYear: resolved.defaultYear,
    options: resolved.options,
    metrics: metricsForRows(resolved.report, resolved.view, resolved.rows, resolved.materialCodeCount),
    rows: resolved.rows.slice(start, start + pageSize),
    pagination: { page, pageSize, totalPages, totalRows },
    sources: cache.sources
  };
}

export function exportInventorySummaryRows(cache, request = {}) {
  return resolveRows(cache, request).rows;
}

export { splitPurchaseDepartment };
