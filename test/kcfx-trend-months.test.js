import test from 'node:test';
import assert from 'node:assert/strict';
import { INVENTORY_TREND_MONTHS, KCFX_TREND_SCHEMA_VERSION } from '../shared/kcfxTrendMonths.js';

test('inventory trend month slots cover January through December', () => {
  assert.equal(KCFX_TREND_SCHEMA_VERSION, 2);
  assert.equal(INVENTORY_TREND_MONTHS.length, 12);
  assert.deepEqual(INVENTORY_TREND_MONTHS[5], { id: 'fact-8', label: '6月' });
  assert.deepEqual(INVENTORY_TREND_MONTHS[11], { id: 'fact-14', label: '12月' });
});
