export const INVENTORY_AGE_YEAR = 2026;
export const INVENTORY_AGE_FALLBACK_MONTH = '2026-06';
export const INVENTORY_AGE_FALLBACK_SLOT_ID = 'inventory-age-2026-06';

export const INVENTORY_AGE_MONTHS = Array.from({ length: 12 }, (_, index) => {
  const monthNumber = index + 1;
  const month = String(monthNumber).padStart(2, '0');
  return {
    id: `inventory-age-${INVENTORY_AGE_YEAR}-${month}`,
    year: INVENTORY_AGE_YEAR,
    monthNumber,
    month: `${INVENTORY_AGE_YEAR}-${month}`,
    label: `${INVENTORY_AGE_YEAR}年${monthNumber}月`
  };
});

export const INVENTORY_AGE_SLOT_IDS = INVENTORY_AGE_MONTHS.map((month) => month.id);

export function inventoryAgeMonthById(id) {
  return INVENTORY_AGE_MONTHS.find((month) => month.id === id) || null;
}

export function isInventoryAgeSlotId(id) {
  return Boolean(inventoryAgeMonthById(id));
}

export function latestInventoryAgeSlotId(records = {}, fallbackId = 'fact-2') {
  const latest = [...INVENTORY_AGE_MONTHS].reverse().find((month) => {
    const record = records?.[month.id];
    if (!record || record.parseStatus === 'failed') return false;
    return Number(record.rowCount || record.rows?.length || 0) > 0;
  });
  const fallback = records?.[fallbackId];
  const fallbackReady = fallback
    && fallback.parseStatus !== 'failed'
    && Number(fallback.rowCount || fallback.rows?.length || 0) > 0;
  if (fallbackReady && (!latest || latest.month < INVENTORY_AGE_FALLBACK_MONTH)) {
    return fallbackId;
  }
  return latest?.id || '';
}

export function latestInventoryAgeRecord(records = {}, fallbackId = 'fact-2') {
  const id = latestInventoryAgeSlotId(records, fallbackId);
  return id ? records[id] || null : null;
}
