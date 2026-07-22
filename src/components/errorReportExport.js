import { createStyledWorkbook, downloadStyledWorkbook } from '../../shared/excelExport.js';

function safeSheetName(name, usedNames) {
  const base = String(name || '报错明细').replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || '报错明细';
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const marker = `-${suffix}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export function buildErrorWorkbook(ExcelJS, reports) {
  const usedNames = new Set();
  return createStyledWorkbook(ExcelJS, reports.map((report) => ({
    name: safeSheetName(report.sheetName, usedNames),
    rows: report.rows || [],
    columns: report.columns || []
  })));
}

export async function downloadErrorWorkbook(ExcelJS, reports, fileName, browser = globalThis) {
  const workbook = buildErrorWorkbook(ExcelJS, reports);
  await downloadStyledWorkbook(workbook, fileName, browser);
}
