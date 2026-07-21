import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PURCHASE_ORDER_HEADER_KEYWORDS,
  PURCHASE_ORDER_LIBRARY_SLOT,
  PURCHASE_ORDER_RECORD_ID,
  PURCHASE_ORDER_SHEET_HINT
} from '../shared/kcfxPurchaseOrder.js';

test('purchase-order library uses a stable slot and purchase-order parsing hints', () => {
  assert.equal(PURCHASE_ORDER_RECORD_ID, 'purchase-order-data');
  assert.deepEqual(PURCHASE_ORDER_LIBRARY_SLOT, {
    id: 'purchase-order-data',
    label: '采购订单列表',
    description: '采购订单明细数据源'
  });
  assert.equal(PURCHASE_ORDER_SHEET_HINT, '采购订单列表');
  assert.ok(PURCHASE_ORDER_HEADER_KEYWORDS.includes('采购订单'));
  assert.ok(PURCHASE_ORDER_HEADER_KEYWORDS.includes('供应商'));
  assert.ok(PURCHASE_ORDER_HEADER_KEYWORDS.includes('物料编码'));
});

test('purchase-order library is wired to the menu, permission tree, page and server slot set', async () => {
  const [constantsSource, mainSource, serverSource, pageSource] = await Promise.all([
    readFile(new URL('../src/constants.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PurchaseOrderLibraryPage.jsx', import.meta.url), 'utf8')
  ]);

  assert.match(constantsSource, /maintenancePurchaseOrderLibrary/);
  assert.match(constantsSource, /maintenanceLibrary\.purchaseOrderLibrary/);
  assert.match(mainSource, /<PurchaseOrderLibraryPage/);
  assert.match(serverSource, /'maintenanceLibrary\.purchaseOrderLibrary'/);
  assert.match(serverSource, /PURCHASE_ORDER_RECORD_ID/);
  assert.match(pageSource, /title="采购订单文件"/);
});
