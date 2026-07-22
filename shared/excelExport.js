const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const THIN_BORDER = Object.freeze({ style: 'thin', color: { argb: 'FF000000' } });

function workbookConstructor(ExcelJSImport) {
  const ExcelJS = ExcelJSImport?.default || ExcelJSImport;
  if (typeof ExcelJS?.Workbook !== 'function') {
    throw new TypeError('ExcelJS Workbook constructor is unavailable');
  }
  return ExcelJS.Workbook;
}

function isPresent(value) {
  return value !== null && value !== undefined && value !== '';
}

function displayText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
    if (value.text !== undefined) return String(value.text);
    return JSON.stringify(value);
  }
  return String(value);
}

function visualLength(value) {
  return Array.from(displayText(value)).reduce((length, character) => (
    length + (/[^\x00-\xff]/.test(character) ? 2 : 1)
  ), 0);
}

function normalizedColumns(rows, columns) {
  if (Array.isArray(columns) && columns.length) {
    return columns.map((column, index) => {
      if (Array.isArray(column)) return { key: column[0], label: column[1] || column[0] };
      if (typeof column === 'string') return { key: column, label: column };
      return {
        key: column.key ?? `column${index + 1}`,
        label: column.exportLabel || column.label || column.header || column.key || `列${index + 1}`
      };
    });
  }

  const keys = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys.map((key) => ({ key, label: key }));
}

function styleWorksheet(worksheet) {
  worksheet.views = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!isPresent(cell.value)) return;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      cell.border = {
        top: THIN_BORDER,
        left: THIN_BORDER,
        bottom: THIN_BORDER,
        right: THIN_BORDER
      };
      if (rowNumber === 1) cell.font = { ...cell.font, bold: true };
    });
  });

  worksheet.columns.forEach((column) => {
    let width = 0;
    column.eachCell({ includeEmpty: false }, (cell) => {
      if (isPresent(cell.value)) width = Math.max(width, visualLength(cell.value));
    });
    column.width = Math.min(255, Math.max(8, width + 2));
  });
}

export function createStyledWorkbook(ExcelJSImport, sheets) {
  const Workbook = workbookConstructor(ExcelJSImport);
  const workbook = new Workbook();

  for (const sheet of sheets) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const columns = normalizedColumns(rows, sheet.columns);
    const worksheet = workbook.addWorksheet(sheet.name || '数据明细');
    worksheet.columns = columns.map((column, index) => ({
      header: column.label,
      key: `column${index + 1}`
    }));
    for (const row of rows) {
      worksheet.addRow(columns.map((column) => row?.[column.key] ?? ''));
    }
    styleWorksheet(worksheet);
  }

  return workbook;
}

export async function downloadStyledWorkbook(workbook, fileName, browser = globalThis) {
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new browser.Blob([bytes], { type: XLSX_MIME_TYPE });
  const url = browser.URL.createObjectURL(blob);
  const anchor = browser.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  browser.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  browser.setTimeout(() => browser.URL.revokeObjectURL(url), 0);
}
