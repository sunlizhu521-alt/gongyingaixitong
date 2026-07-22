import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createStyledWorkbook } from '../shared/excelExport.js';

test('统一Excel导出写入冻结表头、自适应列宽、居中、不换行和非空单元格边框', async () => {
  const workbook = createStyledWorkbook(ExcelJS, [{
    name: '测试明细',
    columns: [['code', '物料编码'], ['name', '金蝶名称'], ['qty', '数量']],
    rows: [
      { code: '1007010385', name: '中文测试名称', qty: 0 },
      { code: '2', name: '', qty: 12 }
    ]
  }]);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = new ExcelJS.Workbook();
  await parsed.xlsx.load(bytes);
  const worksheet = parsed.getWorksheet('测试明细');

  assert.equal(worksheet.views[0].state, 'frozen');
  assert.equal(worksheet.views[0].ySplit, 1);
  assert.equal(worksheet.getCell('A1').alignment.horizontal, 'center');
  assert.equal(worksheet.getCell('A2').alignment.vertical, 'middle');
  assert.notEqual(worksheet.getCell('A2').alignment.wrapText, true);
  assert.equal(worksheet.getCell('C2').value, 0);
  assert.equal(worksheet.getCell('C2').border.top.style, 'thin');
  assert.equal(worksheet.getCell('B3').border?.top, undefined);
  assert.ok(worksheet.getColumn(1).width >= 12);
  assert.ok(worksheet.getColumn(2).width >= 14);
});
