import {
  inventoryMonthAgeBuckets,
  inventoryMonthAgeQuantity
} from '../shared/kcfxInventoryMonth.js';
import {
  INVENTORY_AGE_FALLBACK_MONTH,
  INVENTORY_AGE_FALLBACK_SLOT_ID,
  INVENTORY_AGE_MONTHS,
  inventoryAgeMonthById,
  latestInventoryAgeSlotId
} from '../shared/kcfxAgeMonths.js';

export const KCFX_AGE_ANALYSIS_VERSION = 4;

export const AGE_ANALYSIS_FILTER_FIELDS = [
  'month',
  'warehouseType',
  'department',
  'ageGroup',
  'saleStatus',
  'productCategory',
  'productLine',
  'productSeries',
  'warehouseLocation'
];

const AGE_ANALYSIS_DEPARTMENT_ORDER = [
  '国内事业部',
  '海外事业一部',
  '海外事业二部',
  '全球招商部',
  '品牌市场部'
];

const AGE_ANALYSIS_AGE_GROUP_ORDER = [
  '0-30天',
  '31-60天',
  '61-90天',
  '91-120天',
  '121-150天',
  '151-180天',
  '181天以上'
];

const SALEABLE_NEW_WAREHOUSE_TYPES = new Set(['销售出库仓', '销售供应商仓', '生产成品仓']);
const RAW_MATERIAL_WAREHOUSE_TYPES = new Set(['生产材料仓', '生成材料仓']);
const OTHER_UNSALEABLE_WAREHOUSE_TYPES = new Set(['系统集成仓', '销售海上在途仓', '销售售后配件仓', '样品/展厅仓', '样品展厅仓']);
const SALEABLE_RETURN_CATEGORIES = new Set(['二手商品-九大产品线', '二手商品-其他/成品', '全新换包装-九大产品线']);
const UNINSPECTED_RETURN_CATEGORIES = new Set(['全新品', '其他/成品']);
const OTHER_UNSALEABLE_RETURN_CATEGORIES = new Set(['健康办公', '其他/配件']);

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/[()\[\]（）【】\s_，,、]/g, '')
    .toLowerCase();
}

export function normalizeAgeAnalysisMaterialCode(value) {
  const compact = normalizeText(value).normalize('NFKC').replace(/[\s,，]/g, '');
  if (/^[+-]?\d+(?:\.0+)?$/.test(compact)) {
    try {
      return BigInt(compact.replace(/\.0+$/, '')).toString();
    } catch {
      return compact;
    }
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(compact)) {
    const numeric = Number(compact);
    if (Number.isSafeInteger(numeric)) return String(numeric);
  }
  return compact;
}

function normalizeMaterialCode(value) {
  return normalizeAgeAnalysisMaterialCode(value);
}

function normalizeDepartmentKey(value) {
  return normalizeMaterialCode(value).replace(/&/g, '').toLowerCase();
}

function structuredDepartmentKey(organization, warehouse, materialCode) {
  const material = normalizeMaterialCode(materialCode);
  if (!material) return '';
  return [organization, warehouse]
    .map((value) => normalizeDepartmentKey(value))
    .concat(material.toLowerCase())
    .join('\u001f');
}

function addDepartmentCandidate(map, key, department) {
  if (!key || !department) return;
  const departments = map.get(key) || new Set();
  departments.add(department);
  map.set(key, departments);
}

function uniqueDepartmentMap(candidates) {
  return new Map(
    [...candidates.entries()]
      .filter(([, departments]) => departments.size === 1)
      .map(([key, departments]) => [key, departments.values().next().value])
  );
}

function rowEntries(row) {
  return Object.entries(row || {}).filter(([key]) => key !== '__cells');
}

function nthValue(row, oneBasedIndex) {
  const index = oneBasedIndex - 1;
  if (Array.isArray(row?.__cells)) return row.__cells[index] ?? '';
  return rowEntries(row).map(([, value]) => value)[index] ?? '';
}

function firstValue(row, names) {
  const candidates = names.map(normalizeHeader);
  const entries = rowEntries(row).map(([key, value]) => ({ key: normalizeHeader(key), value }));
  const exact = entries.find((entry) => candidates.includes(entry.key));
  if (exact) return exact.value;
  return entries.find((entry) => candidates.some((candidate) => candidate.length >= 4 && entry.key.includes(candidate)))?.value ?? '';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(normalizeText(value).replace(/[,，\s元]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifySaleStatus(warehouseType, productCategory) {
  const type = normalizeText(warehouseType);
  const category = normalizeText(productCategory);
  if (SALEABLE_NEW_WAREHOUSE_TYPES.has(type)) return '可售-全新品';
  if (RAW_MATERIAL_WAREHOUSE_TYPES.has(type)) return '不可售-原材料';
  if (OTHER_UNSALEABLE_WAREHOUSE_TYPES.has(type)) return '不可售-集成/在途/配件等';
  if (type.includes('销售退货拆检仓')) {
    if (SALEABLE_RETURN_CATEGORIES.has(category)) return '可售-已拆检';
    if (UNINSPECTED_RETURN_CATEGORIES.has(category)) return '不可售-未拆检';
    if (OTHER_UNSALEABLE_RETURN_CATEGORIES.has(category)) return '不可售-集成/在途/配件等';
  }
  return '';
}

function buildMaps(records) {
  const products = new Map();
  for (const row of records['dim-product']?.rows || []) {
    const materialCode = normalizeMaterialCode(firstValue(row, ['物料编码', '货品编码', '商品编码']) || nthValue(row, 1));
    if (!materialCode || products.has(materialCode)) continue;
    products.set(materialCode, {
      sku: normalizeText(firstValue(row, ['SKU']) || nthValue(row, 3)),
      materialName: normalizeText(firstValue(row, ['金蝶名称', '物料名称', '商品名称']) || nthValue(row, 4)),
      productCategory: normalizeText(firstValue(row, ['销售产品分类', '产品分类', '产品类别', '品类'])),
      productLine: normalizeText(firstValue(row, ['销售产品线', '产品线']) || nthValue(row, 7)),
      productSeries: normalizeText(firstValue(row, ['销售系列', '产品系列', '系列']) || nthValue(row, 8)),
      settlementPrice: toNumber(
        firstValue(row, ['结算价(含税)', '结算价（含税）', '结算价含税', '结算价', '内部结算价'])
        || nthValue(row, 10)
      )
    });
  }

  const warehouses = new Map();
  for (const row of records['dim-warehouse']?.rows || []) {
    const name = normalizeText(firstValue(row, ['仓库金蝶名称', '仓库名称', '金蝶名称', '仓库']) || nthValue(row, 2));
    if (!name || warehouses.has(name)) continue;
    warehouses.set(name, {
      warehouseType: normalizeText(firstValue(row, ['一级仓库分类', '仓库类型', '结存类型']) || nthValue(row, 7)),
      warehouseLocation: normalizeText(firstValue(row, ['二级仓库分类', '仓库位置', '结存位置']) || nthValue(row, 8))
    });
  }

  const departmentCandidates = new Map();
  const warehouseMaterialCandidates = new Map();
  const legacyDepartmentCandidates = new Map();
  for (const row of records['dim-warehouse-material']?.rows || []) {
    const organization = normalizeText(firstValue(row, ['库存组织', '使用组织', '组织']) || nthValue(row, 1));
    const warehouse = normalizeText(firstValue(row, ['仓库名称', '仓库', '金蝶仓库']) || nthValue(row, 2));
    const materialCode = normalizeMaterialCode(firstValue(row, ['物料编码', '商品编码', '货品编码']) || nthValue(row, 3));
    const department = normalizeText(firstValue(row, ['事业部', '部门', '仓库事业部']) || nthValue(row, 7));
    addDepartmentCandidate(
      departmentCandidates,
      structuredDepartmentKey(organization, warehouse, materialCode),
      department
    );
    addDepartmentCandidate(
      warehouseMaterialCandidates,
      structuredDepartmentKey('', warehouse, materialCode),
      department
    );
    addDepartmentCandidate(
      legacyDepartmentCandidates,
      normalizeDepartmentKey(firstValue(row, ['F列', '匹配键', '三元组合', '三元联合键']) || nthValue(row, 6)),
      department
    );
  }
  return {
    products,
    warehouses,
    departments: uniqueDepartmentMap(departmentCandidates),
    warehouseMaterialDepartments: uniqueDepartmentMap(warehouseMaterialCandidates),
    legacyDepartments: uniqueDepartmentMap(legacyDepartmentCandidates)
  };
}

function inventoryIdentity(row) {
  const organization = normalizeText(firstValue(row, ['库存组织', '使用组织', '组织']) || nthValue(row, 1));
  return {
    organization,
    materialCode: normalizeMaterialCode(firstValue(row, ['物料编码', '商品编码', '货品编码']) || nthValue(row, organization ? 2 : 1)),
    materialName: normalizeText(firstValue(row, ['物料名称', '商品名称', '货品名称', '金蝶名称']) || nthValue(row, organization ? 3 : 2)),
    warehouse: normalizeText(firstValue(row, ['仓库', '仓库名称', '金蝶仓库']) || nthValue(row, organization ? 4 : 3))
  };
}

function summarize(rows, field, valueField, limit = 12) {
  const totals = new Map();
  for (const row of rows) {
    const name = normalizeText(row[field]);
    if (!name) continue;
    totals.set(name, (totals.get(name) || 0) + (Number(row[valueField]) || 0));
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit);
}

function selectedValues(filters, field) {
  const values = filters?.[field];
  return Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : [];
}

function rowMatches(row, filters, excludedField = '') {
  return AGE_ANALYSIS_FILTER_FIELDS.every((field) => {
    if (field === excludedField) return true;
    const selected = selectedValues(filters, field);
    return !selected.length || selected.includes(normalizeText(row[field]));
  });
}

function filterRows(rows, filters = {}, search = '') {
  return rows.filter((row) => {
    if (!rowMatches(row, filters)) return false;
    return rowMatchesSearch(row, search);
  });
}

function rowMatchesSearch(row, search = '') {
  const query = normalizeText(search).toLowerCase();
  if (!query) return true;
  return [
    row.materialCode,
    row.sku,
    row.materialName,
    row.warehouse,
    row.organization,
    row.department,
    row.productLine,
    row.productSeries
  ].some((value) => normalizeText(value).toLowerCase().includes(query));
}

function linkedOptions(rows, filters = {}) {
  return Object.fromEntries(AGE_ANALYSIS_FILTER_FIELDS.map((field) => {
    const values = new Set();
    for (const row of rows) {
      if (!rowMatches(row, filters, field)) continue;
      const value = normalizeText(row[field]);
      if (value) values.add(value);
    }
    return [field, [...values].sort((a, b) => {
      if (field === 'month') return a.localeCompare(b);
      if (field === 'department') return compareByPreferredOrder(a, b, AGE_ANALYSIS_DEPARTMENT_ORDER);
      if (field === 'ageGroup') return compareByPreferredOrder(a, b, AGE_ANALYSIS_AGE_GROUP_ORDER);
      return a.localeCompare(b, 'zh-CN');
    })];
  }));
}

function compareByPreferredOrder(a, b, preferredOrder) {
  const aIndex = preferredOrder.indexOf(a);
  const bIndex = preferredOrder.indexOf(b);
  const normalizedAIndex = aIndex >= 0 ? aIndex : Number.MAX_SAFE_INTEGER;
  const normalizedBIndex = bIndex >= 0 ? bIndex : Number.MAX_SAFE_INTEGER;
  return normalizedAIndex - normalizedBIndex || a.localeCompare(b, 'zh-CN');
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function uniqueCount(rows, field) {
  return new Set(rows.map((row) => normalizeText(row[field])).filter(Boolean)).size;
}

function monthSeries(rows) {
  const totals = new Map(INVENTORY_AGE_MONTHS.map((month) => [month.month, { month: month.month, label: month.label, qty: 0, amount: 0 }]));
  for (const row of rows) {
    const current = totals.get(row.month);
    if (!current) continue;
    current.qty += Number(row.qty) || 0;
    current.amount += Number(row.amount) || 0;
  }
  return [...totals.values()].filter((row) => row.qty || row.amount);
}

function ageSeries(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = `${row.month}\u001f${row.ageGroup}`;
    const current = totals.get(key) || {
      month: row.month,
      monthLabel: row.monthLabel,
      ageGroup: row.ageGroup,
      qty: 0,
      amount: 0
    };
    current.qty += Number(row.qty) || 0;
    current.amount += Number(row.amount) || 0;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => a.month.localeCompare(b.month) || a.ageGroup.localeCompare(b.ageGroup, 'zh-CN'));
}

function warehouseTypeSeries(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = `${row.month}\u001f${row.warehouseType}`;
    const current = totals.get(key) || {
      month: row.month,
      monthLabel: row.monthLabel,
      warehouseType: row.warehouseType,
      qty: 0,
      amount: 0
    };
    current.qty += Number(row.qty) || 0;
    current.amount += Number(row.amount) || 0;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => (
    a.month.localeCompare(b.month)
    || a.warehouseType.localeCompare(b.warehouseType, 'zh-CN')
  ));
}

function dimensionSeries(rows, field) {
  const totals = new Map();
  for (const row of rows) {
    const name = normalizeText(row[field]);
    if (!name) continue;
    const key = `${row.month}\u001f${name}`;
    const current = totals.get(key) || {
      month: row.month,
      monthLabel: row.monthLabel,
      name,
      qty: 0,
      amount: 0
    };
    current.qty += Number(row.qty) || 0;
    current.amount += Number(row.amount) || 0;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => (
    a.month.localeCompare(b.month)
    || a.name.localeCompare(b.name, 'zh-CN')
  ));
}

function salesOutboundWarehouseLocationSeries(rows) {
  const totals = new Map();
  for (const row of rows) {
    if (normalizeText(row.warehouseType) !== '销售出库仓') continue;
    const warehouseLocation = normalizeText(row.warehouseLocation) || '未分类仓库位置';
    const key = `${row.month}\u001f${warehouseLocation}`;
    const current = totals.get(key) || {
      month: row.month,
      monthLabel: row.monthLabel,
      warehouseLocation,
      qty: 0,
      amount: 0
    };
    current.qty += Number(row.qty) || 0;
    current.amount += Number(row.amount) || 0;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => (
    a.month.localeCompare(b.month)
    || a.warehouseLocation.localeCompare(b.warehouseLocation, 'zh-CN')
  ));
}

function ratio(current, previous) {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function buildAgeAnalysisCache(records = {}, savedAt = '') {
  const maps = buildMaps(records);
  const rows = [];
  const monthSummaries = [];
  const diagnostics = { missingPriceRows: 0, missingDepartmentRows: 0, missingAgeRows: 0 };

  for (const month of INVENTORY_AGE_MONTHS) {
    const record = records[month.id]
      || (month.month === INVENTORY_AGE_FALLBACK_MONTH ? records['fact-2'] : null);
    if (!record?.rows?.length) continue;
    const ageBuckets = inventoryMonthAgeBuckets(record);
    let sourceQty = 0;
    let expandedQty = 0;
    let usedRows = 0;

    for (const sourceRow of record.rows) {
      const identity = inventoryIdentity(sourceRow);
      if (!identity.materialCode || !identity.warehouse) continue;
      const product = maps.products.get(identity.materialCode) || {};
      const warehouse = maps.warehouses.get(identity.warehouse) || {};
      const departmentKey = structuredDepartmentKey(identity.organization, identity.warehouse, identity.materialCode);
      const warehouseMaterialKey = structuredDepartmentKey('', identity.warehouse, identity.materialCode);
      const legacyDepartmentKey = normalizeDepartmentKey(`${identity.organization}${identity.warehouse}${identity.materialCode}`);
      const department = maps.departments.get(departmentKey)
        || maps.warehouseMaterialDepartments.get(warehouseMaterialKey)
        || maps.legacyDepartments.get(legacyDepartmentKey)
        || '未匹配事业部';
      const settlementPrice = Number(product.settlementPrice) || 0;
      const totalQty = toNumber(firstValue(sourceRow, ['数量(库存)', '数量（库存）', '合计库存数量', '合计数量', '合计']));
      sourceQty += totalQty;
      usedRows += 1;
      if (!settlementPrice) diagnostics.missingPriceRows += 1;
      if (department === '未匹配事业部') diagnostics.missingDepartmentRows += 1;

      let rowAgeQty = 0;
      for (const ageGroup of ageBuckets) {
        const qty = Math.max(0, inventoryMonthAgeQuantity(sourceRow, ageGroup));
        if (!qty) continue;
        rowAgeQty += qty;
        expandedQty += qty;
        const productCategory = product.productCategory || '';
        const warehouseType = warehouse.warehouseType || '未分类仓库类型';
        rows.push({
          id: `${month.id}|${identity.organization}|${identity.warehouse}|${identity.materialCode}|${ageGroup}`,
          month: month.month,
          monthLabel: month.label,
          organization: identity.organization,
          materialCode: identity.materialCode,
          sku: product.sku || '',
          materialName: product.materialName || identity.materialName,
          warehouse: identity.warehouse,
          warehouseType,
          department,
          saleStatus: classifySaleStatus(warehouseType, productCategory),
          productCategory: productCategory || '未分类商品分类',
          productLine: product.productLine || '未分类产品线',
          productSeries: product.productSeries || '未分类销售系列',
          warehouseLocation: warehouse.warehouseLocation || '未分类仓库位置',
          ageGroup,
          qty,
          settlementPrice,
          amount: qty * settlementPrice
        });
      }
      if (totalQty && !rowAgeQty) diagnostics.missingAgeRows += 1;
    }
    monthSummaries.push({
      id: month.id,
      month: month.month,
      label: month.label,
      rowCount: usedRows,
      sourceQty,
      expandedQty,
      ageBuckets,
      record: {
        id: record.id || month.id,
        fileName: record.fileName || record.originalName || '',
        sheetName: record.sheetName || '',
        rowCount: Number(record.rowCount || record.rows.length),
        headerRowNumber: record.parseDiagnostics?.headerRowNumber || record.headerRowNumber || 0,
        savedAt: record.appliedAt || record.savedAt || ''
      }
    });
  }

  const activeRecordId = latestInventoryAgeSlotId(records);
  return {
    ok: true,
    status: 'ready',
    source: 'server-age-analysis',
    version: KCFX_AGE_ANALYSIS_VERSION,
    savedAt,
    generatedAt: new Date().toISOString(),
    activeRecordId: activeRecordId === 'fact-2'
      ? INVENTORY_AGE_FALLBACK_SLOT_ID
      : activeRecordId,
    rows,
    rowCount: rows.length,
    monthSummaries,
    diagnostics
  };
}

export function queryAgeAnalysis(cache, request = {}) {
  const filters = request.filters || {};
  const search = request.search || '';
  const page = Math.max(1, Number(request.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(request.pageSize) || 20));
  const filteredRows = filterRows(cache?.rows || [], filters, search);
  const qty = sum(filteredRows, 'qty');
  const amount = sum(filteredRows, 'amount');
  const trendRows = (cache?.rows || []).filter((row) => {
    const nonMonthFilters = { ...filters, month: [] };
    if (!rowMatches(row, nonMonthFilters)) return false;
    return rowMatchesSearch(row, search);
  });
  const panoramaRows = cache?.rows || [];
  const trend = monthSeries(trendRows);
  const selectedMonths = selectedValues(filters, 'month');
  const currentMonth = [...(selectedMonths.length ? selectedMonths : trend.map((row) => row.month))].sort().at(-1) || '';
  const comparisonIndex = trend.findIndex((row) => row.month === currentMonth);
  const currentTrend = comparisonIndex >= 0 ? trend[comparisonIndex] : null;
  const previousTrend = comparisonIndex > 0 ? trend[comparisonIndex - 1] : null;
  const offset = (page - 1) * pageSize;

  return {
    ok: true,
    status: 'ready',
    savedAt: cache?.savedAt || '',
    generatedAt: cache?.generatedAt || '',
    activeRecordId: cache?.activeRecordId || '',
    metrics: {
      qty,
      amount,
      materialCount: uniqueCount(filteredRows, 'materialCode'),
      warehouseCount: uniqueCount(filteredRows, 'warehouse'),
      rowCount: filteredRows.length,
      comparisonMonth: previousTrend?.month || '',
      qtyMom: currentTrend && previousTrend ? ratio(currentTrend.qty, previousTrend.qty) : null,
      amountMom: currentTrend && previousTrend ? ratio(currentTrend.amount, previousTrend.amount) : null
    },
    trend,
    dimensionTrends: {
      department: dimensionSeries(trendRows, 'department'),
      productLine: dimensionSeries(trendRows, 'productLine'),
      productSeries: dimensionSeries(trendRows, 'productSeries')
    },
    ageTrend: ageSeries(panoramaRows),
    warehouseTypeTrend: warehouseTypeSeries(panoramaRows),
    salesOutboundWarehouseLocationTrend: salesOutboundWarehouseLocationSeries(panoramaRows),
    distributions: {
      ageQty: summarize(filteredRows, 'ageGroup', 'qty', 30),
      ageAmount: summarize(filteredRows, 'ageGroup', 'amount', 30),
      departmentAmount: summarize(filteredRows, 'department', 'amount', 20),
      productLineAmount: summarize(filteredRows, 'productLine', 'amount', 20),
      warehouseLocationAmount: summarize(filteredRows, 'warehouseLocation', 'amount', 20)
    },
    options: linkedOptions(cache?.rows || [], filters),
    pagination: {
      page,
      pageSize,
      totalRows: filteredRows.length,
      totalPages: Math.max(1, Math.ceil(filteredRows.length / pageSize))
    },
    rows: filteredRows.slice(offset, offset + pageSize),
    monthSummaries: cache?.monthSummaries || [],
    diagnostics: cache?.diagnostics || {}
  };
}

export function ageAnalysisDepartmentMissingRows(cache) {
  const grouped = new Map();
  for (const row of cache?.rows || []) {
    if (normalizeText(row.department) !== '未匹配事业部') continue;
    const month = normalizeText(row.month);
    const organization = normalizeText(row.organization);
    const warehouse = normalizeText(row.warehouse);
    const materialCode = normalizeMaterialCode(row.materialCode);
    const key = [month, organization, warehouse, materialCode].join('\u001f');
    const current = grouped.get(key) || {
      month,
      monthLabel: normalizeText(row.monthLabel),
      organization,
      warehouse,
      materialCode,
      sku: normalizeText(row.sku),
      materialName: normalizeText(row.materialName),
      qty: 0,
      reason: '有库存仓库物料事业部对照表没有信息'
    };
    current.qty += Number(row.qty) || 0;
    if (!current.sku) current.sku = normalizeText(row.sku);
    if (!current.materialName) current.materialName = normalizeText(row.materialName);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => (
    a.month.localeCompare(b.month)
    || b.qty - a.qty
    || a.organization.localeCompare(b.organization, 'zh-CN')
    || a.warehouse.localeCompare(b.warehouse, 'zh-CN')
    || a.materialCode.localeCompare(b.materialCode, 'zh-CN')
  ));
}

export function exportAgeAnalysisRows(cache, request = {}) {
  return filterRows(cache?.rows || [], request.filters || {}, request.search || '');
}

export function activeInventoryAgeMetadata(records = {}) {
  const activeId = latestInventoryAgeSlotId(records);
  return {
    activeId,
    month: inventoryAgeMonthById(activeId),
    record: activeId ? records[activeId] || null : null
  };
}
