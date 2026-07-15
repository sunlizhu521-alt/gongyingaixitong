import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
import { constrainWorksheetRange, repackXlsxArchive, resolveZip64Metadata } from '../server/kcfx-workbook.js';

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

test('repackXlsxArchive produces a SheetJS-readable stored archive', () => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    ['物料编码', '数量'],
    ['100001', 12]
  ]);
  xlsx.utils.book_append_sheet(workbook, sheet, '库存');
  const compressed = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });

  const repacked = repackXlsxArchive(compressed);
  const parsed = xlsx.read(repacked, { type: 'buffer' });
  const rows = xlsx.utils.sheet_to_json(parsed.Sheets['库存'], { header: 1 });

  assert.deepEqual(rows, [
    ['物料编码', '数量'],
    ['100001', 12]
  ]);
});

test('resolveZip64Metadata reads 64-bit entry sizes and offsets', () => {
  const extra = Buffer.alloc(28);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(24, 2);
  extra.writeBigUInt64LE(16747497n, 4);
  extra.writeBigUInt64LE(1061178n, 12);
  extra.writeBigUInt64LE(4096n, 20);

  assert.deepEqual(resolveZip64Metadata(extra, {
    uncompressedSize: 0xffffffff,
    compressedSize: 0xffffffff,
    localOffset: 0xffffffff
  }), {
    uncompressedSize: 16747497,
    compressedSize: 1061178,
    localOffset: 4096
  });
});
