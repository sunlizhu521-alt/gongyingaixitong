import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import { KcfxPageShell, MetricCards, SimpleTable } from './KcfxCommon.jsx';
import { FilterToolbar } from './KcfxFilters.jsx';
import { formatNumber, SALES_CLASSIFICATION_NOTE } from './kcfxUtils.js';
import { TablePagination } from './TablePagination.jsx';

const VIEW_CONFIG = {
  summary: {
    label: '库存汇总',
    filters: [
      { id: 'department', field: 'department', allLabel: '全部事业部' },
      { id: 'productLine', field: 'productLine', allLabel: '全部产品线' }
    ],
    columns: [
      { key: 'department', label: '事业部' },
      { key: 'productLine', label: '产品线' },
      { key: 'materialCode', label: '物料编码' },
      { key: 'sku', label: 'SKU' },
      { key: 'kingdeeName', label: '金蝶名称' },
      { key: 'settlementPrice', label: '内部结算价', render: (row) => `¥${formatNumber(row.settlementPrice, 2)}` },
      { key: 'onHandQty', label: '在库数量', render: (row) => formatNumber(row.onHandQty, 2) },
      { key: 'inTransitQty', label: '在途数量', render: (row) => formatNumber(row.inTransitQty, 2) },
      { key: 'undeliveredQty', label: '未交付总数量', render: (row) => formatNumber(row.undeliveredQty, 2) },
      { key: 'totalQty', label: '合计', render: (row) => formatNumber(row.totalQty, 2) },
      { key: 'inventoryValue', label: '货值', render: (row) => `¥${formatNumber(row.inventoryValue, 2)}` }
    ]
  },
  onHand: {
    label: '在库数量',
    filters: [
      { id: 'department', field: 'department', allLabel: '全部事业部' },
      { id: 'productLine', field: 'productLine', allLabel: '全部产品线' },
      { id: 'inventoryLocation', field: 'inventoryLocation', allLabel: '全部库存所在地' }
    ],
    columns: [
      { key: 'department', label: '事业部' },
      { key: 'productLine', label: '产品线' },
      { key: 'materialCode', label: '物料编码' },
      { key: 'sku', label: 'SKU' },
      { key: 'kingdeeName', label: '金蝶名称' },
      { key: 'qty', label: '数量', render: (row) => formatNumber(row.qty, 2) },
      { key: 'inventoryLocation', label: '库存所在地' }
    ]
  },
  inTransit: {
    label: '在途数量',
    filters: [
      { id: 'department', field: 'department', allLabel: '全部事业部' },
      { id: 'productLine', field: 'productLine', allLabel: '全部产品线' }
    ],
    columns: [
      { key: 'department', label: '事业部' },
      { key: 'productLine', label: '产品线' },
      { key: 'materialCode', label: '物料编码' },
      { key: 'sku', label: 'SKU' },
      { key: 'kingdeeName', label: '金蝶名称' },
      { key: 'qty', label: '数量', render: (row) => formatNumber(row.qty, 2) }
    ]
  },
  undelivered: {
    label: '未交付总数量',
    filters: [
      { id: 'supplier', field: 'supplier', allLabel: '全部供应商' },
      { id: 'department', field: 'department', allLabel: '全部事业部' },
      { id: 'productLine', field: 'productLine', allLabel: '全部产品线' }
    ],
    columns: [
      { key: 'supplier', label: '供应商' },
      { key: 'department', label: '事业部' },
      { key: 'productLine', label: '产品线' },
      { key: 'materialCode', label: '物料编码' },
      { key: 'sku', label: 'SKU' },
      { key: 'kingdeeName', label: '金蝶名称' },
      { key: 'qty', label: '数量', render: (row) => formatNumber(row.qty, 2) }
    ]
  },
  sales: {
    label: '销售数据',
    filters: [
      { id: 'salesMonth', field: 'salesMonth', type: 'month', multiple: true, allLabel: '全部销售月份', monthAllLabel: '全部数据月份' },
      { id: 'department', field: 'department', allLabel: '全部事业部' },
      { id: 'productLine', field: 'productLine', allLabel: '全部产品线' },
      { id: 'nonInternalTransactionStatus', field: 'nonInternalTransactionStatus', allLabel: '是否内部交易' },
      { id: 'finishedGoodsStatus', field: 'finishedGoodsStatus', allLabel: '是否成品' }
    ],
    columns: [
      { key: 'dateLabel', label: '日期' },
      { key: 'department', label: '事业部' },
      { key: 'country', label: '国家' },
      { key: 'platform', label: '平台' },
      { key: 'productLine', label: '产品线' },
      { key: 'materialCode', label: '物料编码' },
      { key: 'sku', label: 'SKU' },
      { key: 'kingdeeName', label: '金蝶名称' },
      { key: 'salesQty', label: '销售数量', render: (row) => formatNumber(row.salesQty, 2) },
      { key: 'salesAmount', label: '销售金额（元）', render: (row) => `${formatNumber(row.salesAmount, 2)}元` }
    ]
  }
};

function defaultFilters(view) {
  const filters = Object.fromEntries(VIEW_CONFIG[view].filters.map((filter) => [filter.id, []]));
  if (view === 'sales') {
    filters.nonInternalTransactionStatus = ['非内部交易'];
    filters.finishedGoodsStatus = ['成品'];
  }
  return filters;
}

function initialTableStates() {
  return Object.fromEntries(Object.keys(VIEW_CONFIG).map((view) => [view, {
    filters: defaultFilters(view),
    search: '',
    page: 1
  }]));
}

function userHeaders(user, extra = {}) {
  return {
    ...extra,
    ...(user?.id ? { 'x-user-id': user.id } : {}),
    ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
    ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
  };
}

function modeButton(active, label, onClick) {
  return <button type="button" className={active ? 'active' : ''} onClick={onClick}>{label}</button>;
}

export default function InventorySummaryPage({ user = null, kcfxData = null, onRefresh, reportType = 'inventory' }) {
  const [inventoryMode, setInventoryMode] = useState('summary');
  const [segmentView, setSegmentView] = useState('onHand');
  const [tableStates, setTableStates] = useState(initialTableStates);
  const [payloads, setPayloads] = useState({});
  const [openFilter, setOpenFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const isSalesReport = reportType === 'sales';
  const pageTitle = isSalesReport ? '销售汇总报表' : '库存汇总报表';
  const activeView = isSalesReport ? 'sales' : inventoryMode === 'summary' ? 'summary' : segmentView;
  const config = VIEW_CONFIG[activeView];
  const tableState = tableStates[activeView];
  const stateKey = useMemo(() => JSON.stringify(tableState), [tableState]);
  const payload = payloads[activeView] || null;

  const updateTableState = useCallback((view, updater) => {
    setTableStates((current) => ({
      ...current,
      [view]: typeof updater === 'function' ? updater(current[view]) : updater
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API}/api/kcfx-library/inventory-summary/query`, {
          method: 'POST',
          cache: 'no-store',
          headers: userHeaders(user, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            report: activeView === 'sales' ? 'sales' : 'inventory',
            view: activeView,
            filters: tableState.filters,
            search: tableState.search,
            page: tableState.page,
            pageSize: 20
          })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result?.ok) throw new Error(result?.message || result?.error || `${pageTitle}读取失败`);
        if (cancelled) return;
        setPayloads((current) => ({ ...current, [activeView]: result }));
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeView, kcfxData?.savedAt, pageTitle, refreshVersion, stateKey, tableState.filters, tableState.page, tableState.search, updateTableState, user]);

  const optionsById = useMemo(() => Object.fromEntries(config.filters.map((filter) => [
    filter.id,
    (payload?.options?.[filter.id] || []).map((value) => ({
      value,
      label: filter.id === 'salesMonth'
        ? `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月`
        : value
    }))
  ])), [config.filters, payload?.options]);

  const setFilterValue = useCallback((id, values) => {
    updateTableState(activeView, (current) => ({
      ...current,
      filters: { ...current.filters, [id]: values },
      page: 1
    }));
  }, [activeView, updateTableState]);

  const resetFilters = useCallback(() => {
    updateTableState(activeView, (current) => ({ ...current, filters: defaultFilters(activeView), page: 1 }));
    setOpenFilter('');
  }, [activeView, updateTableState]);

  const refresh = useCallback(async () => {
    await onRefresh?.();
    setRefreshVersion((value) => value + 1);
  }, [onRefresh]);

  const exportRows = useCallback(async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API}/api/kcfx-library/inventory-summary/export`, {
        method: 'POST',
        headers: userHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          report: activeView === 'sales' ? 'sales' : 'inventory',
          view: activeView,
          filters: tableState.filters,
          search: tableState.search
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${config.label}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      window.alert(`导出失败：${exportError?.message || exportError}`);
    } finally {
      setExporting(false);
    }
  }, [activeView, config.label, tableState.filters, tableState.search, user]);

  const metrics = payload?.metrics || {};
  const pagination = payload?.pagination || { page: tableState.page, pageSize: 20, totalPages: 1, totalRows: 0 };
  const metricCards = activeView === 'sales'
    ? [
        { label: '汇总行数', value: formatNumber(metrics.rowCount) },
        { label: '销售数量', value: formatNumber(metrics.salesQty, 2) },
        { label: '销售金额', value: `${formatNumber((Number(metrics.salesAmount) || 0) / 100000000, 4)}亿元` }
      ]
    : activeView === 'summary'
      ? [
          { label: '在库数量', value: formatNumber(metrics.onHandQty, 2) },
          { label: '在途数量', value: formatNumber(metrics.inTransitQty, 2) },
          { label: '未交付总数量', value: formatNumber(metrics.undeliveredQty, 2) },
          { label: '合计', value: formatNumber(metrics.totalQty, 2) },
          { label: '货值', value: `¥${formatNumber(metrics.inventoryValue, 2)}` }
        ]
      : [
          { label: config.label, value: formatNumber(metrics.qty, 2) },
          { label: '货值', value: `¥${formatNumber(metrics.inventoryValue, 2)}` },
          { label: '汇总行数', value: formatNumber(metrics.rowCount) }
        ];
  const status = loading
    ? '数据加载中...'
    : error || `${config.label}共 ${formatNumber(pagination.totalRows)} 行，每页20行`;

  return (
    <KcfxPageShell
      className="inventory-summary-page"
      title={pageTitle}
      status={status}
      note={isSalesReport ? SALES_CLASSIFICATION_NOTE : ''}
      loading={loading}
      onRefresh={refresh}
    >
      {!isSalesReport && (
        <section className="inventory-summary-controls" aria-label="库存报表类型">
          <div className="age-mode-switch">
            {modeButton(inventoryMode === 'summary', '库存汇总', () => { setInventoryMode('summary'); setOpenFilter(''); })}
            {modeButton(inventoryMode === 'segment', '分段库存', () => { setInventoryMode('segment'); setOpenFilter(''); })}
          </div>
          {inventoryMode === 'segment' && (
            <div className="age-mode-switch">
              {modeButton(segmentView === 'onHand', '在库数量', () => { setSegmentView('onHand'); setOpenFilter(''); })}
              {modeButton(segmentView === 'inTransit', '在途数量', () => { setSegmentView('inTransit'); setOpenFilter(''); })}
              {modeButton(segmentView === 'undelivered', '未交付总数量', () => { setSegmentView('undelivered'); setOpenFilter(''); })}
            </div>
          )}
        </section>
      )}

      <FilterToolbar
        filters={config.filters}
        optionsById={optionsById}
        selections={tableState.filters}
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        setFilterValue={setFilterValue}
        resetFilters={resetFilters}
        searchValue={tableState.search}
        setSearchValue={(value) => updateTableState(activeView, (current) => ({ ...current, search: value, page: 1 }))}
        searchPlaceholder={activeView === 'sales' ? '搜索事业部、国家、平台、产品线、物料编码、SKU、金蝶名称' : '搜索物料编码、SKU、金蝶名称、事业部、产品线'}
      />

      <MetricCards metrics={metricCards} />

      <section className="kcfx-panel inventory-summary-table-panel">
        <div className="table-title-row">
          <div>
            <h3>{config.label}</h3>
            <p className="kcfx-table-note">共 {formatNumber(pagination.totalRows)} 行，每页20行</p>
          </div>
          <button type="button" className="ghost compact-button" onClick={exportRows} disabled={exporting || loading}>
            {exporting ? '导出中...' : '导出'}
          </button>
        </div>
        <SimpleTable rows={payload?.rows || []} paginated={false} columns={config.columns} />
        <TablePagination
          page={pagination.page}
          pageSize={20}
          totalPages={pagination.totalPages}
          totalRows={pagination.totalRows}
          onPageChange={(page) => updateTableState(activeView, (current) => ({ ...current, page }))}
          disabled={loading}
        />
      </section>
    </KcfxPageShell>
  );
}
