import React, { useCallback } from 'react';
import InventoryReportBase, { includesAny } from './InventoryReportBase.jsx';

export default function Over120Page(props) {
  const filterRows = useCallback((rows) => rows.filter((row) => includesAny(row.ageGroup, ['120'])), []);
  return <InventoryReportBase {...props} title="超120天库存" filterRows={filterRows} detailLimit={300} />;
}
