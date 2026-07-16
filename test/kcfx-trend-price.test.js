import test from 'node:test';
import assert from 'node:assert/strict';
import { selectInventoryTrendPrice } from '../shared/kcfxTrendPrice.js';

test('inventory trend uses the product dimension settlement price first', () => {
  assert.equal(selectInventoryTrendPrice(12.5, 9.8), 12.5);
  assert.equal(selectInventoryTrendPrice(0, 9.8), 9.8);
  assert.equal(selectInventoryTrendPrice('', ''), 0);
});

test('trend implementations preserve dimension price precedence', async () => {
  const worker = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../server/kcfx-trend-summary-worker.js', import.meta.url), 'utf8')
  ));
  const server = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('../server/app.js', import.meta.url), 'utf8')
  ));
  assert.match(worker, /selectInventoryTrendPrice\(dimensionSettlementPrice, directSettlementPrice\)/);
  assert.match(server, /selectInventoryTrendPrice\(dimensionSettlementPrice, directSettlementPrice\)/);
  assert.match(worker, /makePriceAccessor\(productRows\[0\], 10\)/);
  assert.match(worker, /toNumber\(productPriceAccessor\(row\)\)/);
  assert.match(server, /makeKcfxTrendPriceAccessor\(productRows\[0\], 10\)/);
  assert.match(server, /kcfxTrendToNumber\(productPriceAccessor\(row\)\)/);
});
