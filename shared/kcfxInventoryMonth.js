export const CURRENT_INVENTORY_AGE_BUCKETS = [
  '0-30天',
  '31-60天',
  '61-90天',
  '91-120天',
  '121-150天',
  '151-180天',
  '181天以上'
];

export const LEGACY_INVENTORY_AGE_BUCKETS = [
  '0-30天',
  '31-60天',
  '61-90天',
  '91-120天',
  '121-150天',
  '150天以上'
];

function normalizeText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(/[()\[\]（）【】\s_：:，,、-]/g, '')
    .toLowerCase();
}

function rowEntries(row) {
  return Object.entries(row || {}).filter(([key]) => key !== '__cells');
}

export function inventoryMonthHeaders(record) {
  const firstRow = record?.rows?.[0];
  if (firstRow && typeof firstRow === 'object') return rowEntries(firstRow).map(([key]) => key);
  return Array.isArray(record?.headers) ? record.headers : [];
}

export function inventoryMonthAgeBuckets(record) {
  const normalized = inventoryMonthHeaders(record).map(normalizeHeader);
  const hasCurrentLongAgeColumns = normalized.some((header) => header.includes('151天到180天') && header.includes('数量'))
    && normalized.some((header) => header.includes('181天以上') && header.includes('数量'));
  return hasCurrentLongAgeColumns ? CURRENT_INVENTORY_AGE_BUCKETS : LEGACY_INVENTORY_AGE_BUCKETS;
}

export function findInventoryMonthHeaderRowIndex(matrix, maxRows = 10) {
  const rows = Array.isArray(matrix) ? matrix.slice(0, maxRows) : [];
  return rows.findIndex((row) => {
    const headers = (Array.isArray(row) ? row : []).map(normalizeHeader);
    const hasMaterialCode = headers.includes(normalizeHeader('物料编码'));
    const hasMaterialName = headers.includes(normalizeHeader('物料名称'));
    const hasWarehouse = headers.some((header) => header === normalizeHeader('仓库') || header === normalizeHeader('仓库名称'));
    const hasQuantity = headers.some((header) => header === normalizeHeader('数量(库存)')
      || header === normalizeHeader('合计')
      || header.includes(normalizeHeader('结余库存数量')));
    return hasMaterialCode && hasMaterialName && hasWarehouse && hasQuantity;
  });
}

export function isInventoryMonthSummaryRow(row) {
  const cells = Array.isArray(row?.__cells) ? row.__cells : rowEntries(row).map(([, value]) => value);
  const materialEntry = rowEntries(row).find(([key]) => normalizeHeader(key) === normalizeHeader('物料编码'));
  if (normalizeText(materialEntry?.[1])) return false;
  if (cells.slice(0, 9).some((value) => normalizeText(value) !== '')) return false;
  return cells.slice(9).some((value) => {
    const text = normalizeText(value);
    return text !== '' && Number.isFinite(Number(text.replace(/[,，\s]/g, '')));
  });
}

export function filterInventoryMonthSummaryRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return { rows: rows || [], removed: 0 };
  if (!isInventoryMonthSummaryRow(rows[rows.length - 1])) return { rows, removed: 0 };
  return { rows: rows.slice(0, -1), removed: 1 };
}
