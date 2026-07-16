export function buildAgeTrendMatrix(rows = [], mode = 'amount') {
  const ageGroups = [...new Set(rows.map((row) => row.ageGroup).filter(Boolean))];
  const months = [...new Set(rows.map((row) => row.month).filter(Boolean))].sort();
  const matrix = months.map((month, monthIndex) => {
    const valuesByAge = new Map(
      rows
        .filter((row) => row.month === month)
        .map((row) => [row.ageGroup, Number(row[mode]) || 0])
    );
    const previousMonth = months[monthIndex - 1];
    const previousValuesByAge = new Map(
      previousMonth
        ? rows
          .filter((row) => row.month === previousMonth)
          .map((row) => [row.ageGroup, Number(row[mode]) || 0])
        : []
    );
    const values = ageGroups.map((ageGroup) => ({
      ageGroup,
      value: valuesByAge.get(ageGroup) || 0,
      previousValue: previousValuesByAge.get(ageGroup) || 0,
      mom: monthIndex > 0
        ? monthOverMonth(valuesByAge.get(ageGroup) || 0, previousValuesByAge.get(ageGroup) || 0)
        : null
    }));
    const total = values.reduce((sum, item) => sum + item.value, 0);
    const previousTotal = values.reduce((sum, item) => sum + item.previousValue, 0);
    return {
      month,
      values,
      total,
      previousTotal,
      totalMom: monthIndex > 0 ? monthOverMonth(total, previousTotal) : null
    };
  });
  return { ageGroups, months, matrix };
}

function monthOverMonth(currentValue, previousValue) {
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
