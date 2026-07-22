import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildErrorWorkbook, downloadErrorWorkbook } from '../src/components/errorReportExport.js';

const reports = [
  {
    sheetName: '关账库存事实表-商品维度缺失表',
    rows: [{ materialCode: '1001', qty: 12 }],
    columns: [['materialCode', '物料编码'], ['qty', '数量']]
  },
  {
    sheetName: '关账库存事实表-商品维度缺失表',
    rows: [],
    columns: [['materialCode', '物料编码'], ['qty', '数量']]
  }
];

test('报错信息导出生成单个多工作表文件并处理重复表名', () => {
  const workbook = buildErrorWorkbook(ExcelJS, reports);
  assert.equal(workbook.worksheets.length, 2);
  assert.equal(workbook.worksheets[0].name.length <= 31, true);
  assert.notEqual(workbook.worksheets[0].name, workbook.worksheets[1].name);
  assert.deepEqual(workbook.worksheets[0].getRow(1).values.slice(1), ['物料编码', '数量']);
  assert.deepEqual(workbook.worksheets[0].getRow(2).values.slice(1), ['1001', 12]);
});

test('报错信息下载通过Blob链接触发一次浏览器下载', async () => {
  const events = [];
  const anchor = {
    style: {},
    click: () => events.push('click'),
    remove: () => events.push('remove')
  };
  const browser = {
    Blob,
    URL: {
      createObjectURL: () => 'blob:error-report',
      revokeObjectURL: (url) => events.push(`revoke:${url}`)
    },
    document: {
      createElement: () => anchor,
      body: { appendChild: () => events.push('append') }
    },
    setTimeout: (callback) => callback()
  };

  await downloadErrorWorkbook(ExcelJS, reports.slice(0, 1), '报错信息汇总.xlsx', browser);

  assert.equal(anchor.href, 'blob:error-report');
  assert.equal(anchor.download, '报错信息汇总.xlsx');
  assert.deepEqual(events, ['append', 'click', 'remove', 'revoke:blob:error-report']);
});
