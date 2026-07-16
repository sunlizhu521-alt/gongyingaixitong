import React, { useMemo } from 'react';
import KcfxLibraryPage from './KcfxLibraryPage.jsx';
import {
  INVENTORY_AGE_FALLBACK_SLOT_ID,
  INVENTORY_AGE_MONTHS
} from '../../shared/kcfxAgeMonths.js';

const AGE_SLOTS = INVENTORY_AGE_MONTHS.map((month) => ({
  id: month.id,
  label: `${month.label}库存账龄数据表`,
  description: `${month.label}月末库存数量及库龄明细`
}));

export default function AgeLibraryPage({ kcfxData = null, loading = false, ...props }) {
  const libraryWithJuneFallback = useMemo(() => {
    if (!kcfxData?.records) return kcfxData;
    const records = Array.isArray(kcfxData.records)
      ? Object.fromEntries(kcfxData.records.map((record) => [record.id, record]))
      : kcfxData.records;
    if (records[INVENTORY_AGE_FALLBACK_SLOT_ID] || !records['fact-2']) return kcfxData;
    return {
      ...kcfxData,
      records: {
        ...records,
        [INVENTORY_AGE_FALLBACK_SLOT_ID]: {
          ...records['fact-2'],
          id: INVENTORY_AGE_FALLBACK_SLOT_ID,
          sourceRecordId: 'fact-2'
        }
      }
    };
  }, [kcfxData]);

  return (
    <KcfxLibraryPage
      {...props}
      kcfxData={libraryWithJuneFallback}
      loading={loading}
      title="库龄数据文件"
      slots={AGE_SLOTS}
    />
  );
}
