import xlsx from 'xlsx';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_HEADER = 0x06054b50;
const MAX_XLSX_ENTRY_SIZE = 256 * 1024 * 1024;
const MAX_XLSX_TOTAL_SIZE = 512 * 1024 * 1024;

function findZipEndOffset(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_HEADER) return offset;
  }
  throw new Error('xlsx zip end record not found');
}

function zip64Number(value, fieldName) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`xlsx ${fieldName} exceeds safe integer range`);
  }
  return Number(value);
}

export function resolveZip64Metadata(extra, metadata) {
  const requiresZip64 = metadata.uncompressedSize === 0xffffffff
    || metadata.compressedSize === 0xffffffff
    || metadata.localOffset === 0xffffffff;
  if (!requiresZip64) return metadata;

  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    const valueStart = offset + 4;
    const valueEnd = valueStart + size;
    if (valueEnd > extra.length) break;
    if (id === 0x0001) {
      let cursor = valueStart;
      const resolved = { ...metadata };
      const read64 = (fieldName) => {
        if (cursor + 8 > valueEnd) throw new Error('invalid xlsx zip64 metadata');
        const value = zip64Number(extra.readBigUInt64LE(cursor), fieldName);
        cursor += 8;
        return value;
      };
      if (resolved.uncompressedSize === 0xffffffff) resolved.uncompressedSize = read64('entry size');
      if (resolved.compressedSize === 0xffffffff) resolved.compressedSize = read64('compressed size');
      if (resolved.localOffset === 0xffffffff) resolved.localOffset = read64('local offset');
      return resolved;
    }
    offset = valueEnd;
  }
  throw new Error('missing xlsx zip64 metadata');
}

export function repackXlsxArchive(buffer) {
  const endOffset = findZipEndOffset(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let centralOffset = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  let totalSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== ZIP_CENTRAL_HEADER) {
      throw new Error('invalid xlsx central directory');
    }
    const method = buffer.readUInt16LE(centralOffset + 10);
    const dosTime = buffer.readUInt16LE(centralOffset + 12);
    const dosDate = buffer.readUInt16LE(centralOffset + 14);
    const crc = buffer.readUInt32LE(centralOffset + 16);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const nameBuffer = buffer.subarray(centralOffset + 46, centralOffset + 46 + nameLength);
    const extra = buffer.subarray(
      centralOffset + 46 + nameLength,
      centralOffset + 46 + nameLength + extraLength
    );
    const resolved = resolveZip64Metadata(extra, { compressedSize, uncompressedSize, localOffset });

    if (resolved.uncompressedSize > MAX_XLSX_ENTRY_SIZE || totalSize + resolved.uncompressedSize > MAX_XLSX_TOTAL_SIZE) {
      throw new Error('xlsx entry exceeds safe decompression limit');
    }
    if (buffer.readUInt32LE(resolved.localOffset) !== ZIP_LOCAL_HEADER) {
      throw new Error('invalid xlsx local file header');
    }
    const localNameLength = buffer.readUInt16LE(resolved.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(resolved.localOffset + 28);
    const dataOffset = resolved.localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + resolved.compressedSize);
    const data = method === 0
      ? Buffer.from(compressed)
      : method === 8
        ? inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_ENTRY_SIZE })
        : null;
    if (!data) throw new Error(`unsupported xlsx compression method: ${method}`);
    if (data.length !== resolved.uncompressedSize) throw new Error('xlsx entry size mismatch');

    entries.push({ nameBuffer: Buffer.from(nameBuffer), data, crc, dosTime, dosDate, flags: 0x0800 });
    totalSize += data.length;
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  const localParts = [];
  const centralParts = [];
  let outputOffset = 0;
  entries.forEach((entry) => {
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(ZIP_LOCAL_HEADER, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(entry.flags, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(entry.dosTime, 10);
    localHeader.writeUInt16LE(entry.dosDate, 12);
    localHeader.writeUInt32LE(entry.crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(entry.nameBuffer.length, 26);
    localParts.push(localHeader, entry.nameBuffer, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(ZIP_CENTRAL_HEADER, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(entry.flags, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(entry.dosTime, 12);
    centralHeader.writeUInt16LE(entry.dosDate, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(entry.nameBuffer.length, 28);
    centralHeader.writeUInt32LE(outputOffset, 42);
    centralParts.push(centralHeader, entry.nameBuffer);
    outputOffset += localHeader.length + entry.nameBuffer.length + entry.data.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endHeader = Buffer.alloc(22);
  endHeader.writeUInt32LE(ZIP_END_HEADER, 0);
  endHeader.writeUInt16LE(entries.length, 8);
  endHeader.writeUInt16LE(entries.length, 10);
  endHeader.writeUInt32LE(centralSize, 12);
  endHeader.writeUInt32LE(outputOffset, 16);
  return Buffer.concat([...localParts, ...centralParts, endHeader]);
}

function isSheetJsAllocationError(error) {
  const message = String(error?.message || error || '');
  return /array buffer allocation failed|cannot create a string longer than|invalid string length/i.test(message);
}

export function createCompatibleXlsxReader(filePath) {
  let compatibleBuffer = null;
  return {
    read(options = {}) {
      if (compatibleBuffer) return xlsx.read(compatibleBuffer, { ...options, type: 'buffer' });
      try {
        return xlsx.readFile(filePath, options);
      } catch (error) {
        if (!isSheetJsAllocationError(error)) throw error;
        compatibleBuffer = repackXlsxArchive(readFileSync(filePath));
        return xlsx.read(compatibleBuffer, { ...options, type: 'buffer' });
      }
    },
    get usedFallback() {
      return Boolean(compatibleBuffer);
    }
  };
}

function hasWorksheetCellValue(cell) {
  if (!cell || typeof cell !== 'object') return false;
  if (typeof cell.f === 'string' && cell.f.trim()) return true;
  return cell.v !== undefined && cell.v !== null && cell.v !== '';
}

export function constrainWorksheetRange(sheet) {
  const originalRef = String(sheet?.['!ref'] || '');
  if (!sheet || typeof sheet !== 'object') {
    return { originalRef, usedRef: '' };
  }

  let startRow = Number.POSITIVE_INFINITY;
  let startColumn = Number.POSITIVE_INFINITY;
  let endRow = -1;
  let endColumn = -1;

  Object.entries(sheet).forEach(([address, cell]) => {
    if (address.startsWith('!') || !hasWorksheetCellValue(cell)) return;
    try {
      const decoded = xlsx.utils.decode_cell(address);
      startRow = Math.min(startRow, decoded.r);
      startColumn = Math.min(startColumn, decoded.c);
      endRow = Math.max(endRow, decoded.r);
      endColumn = Math.max(endColumn, decoded.c);
    } catch {
      // Ignore worksheet metadata or malformed cell addresses.
    }
  });

  if (endRow < 0 || endColumn < 0) {
    return { originalRef, usedRef: '' };
  }

  const usedRef = xlsx.utils.encode_range({
    s: { r: startRow, c: startColumn },
    e: { r: endRow, c: endColumn }
  });
  sheet['!ref'] = usedRef;
  return { originalRef, usedRef };
}
