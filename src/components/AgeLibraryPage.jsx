import React from 'react';
import KcfxLibraryPage from './KcfxLibraryPage.jsx';
import { INVENTORY_AGE_MONTHS } from '../../shared/kcfxAgeMonths.js';

const AGE_SLOTS = INVENTORY_AGE_MONTHS.map((month) => ({
  id: month.id,
  label: `${month.label}库存账龄数据表`,
  description: `${month.label}月末库存数量及库龄明细`
}));

export default function AgeLibraryPage({ kcfxData = null, loading = false, ...props }) {
  return (
    <KcfxLibraryPage
      {...props}
      kcfxData={kcfxData}
      loading={loading}
      title="库龄数据文件"
      slots={AGE_SLOTS}
    />
  );
}
