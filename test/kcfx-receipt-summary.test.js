import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseReceiptSummaryRows, expandReceiptSummaryRows, receiptAgeAmountRows } from '../shared/kcfxReceiptSummary.js';

const fields = [
  'materialCode',
  'warehouse',
  'series',
  'ageQuantities',
  'ageSettlementAmounts',
  'inventoryTotal',
  'inventoryAmountTotal'
];

test('receipt summary expands each source row by its non-zero age buckets', () => {
  const rows = expandReceiptSummaryRows({
    rowFields: fields,
    ageBuckets: ['91-120天', '121-150天'],
    rowsCompact: [
      ['M001', '仓库A', '系列A', [12, 25.5], [120, 255], 37.5, 375]
    ]
  });

  assert.deepEqual(rows.map(({ materialCode, warehouse, productSeries, ageGroup, qty, amount }) => ({
    materialCode,
    warehouse,
    productSeries,
    ageGroup,
    qty,
    amount
  })), [
    { materialCode: 'M001', warehouse: '仓库A', productSeries: '系列A', ageGroup: '91-120天', qty: 12, amount: 120 },
    { materialCode: 'M001', warehouse: '仓库A', productSeries: '系列A', ageGroup: '121-150天', qty: 25.5, amount: 255 }
  ]);
  assert.equal(rows.reduce((total, row) => total + row.qty, 0), 37.5);
  assert.equal(rows.reduce((total, row) => total + row.amount, 0), 375);
});

test('receipt summary preserves a row whose age buckets are all zero', () => {
  const rows = expandReceiptSummaryRows({
    rowFields: fields,
    ageBuckets: ['0-30天'],
    rowsCompact: [['M002', '仓库B', '', [0], [0], 7, 70]]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ageGroup, '');
  assert.equal(rows[0].qty, 7);
  assert.equal(rows[0].amount, 70);
});

test('receipt summary collapses filtered age rows back to the source detail row', () => {
  const expanded = expandReceiptSummaryRows({
    rowFields: fields,
    ageBuckets: ['91-120天', '121-150天'],
    rowsCompact: [
      ['M001', '仓库A', '系列A', [12, 25.5], [120, 255], 37.5, 375]
    ]
  });

  const allRows = collapseReceiptSummaryRows(expanded);
  assert.equal(allRows.length, 1);
  assert.equal(allRows[0].qty, 37.5);
  assert.equal(allRows[0].amount, 375);

  const selectedRows = collapseReceiptSummaryRows(expanded.filter((row) => row.ageGroup === '121-150天'));
  assert.equal(selectedRows.length, 1);
  assert.equal(selectedRows[0].qty, 25.5);
  assert.equal(selectedRows[0].amount, 255);
});

test('receipt age amount totals use the actual age values instead of a dominant bucket', () => {
  const order = ['0-30天', '121-150天'];
  const rows = [
    { ageGroup: '0-30天', amount: 100 },
    { ageGroup: '121-150天', amount: 30 },
    { ageGroup: '121-150天', amount: 20 }
  ];

  assert.deepEqual(receiptAgeAmountRows(rows, order), [
    { name: '0-30天', value: 100 },
    { name: '121-150天', value: 50 }
  ]);
});
