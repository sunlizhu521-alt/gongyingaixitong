import { createStyledWorkbook, downloadStyledWorkbook } from '../../shared/excelExport.js';

function exportTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function cellValue(row, column) {
  if (typeof column.exportValue === 'function') return column.exportValue(row);
  if (typeof column.render === 'function') return column.render(row);
  return row[column.key] ?? '';
}

export async function downloadKcfxRowsAsXlsx(filePrefix, rows, columns, sheetName = '数据明细') {
  const ExcelJS = await import('exceljs');
  const exportColumns = columns.map((column) => ({
    ...column,
    label: column.exportLabel || column.label || column.key
  }));
  const data = rows.map((row) => {
    const item = {};
    for (const column of exportColumns) {
      item[column.key] = cellValue(row, column);
    }
    return item;
  });
  const workbook = createStyledWorkbook(ExcelJS, [{ name: sheetName, rows: data, columns: exportColumns }]);
  await downloadStyledWorkbook(workbook, `${filePrefix}_${exportTimestamp()}.xlsx`);
}
