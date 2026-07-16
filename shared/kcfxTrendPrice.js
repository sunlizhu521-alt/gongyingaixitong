export function selectInventoryTrendPrice(dimensionPrice, monthFilePrice) {
  const dimension = Number(dimensionPrice) || 0;
  if (dimension > 0) return dimension;
  const direct = Number(monthFilePrice) || 0;
  return direct > 0 ? direct : 0;
}
