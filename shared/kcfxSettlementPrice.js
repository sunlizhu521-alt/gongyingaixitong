export const NON_TAX_SETTLEMENT_PRICE_HEADERS = [
  '不含税结算价',
  '结算价(不含税)',
  '结算价（不含税）',
  '结算价不含税',
  '不含税内部结算价',
  '内部结算价(不含税)',
  '内部结算价（不含税）',
  '内部结算价不含税',
  '26年不含税结算价',
  '2026年不含税结算价',
  '26年内部结算价(不含税)',
  '26年内部结算价（不含税）',
  '2026年内部结算价(不含税)',
  '2026年内部结算价（不含税）',
  '未税结算价'
];

export function normalizeSettlementPriceHeader(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[()\[\]（）【】\s_：:，,、-]/g, '')
    .toLowerCase();
}

export function isNonTaxSettlementPriceHeader(value) {
  const header = normalizeSettlementPriceHeader(value);
  if (!header.includes('结算价')) return false;
  return header.includes('不含税') || header.includes('未税');
}

export function findNonTaxSettlementPriceHeader(row) {
  return Object.keys(row || {}).find((key) => (
    key !== '__cells' && isNonTaxSettlementPriceHeader(key)
  )) || '';
}
