import React, { useCallback } from 'react';
import InventoryReportBase, { includesAny } from './InventoryReportBase.jsx';

export default function OverseasSecondReportPage(props) {
  const filterRows = useCallback((rows) => rows.filter((row) => includesAny(row.department, ['海外事业二部', '海外二部', '海外事业部二部'])), []);
  return <InventoryReportBase {...props} title="海外二仓报告" filterRows={filterRows} />;
}
