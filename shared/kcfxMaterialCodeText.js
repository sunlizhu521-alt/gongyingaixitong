export const KCFX_MATERIAL_CODE_TEXT_FORMAT_VERSION = 1;

export function coerceKcfxMaterialCodeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? numberToPlainText(value) : '';
  return String(value).trim();
}

export function normalizeKcfxMaterialCodeRows(recordId, sourceRows = []) {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  const diagnostics = {
    version: KCFX_MATERIAL_CODE_TEXT_FORMAT_VERSION,
    format: 'text',
    recordId: String(recordId || ''),
    columnFound: false,
    rowCount: rows.length,
    textCount: 0,
    convertedCount: 0,
    blankCount: 0
  };

  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const headers = Object.keys(row).filter((key) => key !== '__cells');
    const materialIndex = headers.findIndex((header) => normalizeHeader(header) === '物料编码');
    if (materialIndex < 0) return row;

    diagnostics.columnFound = true;
    const header = headers[materialIndex];
    const current = row[header];
    const converted = coerceKcfxMaterialCodeText(current);
    if (converted) diagnostics.textCount += 1;
    else diagnostics.blankCount += 1;

    const cellValue = Array.isArray(row.__cells) ? row.__cells[materialIndex] : undefined;
    const propertyChanged = !Object.is(converted, current);
    const cellChanged = Array.isArray(row.__cells) && !Object.is(converted, cellValue);
    if (!propertyChanged && !cellChanged) return row;

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

function numberToPlainText(value) {
  const source = String(value);
  if (!/[eE]/.test(source)) return source;

  const [coefficient, exponentText] = source.toLowerCase().split('e');
  const exponent = Number(exponentText);
  const sign = coefficient.startsWith('-') ? '-' : '';
  const unsigned = coefficient.replace(/^[+-]/, '');
  const decimalIndex = unsigned.includes('.') ? unsigned.indexOf('.') : unsigned.length;
  const digits = unsigned.replace('.', '');
  const targetIndex = decimalIndex + exponent;

  if (targetIndex <= 0) return `${sign}0.${'0'.repeat(-targetIndex)}${digits}`;
  if (targetIndex >= digits.length) return `${sign}${digits}${'0'.repeat(targetIndex - digits.length)}`;
  return `${sign}${digits.slice(0, targetIndex)}.${digits.slice(targetIndex)}`;
}
