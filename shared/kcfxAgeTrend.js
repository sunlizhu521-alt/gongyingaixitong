export function buildAgeTrendMatrix(rows = [], mode = 'amount') {
  const ageGroups = [...new Set(rows.map((row) => row.ageGroup).filter(Boolean))];
  const months = [...new Set(rows.map((row) => row.month).filter(Boolean))].sort();
  const matrix = months.map((month) => {
    const valuesByAge = new Map(
      rows
        .filter((row) => row.month === month)
        .map((row) => [row.ageGroup, Number(row[mode]) || 0])
    );
    const values = ageGroups.map((ageGroup) => ({
      ageGroup,
      value: valuesByAge.get(ageGroup) || 0
    }));
    return {
      month,
      values,
      total: values.reduce((sum, item) => sum + item.value, 0)
    };
  });
  return { ageGroups, months, matrix };
}
