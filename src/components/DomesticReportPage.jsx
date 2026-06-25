import React, { useCallback } from 'react';
import InventoryReportBase, { includesAny } from './InventoryReportBase.jsx';

export default function DomesticReportPage(props) {
  const filterRows = useCallback((rows) => rows.filter((row) => includesAny(`${row.department}${row.warehouseLocation}${row.warehouseType}`, ['国内', 'CN', '中国'])), []);
  return <InventoryReportBase {...props} title="国内仓报告" filterRows={filterRows} />;
}
