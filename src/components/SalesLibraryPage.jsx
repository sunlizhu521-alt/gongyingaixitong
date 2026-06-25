import React from 'react';
import KcfxLibraryPage from './KcfxLibraryPage.jsx';

const SALES_SLOTS = [
  { id: 'sales-data', label: '销售数据文件', description: '月度销售数据源' }
];

export default function SalesLibraryPage(props) {
  return <KcfxLibraryPage {...props} title="销售数据文件" slots={SALES_SLOTS} />;
}
