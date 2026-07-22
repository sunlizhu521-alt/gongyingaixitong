export const STORE_MAPPING_SHEET_HINT = '店铺名称汇总';
export const STORE_MAPPING_SHEET_HINTS = [STORE_MAPPING_SHEET_HINT, '店铺简称'];

export const STORE_MAPPING_CUSTOMER_HEADERS = [
  '客户名称',
  '金蝶名称',
  '金蝶客户名称',
  '店铺名称'
];

export const STORE_MAPPING_SHORT_NAME_HEADERS = [
  '日常汇报沟通简称',
  '日常沟通简称',
  '汇报简称',
  '店铺简称'
];

export const STORE_MAPPING_COUNTRY_HEADERS = [
  '国家',
  '国家/地区',
  '国家地区',
  '站点国家',
  '销售国家'
];

export const STORE_MAPPING_PLATFORM_HEADERS = [
  '平台',
  '销售平台',
  '电商平台',
  '渠道平台'
];

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFKC')
    .replace(/[()\[\]（）【】\s_：:，,、-]/g, '')
    .toLowerCase();
}

function includesHeader(headers, candidates) {
  const normalizedHeaders = headers.map(normalizeHeader).filter(Boolean);
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeHeader(candidate);
    return normalizedHeaders.some((header) => header === normalizedCandidate || header.includes(normalizedCandidate));
  });
}

export function isStoreMappingHeaderSet(headers) {
  const source = Array.isArray(headers) ? headers : [];
  return includesHeader(source, STORE_MAPPING_CUSTOMER_HEADERS)
    && includesHeader(source, STORE_MAPPING_SHORT_NAME_HEADERS);
}

export function isStoreMappingRecordValid(record) {
  const headers = record?.headers || record?.parseDiagnostics?.headerFirst12 || [];
  return isStoreMappingHeaderSet(headers);
}

export function pickStoreMappingSheetName(sheetNames) {
  const names = Array.isArray(sheetNames) ? sheetNames : [];
  const normalizedHints = STORE_MAPPING_SHEET_HINTS.map(normalizeHeader);
  return names.find((name) => normalizedHints.includes(normalizeHeader(name)))
    || names.find((name) => normalizedHints.some((hint) => normalizeHeader(name).includes(hint)))
    || '';
}
