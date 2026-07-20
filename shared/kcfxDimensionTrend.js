export function buildDimensionTrendMatrix(
  rows = [],
  mode = 'amount',
  availableMonths = [],
  options = {}
) {
  const pageSize = Math.max(1, Number(options.pageSize) || 20);
  const months = [...new Set([
    ...availableMonths,
    ...rows.map((row) => row.month)
  ].filter(Boolean))].sort();
  const valuesByName = new Map();

  for (const row of rows) {
    const name = String(row.name || '').trim();
    if (!name || !row.month) continue;
    const valuesByMonth = valuesByName.get(name) || new Map();
    valuesByMonth.set(
      row.month,
      (valuesByMonth.get(row.month) || 0) + (Number(row[mode]) || 0)
    );
    valuesByName.set(name, valuesByMonth);
  }

  const allRows = [...valuesByName.entries()].map(([name, valuesByMonth]) => {
    const values = months.map((month, monthIndex) => {
      const value = valuesByMonth.get(month) || 0;
      const previousValue = monthIndex > 0
        ? valuesByMonth.get(months[monthIndex - 1]) || 0
        : 0;
      return {
        month,
        value,
        previousValue,
        mom: monthIndex > 0 ? monthOverMonth(value, previousValue) : null
      };
    });
    return {
      name,
      values,
      latestValue: values.at(-1)?.value || 0,
      totalValue: values.reduce((total, item) => total + item.value, 0),
      maxValue: Math.max(...values.map((item) => item.value), 0)
    };
  }).sort((a, b) => (
    b.latestValue - a.latestValue
    || b.totalValue - a.totalValue
    || a.name.localeCompare(b.name, 'zh-CN')
  ));

  const totalRows = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(1, Number(options.page) || 1), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    months,
    rows: allRows.slice(offset, offset + pageSize),
    page,
    pageSize,
    totalRows,
    totalPages
  };
}

function monthOverMonth(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
