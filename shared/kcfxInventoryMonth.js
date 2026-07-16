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

const INVENTORY_AGE_HEADER_RULES = [
  { label: '0-30天', patterns: [/^0天到30天数量库存$/, /^0-30天(?:库存)?数量$/, /^0-30天$/] },
  { label: '31-60天', patterns: [/^31天到60天数量库存$/, /^31-60天(?:库存)?数量$/, /^31-60天$/] },
  { label: '31天以上', patterns: [/^31天以上数量库存$/, /^31天以上(?:库存)?数量$/, /^31天以上$/] },
  { label: '61-90天', patterns: [/^61天到90天数量库存$/, /^61-90天(?:库存)?数量$/, /^61-90天$/] },
  { label: '61天以上', patterns: [/^61天以上数量库存$/, /^61天以上(?:库存)?数量$/, /^61天以上$/] },
  { label: '91-120天', patterns: [/^91天到120天数量库存$/, /^91-120天(?:库存)?数量$/, /^91-120天$/] },
  { label: '91天以上', patterns: [/^91天以上数量库存$/, /^91天以上(?:库存)?数量$/, /^91天以上$/] },
  { label: '121-150天', patterns: [/^121天到150天数量库存$/, /^121-150天(?:库存)?数量$/, /^121-150天$/] },
  { label: '121天以上', patterns: [/^121天以上数量库存$/, /^121天以上(?:库存)?数量$/, /^121天以上$/] },
  { label: '151-180天', patterns: [/^151天到180天数量库存$/, /^151-180天(?:库存)?数量$/, /^151-180天$/] },
  { label: '151天以上', patterns: [/^151天以上数量库存$/, /^151天以上(?:库存)?数量$/, /^151天以上$/] },
  { label: '181天以上', patterns: [/^181天以上数量库存$/, /^181天以上(?:库存)?数量$/, /^181天以上$/] },
  {
    label: '150天以上',
    patterns: [
      /^(?:>|大于)150天(?:库存)?数量$/,
      /^(?:>|大于)150天$/,
      /^150天(?:及)?以上(?:库存)?数量$/,
      /^150天(?:及)?以上$/
    ]
  }
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
  const headers = inventoryMonthHeaders(record);
  const detected = inventoryMonthAgeColumns(headers).map((column) => column.label);
  if (detected.length === 1 && detected[0] === '150天以上') return LEGACY_INVENTORY_AGE_BUCKETS;
  if (detected.length) return detected;
  return LEGACY_INVENTORY_AGE_BUCKETS;
}

export function inventoryMonthAgeColumns(headersOrRecord) {
  const headers = Array.isArray(headersOrRecord)
    ? headersOrRecord
    : inventoryMonthHeaders(headersOrRecord);
  return headers.flatMap((header) => {
    const normalized = normalizeHeader(header);
    const rule = INVENTORY_AGE_HEADER_RULES.find((candidate) => (
      candidate.patterns.some((pattern) => pattern.test(normalized))
    ));
    return rule ? [{ label: rule.label, header }] : [];
  });
}

export function inventoryMonthAgeQuantity(row, label) {
  const column = inventoryMonthAgeColumns(rowEntries(row).map(([key]) => key))
    .find((item) => item.label === label);
  if (!column) return 0;
  const value = row?.[column.header];
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(normalizeText(value).replace(/[,，\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
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
