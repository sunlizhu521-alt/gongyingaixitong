import React from 'react';
import KcfxLibraryPage from './KcfxLibraryPage.jsx';

const SALES_SLOTS = [
  { id: 'sales-data', label: '销售数据文件', description: '月度销售数据源' },
  { id: 'sales-forecast', label: '销售预测文件', description: '单工作表宽表：事业部、物料编码及未来月份预测数量' }
];

export default function SalesLibraryPage({ kcfxData = null, loading = false, ...props }) {
  return <KcfxLibraryPage {...props} kcfxData={kcfxData} loading={loading} title="销售数据文件" slots={SALES_SLOTS} />;
}
