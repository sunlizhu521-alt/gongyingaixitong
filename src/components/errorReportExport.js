const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function worksheetRows(rows, columns) {
  const data = rows.map((row) => {
    const item = {};
    for (const [key, label] of columns) item[label] = row[key] ?? '';
    return item;
  });
  return data.length ? data : [Object.fromEntries(columns.map(([, label]) => [label, '']))];
}

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

export function buildErrorWorkbook(XLSX, reports) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();
  for (const report of reports) {
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows(report.rows || [], report.columns || []));
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(report.sheetName, usedNames));
  }
  return workbook;
}

export function downloadErrorWorkbook(XLSX, reports, fileName, browser = globalThis) {
  const workbook = buildErrorWorkbook(XLSX, reports);
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
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
