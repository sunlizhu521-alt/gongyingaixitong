import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  coerceKcfxDimensionMaterialCode,
  normalizeKcfxDimensionMaterialCodeRows
} from '../shared/kcfxDimensionMaterialCode.js';

test('维度表纯数字物料编码强制转换为数字并同步单元格数组', () => {
  const sourceRows = [
    { __cells: ['000123', 'SKU-A'], 物料编码: '000123', SKU: 'SKU-A' },
    { __cells: ['1,234', 'SKU-B'], 物料编码: '1,234', SKU: 'SKU-B' },
    { __cells: ['1001.00', 'SKU-C'], 物料编码: '1001.00', SKU: 'SKU-C' },
    { __cells: [1002, 'SKU-D'], 物料编码: 1002, SKU: 'SKU-D' }
  ];
  const result = normalizeKcfxDimensionMaterialCodeRows('dim-product', sourceRows);

  assert.deepEqual(result.rows.map((row) => row.物料编码), [123, 1234, 1001, 1002]);
  assert.deepEqual(result.rows.map((row) => row.__cells[0]), [123, 1234, 1001, 1002]);
  assert.equal(result.diagnostics.columnFound, true);
  assert.equal(result.diagnostics.numericCount, 4);
  assert.equal(result.diagnostics.convertedCount, 3);
});

test('非纯数字和超出安全整数范围的物料编码保留原值', () => {
  const unsafe = '9007199254740993';
  assert.equal(coerceKcfxDimensionMaterialCode('1015030004-X'), '1015030004-X');
  assert.equal(coerceKcfxDimensionMaterialCode('1935010003批号禁用'), '1935010003批号禁用');
  assert.equal(coerceKcfxDimensionMaterialCode(unsafe), unsafe);

  const result = normalizeKcfxDimensionMaterialCodeRows('dim-store-name', [
    { __cells: ['客户A', '1015030004-X'], 客户名称: '客户A', 物料编码: '1015030004-X' },
    { __cells: ['客户B', unsafe], 客户名称: '客户B', 物料编码: unsafe }
  ]);
  assert.deepEqual(result.rows.map((row) => row.物料编码), ['1015030004-X', unsafe]);
  assert.equal(result.diagnostics.retainedTextCount, 2);
  assert.equal(result.diagnostics.convertedCount, 0);
});

test('事实表的物料编码不在维度强制转换范围内', () => {
  const row = { __cells: ['000123'], 物料编码: '000123' };
  const result = normalizeKcfxDimensionMaterialCodeRows('fact-inventory', [row]);
  assert.equal(result.rows[0].物料编码, '000123');
  assert.equal(result.rows[0], row);
  assert.equal(result.diagnostics.columnFound, false);
});

test('服务器、趋势后台和浏览器缓存都接入维度物料编码标准化', async () => {
  const [appSource, workerSource, loaderSource, workflowSource] = await Promise.all([
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/kcfx-trend-summary-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/kcfxRecordLoader.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  ]);
  assert.match(appSource, /writeKcfxRecordRows[\s\S]*normalizeKcfxDimensionMaterialCodeRows\(id, rows\)/);
  assert.match(appSource, /readKcfxRecordRows[\s\S]*normalizeKcfxDimensionMaterialCodeRows\(record\.id, rows\)\.rows/);
  assert.match(appSource, /parseKcfxWorkbookRows[\s\S]*normalizeKcfxDimensionMaterialCodeRows\(slot\.id, filtered\.rows\)/);
  assert.match(workerSource, /normalizeKcfxDimensionMaterialCodeRows\(id, sourceRows\)\.rows/);
  assert.match(loaderSource, /recordRowsCacheVersion = 'v2'/);
  assert.match(loaderSource, /normalizeDimensionRecord\(cached, id\)/);
  assert.match(loaderSource, /normalizeKcfxDimensionMaterialCodeRows\(id, record\.rows\)/);
  assert.match(workflowSource, /expectedSchemaVersion = 8/);
});
