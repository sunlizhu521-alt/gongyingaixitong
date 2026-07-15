import xlsx from 'xlsx';

function hasWorksheetCellValue(cell) {
  if (!cell || typeof cell !== 'object') return false;
  if (typeof cell.f === 'string' && cell.f.trim()) return true;
  return cell.v !== undefined && cell.v !== null && cell.v !== '';
}

export function constrainWorksheetRange(sheet) {
  const originalRef = String(sheet?.['!ref'] || '');
  if (!sheet || typeof sheet !== 'object') {
    return { originalRef, usedRef: '' };
  }

  let startRow = Number.POSITIVE_INFINITY;
  let startColumn = Number.POSITIVE_INFINITY;
  let endRow = -1;
  let endColumn = -1;

  Object.entries(sheet).forEach(([address, cell]) => {
    if (address.startsWith('!') || !hasWorksheetCellValue(cell)) return;
    try {
      const decoded = xlsx.utils.decode_cell(address);
      startRow = Math.min(startRow, decoded.r);
      startColumn = Math.min(startColumn, decoded.c);
      endRow = Math.max(endRow, decoded.r);
      endColumn = Math.max(endColumn, decoded.c);
    } catch {
      // Ignore worksheet metadata or malformed cell addresses.
    }
  });

  if (endRow < 0 || endColumn < 0) {
    return { originalRef, usedRef: '' };
  }

  const usedRef = xlsx.utils.encode_range({
    s: { r: startRow, c: startColumn },
    e: { r: endRow, c: endColumn }
  });
  sheet['!ref'] = usedRef;
  return { originalRef, usedRef };
}
