import {
  AUTH_DEVICE_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  INSPECTION_NOTICE_FIELDS,
  KCFX_INDEXED_DB_NAME,
  KCFX_INDEXED_DB_STORE
} from './constants.js';

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_STORAGE_KEY) || 'null');
  } catch {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
}

function getClientDeviceId() {
  let deviceId = localStorage.getItem(AUTH_DEVICE_STORAGE_KEY);
  if (!deviceId) {
    deviceId = createClientId();
    localStorage.setItem(AUTH_DEVICE_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

function storeAuthenticatedUser(user) {
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

function clearAuthenticatedUser() {
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

function securityWatermarkText(user) {
  const name = user?.name || '未登录用户';
  const date = new Date().toLocaleDateString('zh-CN');
  return `内部资料 ${name} ${date}`;
}

function createInspectionNoticeRow(values = {}) {
  return INSPECTION_NOTICE_FIELDS.reduce((row, field) => ({
    ...row,
    [field.key]: field.multiSelect
      ? (Array.isArray(values[field.key])
          ? values[field.key]
          : String(values[field.key] || '').split(/[、,，]/).map((item) => item.trim()).filter(Boolean))
      : values[field.key] || ''
  }), {
    id: values.id || createClientId()
  });
}

function normalizeOptionText(value) {
  return String(value ?? '').trim();
}

function readPhysicalColumn(row, oneBasedIndex) {
  const index = oneBasedIndex - 1;
  if (Array.isArray(row?.__cells)) return normalizeOptionText(row.__cells[index]);
  const values = Object.entries(row || {})
    .filter(([key]) => key !== '__cells' && !key.startsWith('__'))
    .map(([, value]) => value);
  return normalizeOptionText(values[index]);
}

function uniqueOptionValues(values) {
  const seen = new Set();
  return values
    .map(normalizeOptionText)
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function fuzzyMatchOption(value, query) {
  const normalizedValue = normalizeOptionText(value).toLowerCase();
  const normalizedQuery = normalizeOptionText(query).toLowerCase();
  if (!normalizedQuery) return true;
  return normalizedValue.includes(normalizedQuery);
}

function recordTime(record) {
  return Math.max(
    Date.parse(record?.savedAt || 0) || 0,
    Number(record?.lastModified || 0) || 0,
    Date.parse(record?.appliedAt || 0) || 0,
    Date.parse(record?.sharedSavedAt || 0) || 0
  );
}

function latestInspectionLibraryRecord(record) {
  if (!record || record.deletedAt) return null;
  const current = { ...record };
  delete current.pending;
  const pending = record.pending && !record.pending.deletedAt ? record.pending : null;
  const latest = pending && recordTime(pending) >= recordTime(current) ? pending : current;
  return Array.isArray(latest?.rows) && latest.rows.length ? latest : null;
}

function readInspectionIndexedDbRecord(id) {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(KCFX_INDEXED_DB_NAME, 1);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      resolve(null);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KCFX_INDEXED_DB_STORE)) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction(KCFX_INDEXED_DB_STORE, 'readonly');
      const storeRequest = tx.objectStore(KCFX_INDEXED_DB_STORE).get(id);
      storeRequest.onsuccess = () => resolve(latestInspectionLibraryRecord(storeRequest.result));
      storeRequest.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
    };
  });
}

function assertApiResponse(label, response) {
  if (!response) return;
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}`);
  }
}

export {
  assertApiResponse,
  clearAuthenticatedUser,
  createClientId,
  createInspectionNoticeRow,
  fuzzyMatchOption,
  getClientDeviceId,
  latestInspectionLibraryRecord,
  normalizeOptionText,
  readInspectionIndexedDbRecord,
  readPhysicalColumn,
  readStoredUser,
  recordTime,
  securityWatermarkText,
  storeAuthenticatedUser,
  uniqueOptionValues
};
