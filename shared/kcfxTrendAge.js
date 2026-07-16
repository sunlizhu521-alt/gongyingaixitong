import { inventoryMonthAgeBuckets } from './kcfxInventoryMonth.js';

export const UNMATCHED_INVENTORY_AGE_BUCKET = '无库龄信息';

const AGE_HEADER_CANDIDATES = {
  '0-30天': ['(0天到30天)数量(库存)', '0-30天数量', '0-30天库存数量', '0-30天'],
  '31-60天': ['(31天到60天)数量(库存)', '31-60天数量', '31-60天库存数量', '31-60天'],
  '61-90天': ['(61天到90天)数量(库存)', '61-90天数量', '61-90天库存数量', '61-90天'],
  '91-120天': ['(91天到120天)数量(库存)', '91-120天数量', '91-120天库存数量', '91-120天'],
  '121-150天': ['(121天到150天)数量(库存)', '121-150天数量', '121-150天库存数量', '121-150天'],
  '151-180天': ['(151天到180天)数量(库存)', '151-180天数量', '151-180天库存数量', '151-180天'],
  '181天以上': ['(181天以上)数量(库存)', '181天以上数量', '181天以上库存数量', '181天以上'],
  '150天以上': ['>150天', '＞150天', '>150天数量', '＞150天数量', '150天以上数量', '150天以上库存数量', '150天以上']
};

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/[()\[\]（）【】\s_：:，,、-]/g, '')
    .toLowerCase();
}

function normalizeKeyPart(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

function rowEntries(row) {
  return Object.entries(row || {}).filter(([key]) => key !== '__cells');
}

function nthValue(row, oneBasedIndex) {
  const index = oneBasedIndex - 1;
  if (Array.isArray(row?.__cells)) return row.__cells[index] ?? '';
  return rowEntries(row).map(([, value]) => value)[index] ?? '';
}

function firstHeaderValue(row, candidates) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  const entries = rowEntries(row).map(([key, value]) => ({ key: normalizeHeader(key), value }));
  const exact = entries.find((entry) => normalizedCandidates.includes(entry.key));
  if (exact) return exact.value;
  const partial = entries.find((entry) => normalizedCandidates.some((candidate) => candidate.length >= 4 && entry.key.includes(candidate)));
  return partial?.value ?? '';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(normalizeText(value).replace(/[,，\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inventoryMonthTrendIdentity(row) {
  const organization = normalizeText(firstHeaderValue(row, ['库存组织', '组织', '主体名称']));
  const materialCode = normalizeText(firstHeaderValue(row, ['物料编码', '商品编码', '存货编码']) || nthValue(row, organization ? 2 : 1));
  const warehouse = normalizeText(firstHeaderValue(row, ['仓库', '仓库名称']) || nthValue(row, 4));
  return { organization, materialCode, warehouse };
}

export function inventoryMonthAgeQuantities(row, ageBuckets) {
  return Object.fromEntries(ageBuckets.map((ageGroup) => [
    ageGroup,
    Math.max(0, toNumber(firstHeaderValue(row, AGE_HEADER_CANDIDATES[ageGroup] || [ageGroup])))
  ]));
}

function exactKey(organization, warehouse, materialCode) {
  return [organization, warehouse, materialCode].map(normalizeKeyPart).join('\u001f');
}

function materialWarehouseKey(warehouse, materialCode) {
  return [warehouse, materialCode].map(normalizeKeyPart).join('\u001f');
}

function addQuantities(target, key, quantities, ageBuckets) {
  if (!key || key.split('\u001f').some((part) => !part)) return;
  const current = target.get(key) || Object.fromEntries(ageBuckets.map((ageGroup) => [ageGroup, 0]));
  for (const ageGroup of ageBuckets) current[ageGroup] += quantities[ageGroup] || 0;
  target.set(key, current);
}

function toShares(totalsByKey, ageBuckets) {
  return new Map([...totalsByKey.entries()].flatMap(([key, quantities]) => {
    const total = ageBuckets.reduce((sum, ageGroup) => sum + (quantities[ageGroup] || 0), 0);
    if (!(total > 0)) return [];
    return [[key, ageBuckets
      .filter((ageGroup) => quantities[ageGroup] > 0)
      .map((ageGroup) => ({ ageGroup, share: quantities[ageGroup] / total }))]];
  }));
}

export function buildInventoryTrendAgeLookup(record) {
  const ageBuckets = inventoryMonthAgeBuckets(record);
  const exactTotals = new Map();
  const materialWarehouseTotals = new Map();
  for (const row of record?.rows || []) {
    const { organization, materialCode, warehouse } = inventoryMonthTrendIdentity(row);
    if (!materialCode || !warehouse) continue;
    const quantities = inventoryMonthAgeQuantities(row, ageBuckets);
    if (!Object.values(quantities).some((value) => value > 0)) continue;
    if (organization) addQuantities(exactTotals, exactKey(organization, warehouse, materialCode), quantities, ageBuckets);
    addQuantities(materialWarehouseTotals, materialWarehouseKey(warehouse, materialCode), quantities, ageBuckets);
  }
  return {
    ageBuckets,
    exactShares: toShares(exactTotals, ageBuckets),
    materialWarehouseShares: toShares(materialWarehouseTotals, ageBuckets)
  };
}

export function allocateInventoryTrendAge(lookup, { organization, warehouse, materialCode, qty, value }) {
  const shares = lookup?.exactShares?.get(exactKey(organization, warehouse, materialCode))
    || lookup?.materialWarehouseShares?.get(materialWarehouseKey(warehouse, materialCode));
  if (!shares?.length) {
    return [{ ageGroup: UNMATCHED_INVENTORY_AGE_BUCKET, qty, value }];
  }
  let allocatedQty = 0;
  let allocatedValue = 0;
  return shares.map(({ ageGroup, share }, index) => {
    const isLast = index === shares.length - 1;
    const nextQty = isLast ? qty - allocatedQty : qty * share;
    const nextValue = isLast ? value - allocatedValue : value * share;
    allocatedQty += nextQty;
    allocatedValue += nextValue;
    return { ageGroup, qty: nextQty, value: nextValue };
  });
}
