import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INVENTORY_TREND_MONTHS, KCFX_TREND_SCHEMA_VERSION } from '../shared/kcfxTrendMonths.js';

test('inventory trend month slots cover January through December', () => {
  assert.equal(KCFX_TREND_SCHEMA_VERSION, 3);
  assert.equal(INVENTORY_TREND_MONTHS.length, 12);
  assert.deepEqual(INVENTORY_TREND_MONTHS[5], { id: 'fact-8', label: '6月' });
  assert.deepEqual(INVENTORY_TREND_MONTHS[11], { id: 'fact-14', label: '12月' });
});

test('inventory trend worker uses localized unmatched labels', async () => {
  const source = await readFile(new URL('../server/kcfx-trend-summary-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Unmatched department/);
  assert.match(source, /未匹配事业部/);
  assert.match(source, /departmentMissingRows/);
});
