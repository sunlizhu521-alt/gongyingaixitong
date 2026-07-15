import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
import { constrainWorksheetRange } from '../server/kcfx-workbook.js';

test('constrainWorksheetRange ignores an inflated Excel used range', () => {
  const sheet = {
    '!ref': 'A1:XFD1048576',
    A1: { t: 's', v: '物料编码' },
    B1: { t: 's', v: '数量' },
    A2: { t: 's', v: '100001' },
    B2: { t: 'n', v: 12 }
  };

  const result = constrainWorksheetRange(sheet);
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  assert.deepEqual(result, {
    originalRef: 'A1:XFD1048576',
    usedRef: 'A1:B2'
  });
  assert.deepEqual(rows, [
    ['物料编码', '数量'],
    ['100001', 12]
  ]);
});
