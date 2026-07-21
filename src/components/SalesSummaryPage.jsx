import React from 'react';
import InventorySummaryPage from './InventorySummaryPage.jsx';

export default function SalesSummaryPage(props) {
  return <InventorySummaryPage {...props} reportType="sales" />;
}
