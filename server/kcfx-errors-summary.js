import { isStoreMappingRecordValid, STORE_MAPPING_CUSTOMER_HEADERS } from '../shared/kcfxStoreMapping.js';
import {
  firstText,
  firstValue,
  firstValueByHeaderIncludes,
  normalizeMaterialCode,
  normalizeText,
  nthValue,
  toNumber
} from '../src/components/kcfxUtils.js';

export const KCFX_ERRORS_SUMMARY_VERSION = 1;

export const KCFX_ERRORS_RECORD_IDS = [
  'fact-inventory',
  'fact-2',
  'purchase-order-data',
  'sales-data',
  'dim-product',
  'dim-warehouse',
  'dim-warehouse-material',
  'dim-store-name',
  'dim-customer-material'
];

export function kcfxErrorsSummaryCacheKey(database = {}) {
  return [
    `v${KCFX_ERRORS_SUMMARY_VERSION}`,
    database.kcfxLibrary?.savedAt || '',
    ...KCFX_ERRORS_RECORD_IDS.map((id) => {
      const record = database.kcfxLibrary?.records?.[id] || {};
      const savedAt = record.rowsSavedAt || record.serverSavedAt || record.savedAt || record.appliedAt || '';
      return `${id}:${savedAt}:${record.rowCount || 0}`;
    })
  ].join('|');
}

export function buildKcfxErrorsSummary(records = {}, savedAt = '') {
  const maps = buildDimensionMaps(records);
  return {
    ok: true,
    status: 'ready',
    version: KCFX_ERRORS_SUMMARY_VERSION,
    source: 'server-errors-summary',
    savedAt,
    generatedAt: new Date().toISOString(),
    closed: buildClosedInventoryChecks(records, maps),
    detail: buildInventoryMonthChecks(records, maps),
    sales: buildSalesDataChecks(records, maps)
  };
}

function emptyErrorResult(message = '') {
  return {
    message,
    stockMaterialCount: 0,
    productMissing: [],
    divisionMissing: [],
    warehouseMissing: [],
    settlementMissing: []
  };
}

function emptySalesErrorResult(message = '') {
  return {
    ...emptyErrorResult(message),
    salesRowCount: 0,
    customerMaterialMissing: [],
    storeMissing: []
  };
}

function buildDimensionMaps(records) {
  const productMap = mapProduct(records['dim-product']?.rows || []);
  const divisionRows = records['dim-warehouse-material']?.rows || [];
  const warehouseRows = records['dim-warehouse']?.rows || [];
  const customerMaterialRows = records['dim-store-name']?.rows || [];
  const storeRecord = records['dim-customer-material'];
  const storeNameMap = mapStoreNames(storeRecord?.rows || []);
  return {
    productMap,
    divisionMaterialCodes: mapDivisionMaterialCodes(divisionRows),
    divisionDepartmentKeys: mapDivisionDepartmentKeys(divisionRows),
    divisionWarehouses: mapDivisionWarehouses(divisionRows),
    warehouseNames: mapWarehouseNames(warehouseRows),
    customerMaterialKeys: mapCustomerMaterialKeys(customerMaterialRows),
    storeNames: new Set(storeNameMap.keys()),
    storeNameSamples: [...storeNameMap.values()].slice(0, 8),
    storeSummaryValid: isStoreMappingRecordValid(storeRecord),
    storeSummaryRecord: storeRecord
  };
}

function buildClosedInventoryChecks(records, maps) {
  const fact = records['fact-inventory'];
  if (!fact) return emptyErrorResult('关账库存事实表：未引用');
  if (!records['dim-product']) return emptyErrorResult('关账库存事实表：缺少商品分类维表');
  if (!records['dim-warehouse-material']) return emptyErrorResult('关账库存事实表：缺少仓库物料事业部对照表');

  const stockMaterials = summarizeByMaterial(fact.rows || [], getClosedMaterialCode, getClosedMaterialName, getClosedStockQty);
  const stockWarehouses = summarizeByWarehouse(fact.rows || [], getClosedWarehouse, getClosedStockQty);
  const productMissing = stockMaterials.filter((item) => !maps.productMap.has(item.materialCode));
  const divisionMissing = summarizeDivisionMissing(fact.rows || [], maps.productMap, {
    qtyGetter: getClosedStockQty,
    materialGetter: getClosedMaterialCode,
    materialNameGetter: getClosedMaterialName,
    organizationGetter: getClosedOrganization,
    warehouseGetter: getClosedWarehouse,
    isMissing: (row, materialCode) => !maps.divisionMaterialCodes.has(materialCode)
  });
  const warehouseSet = maps.warehouseNames.size ? maps.warehouseNames : maps.divisionWarehouses;
  const settlementMissing = stockMaterials.filter((item) => {
    const product = maps.productMap.get(item.materialCode);
    return product && isSalesFinishedProduct(product) && product.settlementPrice <= 0;
  });

  return {
    stockMaterialCount: stockMaterials.length,
    productMissing: productMissing.map((item) => enrichMissingRow(item, maps.productMap)),
    divisionMissing,
    warehouseMissing: stockWarehouses.filter((item) => !warehouseSet.has(item.warehouse)),
    settlementMissing: settlementMissing.map((item) => enrichMissingRow(item, maps.productMap))
  };
}

function buildInventoryMonthChecks(records, maps) {
  const detail = records['fact-2'];
  if (!detail) return emptyErrorResult('库存分析月份表：未引用');
  if (!records['dim-product']) return emptyErrorResult('库存分析月份表：缺少商品分类维表');
  if (!records['dim-warehouse-material']) return emptyErrorResult('库存分析月份表：缺少仓库物料事业部对照表');

  const rows = detail.rows || [];
  const stockMaterials = summarizeByMaterial(rows, getDetailMaterialCode, getDetailMaterialName, getDetailStockQty);
  const stockWarehouses = summarizeByWarehouse(rows, getDetailWarehouse, getDetailStockQty);
  const productMissing = stockMaterials.filter((item) => !maps.productMap.has(item.materialCode));
  const divisionMissing = summarizeDivisionMissing(rows, maps.productMap, {
    qtyGetter: getDetailStockQty,
    materialGetter: getDetailMaterialCode,
    materialNameGetter: getDetailMaterialName,
    organizationGetter: getDetailOrganization,
    warehouseGetter: getDetailWarehouse,
    isMissing: (row) => !maps.divisionDepartmentKeys.has(makeDetailDepartmentKey(row))
  });
  const settlementMissing = stockMaterials.filter((item) => {
    const product = maps.productMap.get(item.materialCode);
    return product && isSalesFinishedProduct(product) && product.settlementPrice <= 0;
  });

  return {
    stockMaterialCount: stockMaterials.length,
    productMissing: productMissing.map((item) => enrichMissingRow(item, maps.productMap)),
    divisionMissing,
    warehouseMissing: maps.warehouseNames.size
      ? stockWarehouses.filter((item) => !maps.warehouseNames.has(item.warehouse))
      : [],
    settlementMissing: settlementMissing.map((item) => enrichMissingRow(item, maps.productMap))
  };
}

function buildSalesDataChecks(records, maps) {
  const sales = records['sales-data'];
  if (!sales) return emptySalesErrorResult('销售数据文件：未引用');

  const rows = (sales.rows || []).filter((row) => (
    getSalesMaterialCode(row)
    || getSalesStoreName(row)
    || getSalesStoreNameForStoreSummary(row)
    || getSalesCustomerName(row)
  ));
  const salesStoreValues = collectSalesStoreValues(rows);
  const stockMaterials = summarizeByMaterial(rows, getSalesMaterialCode, getSalesMaterialName, getSalesReceivableQty);
  const productMissing = stockMaterials.filter((item) => !maps.productMap.has(item.materialCode));
  return {
    ...emptySalesErrorResult(),
    salesRowCount: rows.length,
    stockMaterialCount: stockMaterials.length,
    productMissing: productMissing.map((item) => enrichMissingRow(item, maps.productMap)),
    customerMaterialMissing: summarizeSalesCustomerMaterialMissing(rows, maps.customerMaterialKeys, maps.productMap),
    storeMissing: maps.storeSummaryValid ? summarizeSalesStoreMissing(rows, maps.storeNames) : [],
    storeDiagnostic: buildSalesStoreDiagnostic(
      salesStoreValues,
      maps.storeNames,
      maps.storeNameSamples,
      maps.storeSummaryValid,
      maps.storeSummaryRecord
    )
  };
}

function summarizeByMaterial(rows, materialGetter, nameGetter, qtyGetter) {
  const map = new Map();
  for (const row of rows) {
    const materialCode = materialGetter(row);
    if (!materialCode) continue;
    const qty = qtyGetter(row);
    if (qty <= 0) continue;
    if (!map.has(materialCode)) {
      map.set(materialCode, {
        materialCode,
        sku: normalizeText(firstValue(row, ['SKU'])),
        materialName: nameGetter(row),
        qty: 0
      });
    }
    const item = map.get(materialCode);
    item.qty += qty;
    if (!item.sku) item.sku = normalizeText(firstValue(row, ['SKU']));
    if (!item.materialName) item.materialName = nameGetter(row);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.materialCode.localeCompare(b.materialCode, 'zh-CN'));
}

function summarizeByWarehouse(rows, warehouseGetter, qtyGetter) {
  const map = new Map();
  for (const row of rows) {
    const warehouse = warehouseGetter(row);
    if (!warehouse) continue;
    const qty = qtyGetter(row);
    if (qty <= 0) continue;
    map.set(warehouse, (map.get(warehouse) || 0) + qty);
  }
  return [...map.entries()]
    .map(([warehouse, qty]) => ({ warehouse, qty }))
    .sort((a, b) => b.qty - a.qty || a.warehouse.localeCompare(b.warehouse, 'zh-CN'));
}

function summarizeDivisionMissing(rows, productMap, config) {
  const map = new Map();
  for (const row of rows) {
    const qty = config.qtyGetter(row);
    if (qty <= 0) continue;
    const materialCode = config.materialGetter(row);
    if (!materialCode || !config.isMissing(row, materialCode)) continue;
    const organization = config.organizationGetter(row);
    const warehouse = config.warehouseGetter(row);
    const mapKey = `${normalizeKey(organization)}|${normalizeKey(warehouse)}|${materialCode}`;
    if (!map.has(mapKey)) {
      map.set(mapKey, {
        organization,
        warehouse,
        materialCode,
        sku: normalizeText(firstValue(row, ['SKU'])),
        materialName: config.materialNameGetter(row),
        qty: 0
      });
    }
    const item = map.get(mapKey);
    item.qty += qty;
    if (!item.materialName) item.materialName = config.materialNameGetter(row);
  }
  return [...map.values()]
    .map((item) => enrichMissingRow(item, productMap))
    .sort((a, b) => b.qty - a.qty
      || a.organization.localeCompare(b.organization, 'zh-CN')
      || a.warehouse.localeCompare(b.warehouse, 'zh-CN')
      || a.materialCode.localeCompare(b.materialCode, 'zh-CN'));
}

function summarizeSalesCustomerMaterialMissing(rows, customerMaterialKeys, productMap) {
  const map = new Map();
  for (const row of rows) {
    const materialCode = getSalesMaterialCode(row);
    const customer = getSalesCustomerName(row) || getSalesStoreName(row);
    if (!materialCode || !customer || customerMaterialKeys.has(makeCustomerMaterialKey(customer, materialCode))) continue;
    const mapKey = `${normalizeStoreName(customer)}|${materialCode}`;
    if (!map.has(mapKey)) {
      map.set(mapKey, {
        salesDepartment: getSalesDepartmentName(row),
        customer,
        materialCode,
        sku: normalizeText(firstValue(row, ['SKU'])),
        materialName: getSalesMaterialName(row),
        qty: 0
      });
    }
    const item = map.get(mapKey);
    item.qty += getSalesReceivableQty(row);
    if (!item.salesDepartment) item.salesDepartment = getSalesDepartmentName(row);
    if (!item.materialName) item.materialName = getSalesMaterialName(row);
  }
  return [...map.values()]
    .map((item) => enrichSalesCustomerRow(item, productMap))
    .sort((a, b) => b.qty - a.qty || a.customer.localeCompare(b.customer, 'zh-CN') || a.materialCode.localeCompare(b.materialCode, 'zh-CN'));
}

function summarizeSalesStoreMissing(rows, storeNames) {
  const map = new Map();
  for (const row of rows) {
    const store = getSalesStoreNameForStoreSummary(row);
    if (!store) continue;
    const normalized = normalizeStoreName(store);
    if (storeNames.has(normalized)) continue;
    if (!map.has(normalized)) map.set(normalized, { store, normalized, qty: 0 });
    map.get(normalized).qty += getSalesReceivableQty(row);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.store.localeCompare(b.store, 'zh-CN'));
}

function collectSalesStoreValues(rows) {
  const map = new Map();
  for (const row of rows) {
    const store = getSalesStoreNameForStoreSummary(row);
    const normalized = normalizeStoreName(store);
    if (!store || !normalized) continue;
    if (!map.has(normalized)) map.set(normalized, { raw: store, normalized, qty: 0 });
    map.get(normalized).qty += getSalesReceivableQty(row);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.raw.localeCompare(b.raw, 'zh-CN'));
}

function buildSalesStoreDiagnostic(values, storeNames, samples, valid, record) {
  const hitCount = values.filter((item) => storeNames.has(item.normalized)).length;
  return {
    salesCount: values.length,
    dimCount: storeNames.size,
    hitCount,
    missingCount: values.length - hitCount,
    salesSamples: values.slice(0, 8).map((item) => item.raw),
    dimSamples: samples,
    storeSummaryValid: valid,
    storeSheetName: record?.sheetName || record?.parseDiagnostics?.sheetName || '',
    storeHeaderB: record?.headers?.[1] || record?.parseDiagnostics?.headerFirst12?.[1] || ''
  };
}

function mapProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    const materialCode = normalizeMaterialCode(firstText([firstValue(row, ['物料编码']), nthValue(row, 1)]));
    if (!materialCode || map.has(materialCode)) continue;
    map.set(materialCode, {
      sku: normalizeText(firstText([firstValue(row, ['SKU']), nthValue(row, 3)])),
      materialName: normalizeText(firstText([firstValue(row, ['金蝶名称', '物料名称', '货品名称']), nthValue(row, 4)])),
      productLine: normalizeText(firstText([firstValue(row, ['销售产品线', '产品线']), nthValue(row, 7)])),
      settlementPrice: firstNumber([
        firstValue(row, ['结算价（含税）', '结算价(含税)', '结算价含税', '结算价', '内部结算价', '26年内部结算价', '2026年内部结算价']),
        firstValueByHeaderIncludes(row, ['结算价']),
        nthValue(row, 9)
      ])
    });
  }
  return map;
}

function mapDivisionMaterialCodes(rows) {
  return new Set(rows.map((row) => normalizeMaterialCode(firstText([firstValue(row, ['物料编码']), nthValue(row, 3)]))).filter(Boolean));
}

function mapDivisionDepartmentKeys(rows) {
  return new Set(rows.map((row) => normalizeDepartmentKey(firstText([
    firstValue(row, ['F列', '匹配键', '三元组合', '三元联合键']),
    nthValue(row, 6),
    [
      firstValue(row, ['使用组织', '库存组织', '组织']),
      firstValue(row, ['仓库名称', '仓库', '金蝶仓库', '库存仓库']),
      firstValue(row, ['物料编码'])
    ].join('')
  ]))).filter(Boolean));
}

function mapDivisionWarehouses(rows) {
  return new Set(rows.map((row) => normalizeText(firstText([
    firstValue(row, ['仓库', '仓库名称', '金蝶名称']),
    nthValue(row, 2)
  ]))).filter(Boolean));
}

function mapWarehouseNames(rows) {
  return new Set(rows.map((row) => normalizeText(firstText([
    firstValue(row, ['仓库金蝶名称', '仓库名称', '金蝶名称', '仓库']),
    nthValue(row, 2)
  ]))).filter(Boolean));
}

function mapCustomerMaterialKeys(rows) {
  const set = new Set();
  for (const row of rows) {
    const materialCode = normalizeMaterialCode(firstText([
      firstValue(row, ['物料编码', '货品编码', '商品编码', 'SKU']),
      nthValue(row, 2),
      nthValue(row, 3)
    ]));
    const customer = normalizeText(firstText([
      firstValue(row, ['客户', '客户名称', '渠道', '店铺', '店铺名称', '店铺简称', '简称', '金蝶客户', '领星客户']),
      nthValue(row, 1)
    ]));
    const explicitKey = normalizeCustomerMaterialKey(firstText([
      firstValue(row, ['客户名称&物料编码', '客户名称+物料编码', '匹配键', '客户物料键', '客户物料匹配键', '客户+物料', '店铺物料键'])
    ]));
    if (explicitKey) set.add(explicitKey);
    if (materialCode && customer) set.add(makeCustomerMaterialKey(customer, materialCode));
  }
  return set;
}

function mapStoreNames(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const candidate of [firstValue(row, STORE_MAPPING_CUSTOMER_HEADERS), nthValue(row, 2)]) {
      const raw = normalizeText(candidate);
      const value = normalizeStoreName(raw);
      if (value && !map.has(value)) map.set(value, raw);
    }
  }
  return map;
}

function enrichMissingRow(item, productMap) {
  const product = productMap.get(item.materialCode) || {};
  return {
    organization: item.organization || '',
    warehouse: item.warehouse || '',
    materialCode: item.materialCode,
    sku: item.sku || product.sku || '',
    materialName: item.materialName || product.materialName || '',
    productLine: product.productLine || '',
    qty: item.qty
  };
}

function enrichSalesCustomerRow(item, productMap) {
  const product = productMap.get(item.materialCode) || {};
  return {
    salesDepartment: item.salesDepartment || '',
    customer: item.customer,
    materialCode: item.materialCode,
    sku: item.sku || product.sku || '',
    materialName: item.materialName || product.materialName || '',
    qty: item.qty
  };
}

function isSalesFinishedProduct(product) {
  const productLine = normalizeText(product.productLine);
  if (!productLine) return false;
  if (['其他/配件', '配件', '售后配件', '健康办公'].includes(productLine)) return false;
  return !(productLine.includes('配件') && !productLine.includes('成品'));
}

function getClosedMaterialCode(row) {
  return normalizeMaterialCode(firstValue(row, ['物料编码']));
}

function getClosedMaterialName(row) {
  return normalizeText(firstValue(row, ['物料名称', '金蝶名称', '货品名称']));
}

function getClosedWarehouse(row) {
  return normalizeText(firstValue(row, ['仓库', '仓库名称', '金蝶名称']));
}

function getClosedOrganization(row) {
  return normalizeText(firstText([
    firstValue(row, ['库存组织', '使用组织', '组织', '主体名称']),
    nthValue(row, 1)
  ]));
}

function getClosedStockQty(row) {
  return firstNumber([
    firstValue(row, ['数量', '库存数量', '结存数量', '(结存)数量（库存）', 'K-现货+在途库存']),
    nthValue(row, 7)
  ]);
}

function getDetailMaterialCode(row) {
  return normalizeMaterialCode(firstText([
    firstValue(row, ['物料编码', '货品编码', '商品编码', 'SKU']),
    nthValue(row, 1)
  ]));
}

function getDetailWarehouse(row) {
  return normalizeText(firstText([
    firstValue(row, ['仓库', '仓库名称', '金蝶仓库', '库存仓库']),
    nthValue(row, 3)
  ]));
}

function getDetailOrganization(row) {
  return normalizeText(firstText([
    firstValue(row, ['使用组织', '库存组织', '组织', '主体名称']),
    nthValue(row, 4)
  ]));
}

function getDetailMaterialName(row) {
  return normalizeText(firstValue(row, ['物料名称', '货品名称', '商品名称', '金蝶名称']));
}

function getDetailStockQty(row) {
  return firstNumber([
    firstValue(row, ['数量(库存)', '数量（库存）']),
    firstValue(row, ['合计库存数量', '合计数量', '合计', '关账结存库存']),
    firstValueByHeaderIncludes(row, ['合计', '库存', '数量']),
    firstValueByHeaderIncludes(row, ['合计', '数量']),
    firstValue(row, ['0430结存库存数量', '4月30日结余库存数量', '结余库存数量'])
  ]);
}

function getSalesMaterialCode(row) {
  return normalizeMaterialCode(firstText([
    firstValue(row, ['物料编码', '货品编码', '商品编码', '产品编码', 'SKU', 'MSKU', 'SellerSKU', '平台SKU']),
    firstValueByHeaderIncludes(row, ['物料', '编码']),
    firstValueByHeaderIncludes(row, ['商品', '编码']),
    nthValue(row, 1)
  ]));
}

function getSalesMaterialName(row) {
  return normalizeText(firstText([
    firstValue(row, ['物料名称', '货品名称', '商品名称', '产品名称', '金蝶名称', '品名']),
    firstValueByHeaderIncludes(row, ['物料', '名称']),
    firstValueByHeaderIncludes(row, ['商品', '名称'])
  ]));
}

function getSalesDepartmentName(row) {
  return normalizeText(firstText([
    firstValue(row, ['销售部门名称', '销售部门', '部门名称', '部门']),
    firstValueByHeaderIncludes(row, ['销售', '部门']),
    nthValue(row, 6)
  ]));
}

function getSalesCustomerName(row) {
  return normalizeText(firstText([
    firstValue(row, ['客户', '客户名称', '渠道', '渠道名称', '销售渠道', '买家', '买家名称']),
    firstValueByHeaderIncludes(row, ['客户']),
    firstValueByHeaderIncludes(row, ['渠道'])
  ]));
}

function getSalesStoreName(row) {
  return normalizeText(firstText([
    firstValue(row, ['店铺', '店铺名称', '店铺简称', '平台店铺', '领星店铺', '金蝶店铺', '店铺名', '简称']),
    firstValueByHeaderIncludes(row, ['店铺']),
    firstValueByHeaderIncludes(row, ['简称'])
  ]));
}

function getSalesStoreNameForStoreSummary(row) {
  return normalizeText(nthValue(row, 2));
}

function getSalesReceivableQty(row) {
  return firstNumber([
    firstValue(row, ['应收数量']),
    firstValueByHeaderIncludes(row, ['应收', '数量'])
  ]);
}

function makeDetailDepartmentKey(row) {
  return normalizeDepartmentKey([getDetailOrganization(row), getDetailWarehouse(row), getDetailMaterialCode(row)].join(''));
}

function normalizeDepartmentKey(value) {
  return normalizeMaterialCode(value).replace(/&/g, '').toLowerCase();
}

function makeCustomerMaterialKey(customer, materialCode) {
  return normalizeCustomerMaterialKey(`${customer}${materialCode}`);
}

function normalizeCustomerMaterialKey(value) {
  return normalizeKey(value).replace(/&/g, '').toLowerCase();
}

function normalizeStoreName(value) {
  return normalizeKey(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[&＆]/g, '')
    .replace(/[()（）【】[\]{}<>《》]/g, '')
    .replace(/[，,、；;：:\-_\s]/g, '')
    .toLowerCase();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function firstNumber(candidates) {
  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    const value = toNumber(candidate);
    if (value !== 0 || text === '0') return value;
  }
  return 0;
}
