import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  coerceKcfxMaterialCodeText,
  normalizeKcfxMaterialCodeRows
} from '../shared/kcfxMaterialCodeText.js';

test('所有槽位的数字物料编码统一转换为文本并同步单元格数组', () => {
  for (const recordId of ['dim-product', 'fact-inventory', 'sales-data', 'purchase-order-data', 'inventory-age-2026-06']) {
    const sourceRows = [
      { __cells: [1001, '名称A'], 物料编码: 1001, 名称: '名称A' },
      { __cells: [1002.5, '名称B'], 物料编码: 1002.5, 名称: '名称B' }
    ];
    const result = normalizeKcfxMaterialCodeRows(recordId, sourceRows);
    assert.deepEqual(result.rows.map((row) => row.物料编码), ['1001', '1002.5']);
    assert.deepEqual(result.rows.map((row) => row.__cells[0]), ['1001', '1002.5']);
    assert.equal(result.diagnostics.format, 'text');
    assert.equal(result.diagnostics.textCount, 2);
    assert.equal(result.diagnostics.convertedCount, 2);
  }
});

test('原有文本物料编码保留前导零、后缀和中文备注', () => {
  const values = ['000123', '1015030004-X', '1935010003批号禁用', ' 1001 '];
  assert.deepEqual(values.map(coerceKcfxMaterialCodeText), [
    '000123',
    '1015030004-X',
    '1935010003批号禁用',
    '1001'
  ]);

  const result = normalizeKcfxMaterialCodeRows('fact-2', values.map((value) => ({ 物料编码: value })));
  assert.deepEqual(result.rows.map((row) => row.物料编码), ['000123', '1015030004-X', '1935010003批号禁用', '1001']);
});

test('科学计数法数字展开为普通十进制文本', () => {
  assert.equal(coerceKcfxMaterialCodeText(1e21), '1000000000000000000000');
  assert.equal(coerceKcfxMaterialCodeText(1.23e-7), '0.000000123');
  assert.equal(coerceKcfxMaterialCodeText(-4.5e6), '-4500000');
  assert.equal(coerceKcfxMaterialCodeText(Number.NaN), '');
});

test('没有物料编码列的槽位保持原行对象', () => {
  const row = { __cells: ['仓库A'], 仓库名称: '仓库A' };
  const result = normalizeKcfxMaterialCodeRows('dim-warehouse', [row]);
  assert.equal(result.rows[0], row);
  assert.equal(result.diagnostics.columnFound, false);
});

test('服务器、趋势后台和浏览器缓存都接入全槽位文本化规则', async () => {
  const [appSource, workerSource, loaderSource, workflowSource] = await Promise.all([
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/kcfx-trend-summary-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/kcfxRecordLoader.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /writeKcfxRecordRows[\s\S]*normalizeKcfxMaterialCodeRows\(id, rows\)/);
  assert.match(appSource, /readKcfxRecordRows[\s\S]*normalizeKcfxMaterialCodeRows\(record\.id, rows\)\.rows/);
  assert.match(appSource, /parseKcfxWorkbookRows[\s\S]*normalizeKcfxMaterialCodeRows\(slot\.id, filtered\.rows\)/);
  assert.match(workerSource, /normalizeKcfxMaterialCodeRows\(id, sourceRows\)\.rows/);
  assert.match(loaderSource, /recordRowsCacheVersion = 'v3'/);
  assert.match(loaderSource, /normalizeMaterialCodeRecord\(cached, id\)/);
  assert.match(loaderSource, /normalizeKcfxMaterialCodeRows\(id, record\.rows\)/);
  assert.match(workflowSource, /expectedSchemaVersion = 9/);
});
