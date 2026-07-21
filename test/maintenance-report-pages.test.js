import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('feedback summaries and error report are listed under maintenance library only', async () => {
  const source = await readFile(new URL('../src/constants.js', import.meta.url), 'utf8');
  const salesPages = source.match(/const SALES_INVENTORY_PAGES = \[([\s\S]*?)\n\];/)?.[1] || '';
  const maintenancePages = source.match(/const MAINTENANCE_LIBRARY_MENU_PAGES = \[([\s\S]*?)\n\];/)?.[1] || '';

  assert.doesNotMatch(salesPages, /salesInventoryReceiptFeedback|salesInventorySalesFeedback|salesInventoryErrors/);
  assert.match(maintenancePages, /salesInventoryReceiptFeedback'[\s\S]*key: 'receiptFeedback'/);
  assert.match(maintenancePages, /salesInventorySalesFeedback'[\s\S]*key: 'salesFeedback'/);
  assert.match(maintenancePages, /salesInventoryErrors'[\s\S]*key: 'errors'/);
});

test('moved report pages accept their previous permissions on the client', async () => {
  const source = await readFile(new URL('../src/constants.js', import.meta.url), 'utf8');

  assert.match(source, /'maintenanceLibrary\.receiptFeedback': \['maintenanceLibrary', 'salesInventory', 'salesInventory\.receiptFeedback'\]/);
  assert.match(source, /'maintenanceLibrary\.salesFeedback': \['maintenanceLibrary', 'salesInventory', 'salesInventory\.salesFeedback'\]/);
  assert.match(source, /'maintenanceLibrary\.errors': \['maintenanceLibrary', 'salesInventory', 'salesInventory\.errors'\]/);
});

test('server migrates old report permissions and protects routes with maintenance permissions', async () => {
  const [appSource, routeSource] = await Promise.all([
    readFile(new URL('../server/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/kcfx.js', import.meta.url), 'utf8')
  ]);

  assert.match(appSource, /salesInventory\.receiptFeedback'[\s\S]*maintenanceLibrary\.receiptFeedback/);
  assert.match(appSource, /salesInventory\.salesFeedback'[\s\S]*maintenanceLibrary\.salesFeedback/);
  assert.match(appSource, /salesInventory\.errors'[\s\S]*maintenanceLibrary\.errors/);
  assert.match(routeSource, /viewPermission: 'maintenanceLibrary\.receiptFeedback'/);
  assert.match(routeSource, /viewPermission: 'maintenanceLibrary\.salesFeedback'/);
  assert.match(routeSource, /requirePermission\(database, req, res, 'maintenanceLibrary\.errors'\)/);
});
