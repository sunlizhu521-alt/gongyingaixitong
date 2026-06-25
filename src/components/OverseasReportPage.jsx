import React, { useCallback } from 'react';
import InventoryReportBase, { includesAny } from './InventoryReportBase.jsx';

export default function OverseasReportPage(props) {
  const filterRows = useCallback((rows) => rows.filter((row) => includesAny(`${row.department}${row.warehouseLocation}${row.warehouseType}`, ['海外', '美国', '欧洲', '日本', 'FBA', 'FBM'])), []);
  return <InventoryReportBase {...props} title="海外仓报告" filterRows={filterRows} />;
}
