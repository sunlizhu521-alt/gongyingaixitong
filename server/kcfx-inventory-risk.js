import {
  firstNumber,
  firstText,
  firstValue,
  firstValueByHeaderIncludes,
  getCachedSalesRows,
  mapProducts,
  mapWarehouses,
  normalizeMaterialCode,
  normalizeText,
  rowsOf
} from '../src/components/kcfxUtils.js';

export const KCFX_INVENTORY_RISK_VERSION = 1;

export const INVENTORY_RISK_DEFAULT_PARAMS = Object.freeze({
  transitHighOverseas: 120,
  transitHighDomestic: 38,
  transitSevereOverseas: 180,
  transitSevereDomestic: 83,
  chainAttentionOverseas: 165,
  chainAttentionDomestic: 83,
  chainInterventionOverseas: 200,
  chainInterventionDomestic: 120,
  deliveryPeriod: 45,
  forecastMonths: 6,
  historicalMonths: 6
});

const REQUIRED_RECORDS = [
  ['fact-inventory', '最近关账库存'],
  ['sales-forecast', '销售预测文件'],
  ['sales-data', '销售数据文件'],
  ['purchase-order-data', '采购订单文件'],
  ['dim-product', '商品分类维表'],
  ['dim-warehouse', '仓库维表']
];
const REGIONS = ['国内', '海外'];
const DOMESTIC_DEPARTMENTS = new Set(['国内事业部', '销售部-工厂']);
const DOMESTIC_LOCATION_PATTERN = /(中国|国内|杭州|宁波|河北|京东|线下门店)/i;
const OVERSEAS_LOCATION_PATTERN = /(海外|跨境|FBA|FBM|WFS|Wayfair|Walmart|美国|欧洲|德国|英国|加拿大|西班牙|澳大利亚|澳洲|新加坡|日本|法国|意大利|波兰)/i;

function valueByHeader(row, names, includes = []) {
  const direct = firstValue(row, names);
  if (normalizeText(direct) !== '') return direct;
  return includes.length ? firstValueByHeaderIncludes(row, includes) : '';
}

function inventoryQuantity(row) {
  return firstNumber([
    valueByHeader(row, [
      '(结存)数量（库存）',
      '(结存)数量(库存)',
      '结存数量（库存）',
      '结存数量(库存)',
      '数量（库存）',
      '数量(库存)',
      '结余库存数量',
      '合计库存数量'
    ]),
    firstValueByHeaderIncludes(row, ['结存', '数量'], ['金额', '天到', '天以上']),
    firstValueByHeaderIncludes(row, ['结余', '库存', '数量'])
  ]);
}

function normalizedDepartment(value) {
  return normalizeText(value).split(/[\*＊]/, 1)[0].trim();
}

function departmentRegion(value) {
  const department = normalizedDepartment(value);
  if (!department || department.startsWith('未匹配')) return '';
  return DOMESTIC_DEPARTMENTS.has(department) ? '国内' : '海外';
}

function warehouseRegion(location) {
  const text = normalizeText(location);
  if (!text) return '';
  const domestic = DOMESTIC_LOCATION_PATTERN.test(text);
  const overseas = OVERSEAS_LOCATION_PATTERN.test(text);
  if (domestic === overseas) return '';
  return domestic ? '国内' : '海外';
}

function isExcludedWarehouseType(type) {
  const text = normalizeText(type);
  return text.includes('系统集成')
    || text.includes('样品')
    || text.includes('展厅')
    || text.includes('销售供应商仓');
}

function isSeaTransitWarehouse(type) {
  return normalizeText(type).includes('销售海上在途');
}

function regionMaterialKey(region, materialCode) {
  return `${region}\u001f${materialCode}`;
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

function monthRange(startMonth, count) {
  const start = monthIndex(startMonth);
  return Array.from({ length: count }, (_, index) => monthFromIndex(start + index));
}

function currentMonthInChina(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return year && month ? `${year}-${month}` : now.toISOString().slice(0, 7);
}

export function parseForecastMonthHeader(value) {
  const text = normalizeText(value).normalize('NFKC').replace(/\s+/g, '');
  const match = text.match(/^(\d{4})(?:年|[-/.])(\d{1,2})(?:月)?$/);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, '0')}` : '';
}

function numberParam(input, field) {
  const fallback = INVENTORY_RISK_DEFAULT_PARAMS[field];
  const value = input?.[field] === '' || input?.[field] === undefined ? fallback : Number(input[field]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} 必须是非负数字`);
  return value;
}

function monthParam(input, field) {
  const value = numberParam(input, field);
  if (!Number.isInteger(value) || value < 1 || value > 24) throw new Error(`${field} 必须是1到24之间的整数`);
  return value;
}

export function normalizeInventoryRiskParams(input = {}) {
  const params = {
    transitHighOverseas: numberParam(input, 'transitHighOverseas'),
    transitHighDomestic: numberParam(input, 'transitHighDomestic'),
    transitSevereOverseas: numberParam(input, 'transitSevereOverseas'),
    transitSevereDomestic: numberParam(input, 'transitSevereDomestic'),
    chainAttentionOverseas: numberParam(input, 'chainAttentionOverseas'),
    chainAttentionDomestic: numberParam(input, 'chainAttentionDomestic'),
    chainInterventionOverseas: numberParam(input, 'chainInterventionOverseas'),
    chainInterventionDomestic: numberParam(input, 'chainInterventionDomestic'),
    deliveryPeriod: numberParam(input, 'deliveryPeriod'),
    forecastMonths: monthParam(input, 'forecastMonths'),
    historicalMonths: monthParam(input, 'historicalMonths')
  };
  for (const region of ['Overseas', 'Domestic']) {
    if (params[`transitSevere${region}`] < params[`transitHigh${region}`]) {
      throw new Error(`${region === 'Overseas' ? '海外' : '国内'}在途严重线不得低于偏高线`);
    }
    if (params[`chainIntervention${region}`] < params[`chainAttention${region}`]) {
      throw new Error(`${region === 'Overseas' ? '海外' : '国内'}全链干预线不得低于关注线`);
    }
  }
  return params;
}

function addMetric(map, key, field, value) {
  const current = map.get(key) || {};
  current[field] = (Number(current[field]) || 0) + (Number(value) || 0);
  map.set(key, current);
  return current;
}

function buildInventory(records, productMap) {
  const warehouseMap = mapWarehouses(rowsOf(records['dim-warehouse']));
  const metrics = new Map();
  const unknownMap = new Map();
  for (const sourceRow of rowsOf(records['fact-inventory'])) {
    const qty = inventoryQuantity(sourceRow);
    if (!(qty > 0)) continue;
    const materialCode = normalizeMaterialCode(firstText([
      valueByHeader(sourceRow, ['物料编码', '货品编码', '商品编码']),
      firstValueByHeaderIncludes(sourceRow, ['物料', '编码'])
    ]));
    const warehouse = normalizeText(firstText([
      valueByHeader(sourceRow, ['仓库名称', '仓库', '金蝶仓库', '库存仓库']),
      firstValueByHeaderIncludes(sourceRow, ['仓库'])
    ]));
    if (!materialCode || !warehouse) continue;
    const warehouseInfo = warehouseMap.get(warehouse) || {};
    if (isExcludedWarehouseType(warehouseInfo.type)) continue;
    const isTransit = isSeaTransitWarehouse(warehouseInfo.type);
    const region = isTransit ? '海外' : warehouseRegion(warehouseInfo.location);
    if (!region) {
      const product = productMap.get(materialCode) || {};
      const key = [warehouse, warehouseInfo.location || '', materialCode].join('\u001f');
      const current = unknownMap.get(key) || {
        id: key,
        materialCode,
        sku: normalizeText(product.sku) || '未匹配SKU',
        productLine: normalizeText(product.productLine) || '未匹配产品线',
        warehouse,
        warehouseLocation: normalizeText(warehouseInfo.location) || '未维护',
        qty: 0,
        reason: warehouseInfo.location ? '仓库位置无法判断国内或海外' : '仓库位置未维护'
      };
      current.qty += qty;
      unknownMap.set(key, current);
      continue;
    }
    addMetric(metrics, regionMaterialKey(region, materialCode), isTransit ? 'inTransitQty' : 'onHandQty', qty);
  }
  return { metrics, unknownLocations: [...unknownMap.values()] };
}

function buildForecast(records) {
  const result = new Map();
  for (const row of rowsOf(records['sales-forecast'])) {
    const materialCode = normalizeMaterialCode(valueByHeader(row, ['物料编码', '货品编码', '商品编码']));
    const region = departmentRegion(valueByHeader(row, ['事业部', '部门', '业务部门']));
    if (!materialCode || !region) continue;
    const key = regionMaterialKey(region, materialCode);
    const target = result.get(key) || { months: new Map(), hasRecord: false };
    target.hasRecord = true;
    for (const [header, value] of Object.entries(row || {})) {
      if (header === '__cells') continue;
      const month = parseForecastMonthHeader(header);
      if (!month) continue;
      target.months.set(month, (Number(target.months.get(month)) || 0) + firstNumber([value]));
    }
    result.set(key, target);
  }
  return result;
}

function buildHistoricalSales(records) {
  const totals = new Map();
  const months = new Set();
  for (const row of getCachedSalesRows(records, { includeExcluded: true })) {
    if (
      row.realTransactionStatus !== '真实交易'
      || row.nonInternalTransactionStatus !== '非内部交易'
      || row.finishedGoodsStatus !== '成品'
    ) continue;
    const materialCode = normalizeMaterialCode(row.materialCode);
    const region = departmentRegion(row.salesOrg);
    if (!materialCode || !region || !row.salesMonth) continue;
    months.add(row.salesMonth);
    const key = `${regionMaterialKey(region, materialCode)}\u001f${row.salesMonth}`;
    totals.set(key, (Number(totals.get(key)) || 0) + (Number(row.outboundQty) || 0));
  }
  return { totals, latestMonth: [...months].sort().at(-1) || '' };
}

function buildUndelivered(records) {
  const totals = new Map();
  for (const row of rowsOf(records['purchase-order-data'])) {
    if (normalizeText(valueByHeader(row, ['关闭状态'])) !== '未关闭') continue;
    const qty = firstNumber([valueByHeader(row, ['剩余入库数量'])]);
    if (!(qty > 0)) continue;
    const materialCode = normalizeMaterialCode(valueByHeader(row, ['物料编码', '货品编码', '商品编码']));
    const region = departmentRegion(valueByHeader(row, ['事业部', '部门', '业务部门']));
    if (!materialCode || !region) continue;
    totals.set(regionMaterialKey(region, materialCode), (Number(totals.get(regionMaterialKey(region, materialCode))) || 0) + qty);
  }
  return totals;
}

export function buildInventoryRiskCache(records = {}, savedAt = '') {
  const missingSources = REQUIRED_RECORDS
    .filter(([id]) => !rowsOf(records[id]).length)
    .map(([id, label]) => ({ id, label }));
  const productMap = mapProducts(rowsOf(records['dim-product']));
  const inventory = buildInventory(records, productMap);
  return {
    ok: missingSources.length === 0,
    version: KCFX_INVENTORY_RISK_VERSION,
    source: 'server-inventory-risk',
    savedAt,
    generatedAt: new Date().toISOString(),
    missingSources,
    productMap,
    inventory: inventory.metrics,
    unknownLocations: inventory.unknownLocations,
    forecast: buildForecast(records),
    history: buildHistoricalSales(records),
    undelivered: buildUndelivered(records),
    sources: Object.fromEntries(Object.entries(records).map(([id, record]) => [id, {
      id,
      fileName: record?.fileName || record?.originalName || '',
      rowCount: Number(record?.rowCount || rowsOf(record).length),
      savedAt: record?.rowsSavedAt || record?.serverSavedAt || record?.savedAt || record?.appliedAt || ''
    }]))
  };
}

function riskThresholds(params, region) {
  const suffix = region === '国内' ? 'Domestic' : 'Overseas';
  return {
    transitHigh: params[`transitHigh${suffix}`],
    transitSevere: params[`transitSevere${suffix}`],
    chainAttention: params[`chainAttention${suffix}`],
    chainIntervention: params[`chainIntervention${suffix}`]
  };
}

function actionForDays(transitDays, chainDays, thresholds) {
  if (transitDays >= thresholds.transitSevere || chainDays >= thresholds.chainIntervention) return '停止采购';
  if (transitDays >= thresholds.transitHigh || chainDays >= thresholds.chainAttention) return '限制采购';
  return '正常';
}

export function queryInventoryRisk(cache, input = {}, now = new Date()) {
  let params;
  try {
    params = normalizeInventoryRiskParams(input);
  } catch (error) {
    return { ok: false, status: 'invalid_params', source: cache?.source || 'server-inventory-risk', error: error.message };
  }
  if (!cache?.ok) {
    return {
      ok: false,
      status: 'missing_data',
      source: cache?.source || 'server-inventory-risk',
      error: `缺少有效数据文件：${(cache?.missingSources || []).map((item) => item.label).join('、')}`,
      missingSources: cache?.missingSources || []
    };
  }

  const forecastStartMonth = currentMonthInChina(now);
  const forecastMonths = monthRange(forecastStartMonth, params.forecastMonths);
  const historicalEndMonth = cache.history.latestMonth;
  const historicalMonths = historicalEndMonth
    ? monthRange(monthFromIndex(monthIndex(historicalEndMonth) - params.historicalMonths + 1), params.historicalMonths)
    : [];
  const candidateKeys = new Set();
  for (const [key, values] of cache.inventory) {
    if ((Number(values.onHandQty) || 0) > 0 || (Number(values.inTransitQty) || 0) > 0) candidateKeys.add(key);
  }
  for (const [key, qty] of cache.undelivered) {
    if ((Number(qty) || 0) > 0) candidateKeys.add(key);
  }

  const restricted = [];
  const stopped = [];
  let normalCount = 0;
  for (const key of candidateKeys) {
    const [region, materialCode] = key.split('\u001f');
    if (!REGIONS.includes(region) || !materialCode) continue;
    const inventory = cache.inventory.get(key) || {};
    const forecast = cache.forecast.get(key);
    const forecastTotal = forecastMonths.reduce((total, month) => total + (Number(forecast?.months.get(month)) || 0), 0);
    const applicableForecastMonths = forecastMonths.filter((month) => forecast?.months.has(month));
    const forecastMonthlyAverage = forecastTotal / params.forecastMonths;
    const historicalTotal = historicalMonths.reduce((total, month) => (
      total + (Number(cache.history.totals.get(`${key}\u001f${month}`)) || 0)
    ), 0);
    const historicalMonthlyAverage = historicalTotal / params.historicalMonths;
    const onHandQty = Number(inventory.onHandQty) || 0;
    const inTransitQty = Number(inventory.inTransitQty) || 0;
    const undeliveredQty = Number(cache.undelivered.get(key)) || 0;
    const inventoryQty = onHandQty + inTransitQty;
    const noForecast = !(forecast?.hasRecord && applicableForecastMonths.length);
    const forecastStatus = noForecast ? '无销售预测' : forecastTotal > 0 ? '已匹配' : '销售预测为0';
    const dailyForecast = forecastMonthlyAverage / 30;
    const transitTurnoverDays = dailyForecast > 0 ? inventoryQty / dailyForecast : 999;
    const fullChainCoverageDays = dailyForecast > 0
      ? (inventoryQty + undeliveredQty) / dailyForecast + params.deliveryPeriod
      : 999;
    const action = actionForDays(transitTurnoverDays, fullChainCoverageDays, riskThresholds(params, region));
    if (action === '正常') {
      normalCount += 1;
      continue;
    }
    const product = cache.productMap.get(materialCode) || {};
    const row = {
      id: key,
      materialCode,
      sku: normalizeText(product.sku) || '未匹配SKU',
      productLine: normalizeText(product.productLine) || '未匹配产品线',
      inventorySegment: region,
      onHandQty,
      inTransitQty,
      inventoryQty,
      undeliveredQty,
      forecastMonthlyAverage,
      historicalMonthlyAverage,
      transitTurnoverDays,
      fullChainCoverageDays,
      forecastStatus,
      action
    };
    (action === '停止采购' ? stopped : restricted).push(row);
  }
  const sorter = (a, b) => b.fullChainCoverageDays - a.fullChainCoverageDays
    || b.transitTurnoverDays - a.transitTurnoverDays
    || a.materialCode.localeCompare(b.materialCode, 'zh-CN', { numeric: true });
  restricted.sort(sorter);
  stopped.sort(sorter);
  const unknownQty = cache.unknownLocations.reduce((total, row) => total + (Number(row.qty) || 0), 0);

  return {
    ok: true,
    status: 'ready',
    source: cache.source,
    savedAt: cache.savedAt,
    generatedAt: cache.generatedAt,
    params,
    periods: {
      forecastStartMonth,
      forecastEndMonth: forecastMonths.at(-1) || '',
      forecastMonths,
      historicalStartMonth: historicalMonths[0] || '',
      historicalEndMonth,
      historicalMonths
    },
    summary: {
      restrictedCount: restricted.length,
      stoppedCount: stopped.length,
      normalCount,
      unknownLocationCount: cache.unknownLocations.length,
      unknownLocationQty: unknownQty
    },
    restricted,
    stopped,
    diagnostics: {
      unknownLocations: cache.unknownLocations,
      unknownLocationQty: unknownQty
    },
    sources: cache.sources
  };
}

export function inventoryRiskCacheKey(database, recordIds, params, now = new Date()) {
  return [
    KCFX_INVENTORY_RISK_VERSION,
    currentMonthInChina(now),
    database?.kcfxLibrary?.savedAt || '',
    ...recordIds.map((id) => {
      const record = database?.kcfxLibrary?.records?.[id] || {};
      return `${id}:${record.rowsSavedAt || record.serverSavedAt || record.savedAt || record.appliedAt || ''}:${record.rowCount || 0}`;
    }),
    JSON.stringify(normalizeInventoryRiskParams(params))
  ].join('|');
}
