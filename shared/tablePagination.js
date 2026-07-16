export const DEFAULT_TABLE_PAGE_SIZE = 20;

export function visiblePageNumbers(page, totalPages, limit = 5) {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, safeTotal));
  let start = Math.max(1, (Number(page) || 1) - Math.floor(safeLimit / 2));
  start = Math.min(start, safeTotal - safeLimit + 1);
  return Array.from({ length: safeLimit }, (_, index) => start + index);
}
