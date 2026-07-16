export const KCFX_TREND_SCHEMA_VERSION = 5;

export const INVENTORY_TREND_MONTHS = Array.from({ length: 12 }, (_, index) => ({
  id: `fact-${index + 3}`,
  label: `${index + 1}月`
}));
