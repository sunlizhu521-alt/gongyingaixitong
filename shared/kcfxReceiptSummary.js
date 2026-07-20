export function expandReceiptSummaryRows(summary) {
  const fields = Array.isArray(summary?.rowFields) ? summary.rowFields : [];
  const compactRows = Array.isArray(summary?.rowsCompact) ? summary.rowsCompact : [];
  const ageBuckets = Array.isArray(summary?.ageBuckets) ? summary.ageBuckets : [];

  return compactRows.flatMap((values, sourceIndex) => {
    const row = inflateReceiptSummaryRow(fields, ageBuckets, values);
    const ageRows = ageBuckets
      .map((ageGroup, ageIndex) => ({
        ...row,
        id: `receipt-${sourceIndex}-${ageIndex}`,
        receiptSourceIndex: sourceIndex,
        ageGroup,
        qty: Number(row.ageQuantities?.[ageGroup]) || 0,
        amount: Number(row.ageSettlementAmounts?.[ageGroup]) || 0
      }))
      .filter((ageRow) => ageRow.qty !== 0 || ageRow.amount !== 0);

    if (ageRows.length) return ageRows;

    return [{
      ...row,
      id: `receipt-${sourceIndex}`,
      receiptSourceIndex: sourceIndex,
      ageGroup: '',
      qty: Number(row.inventoryTotal || row.endingQty || row.ageQuantityTotal) || 0,
      amount: Number(row.inventoryAmountTotal || row.settlementAmount || row.ageSettlementAmount) || 0
    }];
  });
}

export function collapseReceiptSummaryRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const sourceIndex = row.receiptSourceIndex;
    const key = Number.isInteger(sourceIndex) ? sourceIndex : row.id;
    const current = grouped.get(key);
    if (current) {
      current.qty += Number(row.qty) || 0;
      current.amount += Number(row.amount) || 0;
      if (row.ageGroup && !current.ageGroups.includes(row.ageGroup)) current.ageGroups.push(row.ageGroup);
      continue;
    }
    grouped.set(key, {
      ...row,
      id: `receipt-${key}`,
      qty: Number(row.qty) || 0,
      amount: Number(row.amount) || 0,
      ageGroups: row.ageGroup ? [row.ageGroup] : []
    });
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    ageGroup: row.ageGroups.join('、')
  }));
}

function inflateReceiptSummaryRow(fields, ageBuckets, values) {
  const row = {};
  fields.forEach((field, index) => {
    const value = values[index];
    if (field === 'ageQuantities' || field === 'ageSettlementAmounts') {
      row[field] = Object.fromEntries(
        ageBuckets.map((bucket, bucketIndex) => [bucket, Number(value?.[bucketIndex]) || 0])
      );
    } else {
      row[field] = value;
    }
  });
  return {
    ...row,
    productSeries: row.productSeries || row.series || ''
  };
}

export function receiptAgeAmountRows(rows, ageBucketOrder) {
  const totals = new Map(ageBucketOrder.map((bucket) => [bucket, 0]));
  for (const row of rows) {
    const name = String(row.ageGroup || '').trim();
    if (!name) continue;
    totals.set(name, (totals.get(name) || 0) + (Number(row.amount) || 0));
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value !== 0)
    .sort((a, b) => {
      const ai = ageBucketOrder.indexOf(a.name);
      const bi = ageBucketOrder.indexOf(b.name);
      const aIndex = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
      const bIndex = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex || a.name.localeCompare(b.name, 'zh-CN');
    });
}
