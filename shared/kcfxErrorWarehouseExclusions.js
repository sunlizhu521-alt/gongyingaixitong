export const KCFX_WAREHOUSE_RENAMES = [
  ['101-G-海外一部-英国东荣仓-国源英国', '101-G-海外一部-英国东荣CV5仓-国源英国'],
  ['555-G-退货仓-海外一部-英国东荣仓', '555-G-退货仓-海外一部-英国东荣CV5仓'],
  ['106-G-国内事业部-英国东荣仓-Temu欧区国源', '106-G-国内事业部-英国东荣CV5仓-Temu欧区国源'],
  ['777-G-售后配件仓-英国东荣仓', '777-G-售后配件仓-英国东荣CV5仓'],
  ['104-US-全球招商部-英国东荣仓-分销下单-Global', '104-US-全球招商部-英国东荣CV5仓-分销下单-Global']
];

export const KCFX_ERROR_EXCLUDED_WAREHOUSES = KCFX_WAREHOUSE_RENAMES.flat();

const NORMALIZED_WAREHOUSE_RENAMES = new Map(
  KCFX_WAREHOUSE_RENAMES.map(([oldName, newName]) => [normalizeWarehouseName(oldName), newName])
);

const NORMALIZED_EXCLUDED_WAREHOUSES = new Set(
  KCFX_ERROR_EXCLUDED_WAREHOUSES.map(normalizeWarehouseName)
);

export function isKcfxErrorExcludedWarehouse(value) {
  const normalized = normalizeWarehouseName(value);
  return normalized ? NORMALIZED_EXCLUDED_WAREHOUSES.has(normalized) : false;
}

export function canonicalKcfxWarehouseName(value) {
  const text = String(value ?? '').trim();
  return NORMALIZED_WAREHOUSE_RENAMES.get(normalizeWarehouseName(text)) || text;
}

export function hasKcfxErrorExcludedWarehouse(row) {
  if (!row || typeof row !== 'object') return false;
  return [
    row.warehouse,
    row.warehouseName,
    row.inventoryWarehouse,
    row['仓库'],
    row['仓库名称'],
    row['金蝶仓库'],
    row['库存仓库']
  ].some(isKcfxErrorExcludedWarehouse);
}

function normalizeWarehouseName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\s]/g, '')
    .toLowerCase();
}
