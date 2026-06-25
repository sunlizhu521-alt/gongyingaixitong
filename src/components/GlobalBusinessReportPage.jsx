import React, { useCallback } from 'react';
import InventoryReportBase, { includesAny } from './InventoryReportBase.jsx';

export default function GlobalBusinessReportPage(props) {
  const filterRows = useCallback((rows) => rows.filter((row) => includesAny(row.department, ['全球招商', '全球业务', '招商'])), []);
  return <InventoryReportBase {...props} title="全球业务报告" filterRows={filterRows} />;
}
