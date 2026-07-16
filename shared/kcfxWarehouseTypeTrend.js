export function buildWarehouseTypeTrendMatrix(rows = [], mode = 'amount', availableMonths = []) {
  const months = [...new Set([
    ...availableMonths,
    ...rows.map((row) => row.month)
  ].filter(Boolean))].sort();
  const warehouseTypes = [...new Set(rows.map((row) => row.warehouseType).filter(Boolean))];
  const valuesByKey = new Map(rows.map((row) => [
    `${row.warehouseType}\u001f${row.month}`,
    Number(row[mode]) || 0
  ]));

  const matrix = warehouseTypes.map((warehouseType) => {
    const values = months.map((month, monthIndex) => {
      const value = valuesByKey.get(`${warehouseType}\u001f${month}`) || 0;
      const previousValue = monthIndex > 0
        ? valuesByKey.get(`${warehouseType}\u001f${months[monthIndex - 1]}`) || 0
        : 0;
      return {
        month,
        value,
        previousValue,
        mom: monthIndex > 0 ? monthOverMonth(value, previousValue) : null
      };
    });
    return {
      warehouseType,
      values,
      trendDirection: compareTrend(values[0]?.value, values.at(-1)?.value),
      latestValue: values.at(-1)?.value || 0,
      maxValue: Math.max(...values.map((item) => item.value), 0)
    };
  }).sort((a, b) => (
    b.latestValue - a.latestValue
    || a.warehouseType.localeCompare(b.warehouseType, 'zh-CN')
  ));

  return { months, warehouseTypes: matrix.map((item) => item.warehouseType), matrix };
}

function monthOverMonth(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function compareTrend(firstValue, latestValue) {
  const first = Number(firstValue) || 0;
  const latest = Number(latestValue) || 0;
  const tolerance = Math.max(Math.abs(first), Math.abs(latest), 1) * 1e-9;
  if (Math.abs(latest - first) <= tolerance) return 'flat';
  return latest > first ? 'up' : 'down';
}
