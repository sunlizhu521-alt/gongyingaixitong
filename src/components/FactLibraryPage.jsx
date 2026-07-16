import React from 'react';
import KcfxLibraryPage from './KcfxLibraryPage.jsx';
import { INVENTORY_TREND_MONTHS } from '../../shared/kcfxTrendMonths.js';

const FACT_SLOTS = [
  { id: 'fact-inventory', label: '最近关账库存', description: '关账库存总表' },
  ...INVENTORY_TREND_MONTHS.map((month, index) => ({
    id: month.id,
    label: `库存事实表 ${index + 3}`,
    description: `${month.label}库存趋势数据`
  }))
];

export default function FactLibraryPage({ kcfxData = null, loading = false, ...props }) {
  return <KcfxLibraryPage {...props} kcfxData={kcfxData} loading={loading} title="库存数据文件" slots={FACT_SLOTS} />;
}
