export const KCFX_DIMENSION_MATERIAL_CODE_FORMAT_VERSION = 1;

export function isKcfxDimensionRecordId(recordId) {
  return /^dim-/i.test(String(recordId || '').trim());
}

export function coerceKcfxDimensionMaterialCode(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (value === null || value === undefined) return '';

  const text = String(value).trim();
  if (!text) return '';
  const candidate = text.replace(/[,，\s]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(candidate)) return value;

  const number = Number(candidate);
  if (!Number.isFinite(number)) return value;
  if (Number.isInteger(number) && !Number.isSafeInteger(number)) return value;
  return number;
}

export function normalizeKcfxDimensionMaterialCodeRows(recordId, sourceRows = []) {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const diagnostics = {
    version: KCFX_DIMENSION_MATERIAL_CODE_FORMAT_VERSION,
    columnFound: false,
    rowCount: rows.length,
    numericCount: 0,
    convertedCount: 0,
    blankCount: 0,
    retainedTextCount: 0
  };
  if (!isKcfxDimensionRecordId(recordId)) return { rows, diagnostics };

  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const headers = Object.keys(row).filter((key) => key !== '__cells');
    const materialIndex = headers.findIndex((header) => normalizeHeader(header) === '物料编码');
    if (materialIndex < 0) return row;

    diagnostics.columnFound = true;
    const header = headers[materialIndex];
    const current = row[header];
    const converted = coerceKcfxDimensionMaterialCode(current);
    if (converted === '') diagnostics.blankCount += 1;
    else if (typeof converted === 'number') diagnostics.numericCount += 1;
    else diagnostics.retainedTextCount += 1;

    if (Object.is(converted, current)) return row;
    diagnostics.convertedCount += 1;
    const nextRow = { ...row, [header]: converted };
    if (Array.isArray(row.__cells)) {
      nextRow.__cells = [...row.__cells];
      nextRow.__cells[materialIndex] = converted;
    }
    return nextRow;
  });

  return { rows: normalizedRows, diagnostics };
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}
