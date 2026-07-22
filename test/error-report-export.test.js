import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
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
  const workbook = buildErrorWorkbook(xlsx, reports);
  assert.equal(workbook.SheetNames.length, 2);
  assert.equal(workbook.SheetNames[0].length <= 31, true);
  assert.notEqual(workbook.SheetNames[0], workbook.SheetNames[1]);
  assert.deepEqual(xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]), [
    { 物料编码: '1001', 数量: 12 }
  ]);
});

test('报错信息下载通过Blob链接触发一次浏览器下载', () => {
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

  downloadErrorWorkbook(xlsx, reports.slice(0, 1), '报错信息汇总.xlsx', browser);

  assert.equal(anchor.href, 'blob:error-report');
  assert.equal(anchor.download, '报错信息汇总.xlsx');
  assert.deepEqual(events, ['append', 'click', 'remove', 'revoke:blob:error-report']);
});
