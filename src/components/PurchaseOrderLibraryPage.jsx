import React from 'react';
import { PURCHASE_ORDER_LIBRARY_SLOT } from '../../shared/kcfxPurchaseOrder.js';
import KcfxLibraryPage from './KcfxLibraryPage.jsx';

const PURCHASE_ORDER_SLOTS = [PURCHASE_ORDER_LIBRARY_SLOT];

export default function PurchaseOrderLibraryPage({ kcfxData = null, loading = false, ...props }) {
  return (
    <KcfxLibraryPage
      {...props}
      kcfxData={kcfxData}
      loading={loading}
      title="采购订单文件"
      slots={PURCHASE_ORDER_SLOTS}
    />
  );
}
