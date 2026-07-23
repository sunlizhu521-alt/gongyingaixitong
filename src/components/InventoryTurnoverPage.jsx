import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import { FilterToolbar } from './KcfxFilters.jsx';
import { KcfxPageShell, MetricCards, PanelGrid, SimpleTable } from './KcfxCommon.jsx';
import { formatNumber, moneyWan } from './kcfxUtils.js';
import { TablePagination } from './TablePagination.jsx';

const FILTERS = [
  { id: 'department', field: 'department', allLabel: '全部事业部' },
  { id: 'productLine', field: 'productLine', allLabel: '全部产品线' },
  { id: 'productSeries', field: 'productSeries', allLabel: '全部销售系列' },
  { id: 'nonInternalTransactionStatus', field: 'nonInternalTransactionStatus', allLabel: '全部内部交易状态' },
  { id: 'finishedGoodsStatus', field: 'finishedGoodsStatus', allLabel: '全部成品状态' },
  { id: 'hasSalesData', field: 'hasSalesData', allLabel: '是否有销售数据' }
];
const DEFAULT_FILTERS = {
  department: [],
  productLine: [],
  productSeries: [],
  nonInternalTransactionStatus: ['非内部交易'],
  finishedGoodsStatus: ['成品'],
  hasSalesData: ['有销售数据']
};
const PAGE_SIZE = 20;

function userHeaders(user, extra = {}) {
  return {
    ...extra,
    ...(user?.id ? { 'x-user-id': user.id } : {}),
    ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
    ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
  };
}

function formatDays(value) {
  return Number.isFinite(Number(value)) ? `${formatNumber(value, 2)}天` : '--';
}

function formatAmount(value) {
  return moneyWan(Number(value) || 0);
}

const COLUMNS = [
  { key: 'department', label: '事业部' },
  { key: 'productLine', label: '产品线' },
  { key: 'productSeries', label: '销售系列' },
  { key: 'periodDays', label: '期间天数', render: (row) => formatNumber(row.periodDays) },
  { key: 'openingInventoryCost', label: '期初存货成本', render: (row) => formatAmount(row.openingInventoryCost) },
  { key: 'closingInventoryCost', label: '期末存货成本', render: (row) => formatAmount(row.closingInventoryCost) },
  { key: 'averageInventoryCost', label: '平均存货成本', render: (row) => formatAmount(row.averageInventoryCost) },
  { key: 'monthlyAverageSalesCost', label: '月均销售产品成本', render: (row) => formatAmount(row.monthlyAverageSalesCost) },
  { key: 'periodOperatingCost', label: '期间营业成本', render: (row) => formatAmount(row.periodOperatingCost) },
  { key: 'inventoryTurnoverDays', label: '库存周转天数', render: (row) => formatDays(row.inventoryTurnoverDays) },
  { key: 'undeliveredQty', label: '未交付总数量', render: (row) => formatNumber(row.undeliveredQty, 2) },
  { key: 'outboundQty', label: '期间销售出库总数量', render: (row) => formatNumber(row.outboundQty, 2) },
  { key: 'undeliveredCoverageDays', label: '未交付覆盖天数', render: (row) => formatDays(row.undeliveredCoverageDays) },
  { key: 'dataStatus', label: '数据状态' }
];

export default function InventoryTurnoverPage({ user = null, kcfxData = null, onRefresh }) {
  const [periodMonths, setPeriodMonths] = useState(3);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [openFilter, setOpenFilter] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingMissingPrice, setExportingMissingPrice] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API}/api/kcfx-library/inventory-turnover/query`, {
          method: 'POST',
          cache: 'no-store',
          headers: userHeaders(user, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ periodMonths, filters, page, pageSize: PAGE_SIZE })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result?.ok) throw new Error(result?.message || result?.error || '库存周转数据读取失败');
        if (cancelled) return;
        setPayload(result);
        if (result.period?.months && result.period.months !== periodMonths) {
          setPeriodMonths(result.period.months);
        }
        if (result.pagination?.page && result.pagination.page !== page) {
          setPage(result.pagination.page);
        }
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
  }, [filterKey, filters, kcfxData?.savedAt, page, periodMonths, refreshVersion, user]);

  const optionsById = useMemo(() => Object.fromEntries(FILTERS.map((filter) => [
    filter.id,
    (payload?.options?.[filter.id] || []).map((value) => ({ value, label: value }))
  ])), [payload?.options]);

  const setFilterValue = useCallback((id, value) => {
    setFilters((current) => ({ ...current, [id]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setOpenFilter('');
  }, []);

  const refresh = useCallback(async () => {
    await onRefresh?.();
    setRefreshVersion((value) => value + 1);
  }, [onRefresh]);

  const exportRows = useCallback(async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API}/api/kcfx-library/inventory-turnover/export`, {
        method: 'POST',
        headers: userHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ periodMonths, filters })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `库存周转天数_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      window.alert(`导出失败：${exportError?.message || exportError}`);
    } finally {
      setExporting(false);
    }
  }, [filters, periodMonths, user]);

  const exportMissingPriceRows = useCallback(async () => {
    setExportingMissingPrice(true);
    try {
      const response = await fetch(`${API}/api/kcfx-library/inventory-turnover/missing-price/export`, {
        method: 'POST',
        headers: userHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ periodMonths, filters })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `缺少内部结算价明细_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      window.alert(`导出失败：${exportError?.message || exportError}`);
    } finally {
      setExportingMissingPrice(false);
    }
  }, [filters, periodMonths, user]);

  const period = payload?.period;
  const metrics = payload?.metrics || {};
  const pagination = payload?.pagination || { page, pageSize: PAGE_SIZE, totalPages: 1, totalRows: 0 };
  const maxMonths = Math.max(1, Number(period?.maxMonths) || 1);
  const status = loading
    ? '数据加载中...'
    : error
      || payload?.message
      || (period
        ? `统计期间：${period.startLabel}至${period.endLabel}，共${period.days}天；事业部＋产品线＋销售系列汇总明细${formatNumber(pagination.totalRows)}行`
        : '等待数据');
  const warning = [
    period?.openingApproximate
      ? `期初目标为${period.openingTargetMonth}，当前使用${period.openingSnapshotLabel}快照，期初数据不完整。`
      : '',
    Number(payload?.diagnostics?.missingPriceRows) > 0
      ? `有${formatNumber(payload.diagnostics.missingPriceRows)}条记录缺少内部结算价，相关成本按0计算。`
      : ''
  ].filter(Boolean).join(' ');

  return (
    <KcfxPageShell title="库存周转天数" status={status} loading={loading} onRefresh={refresh}>
      <FilterToolbar
        filters={FILTERS}
        optionsById={optionsById}
        selections={filters}
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        setFilterValue={setFilterValue}
        resetFilters={resetFilters}
        className="turnover-filter-toolbar"
        leadingContent={(
          <label className="turnover-period-input">
            <span>期间（月）</span>
            <input
              type="number"
              min="1"
              max={maxMonths}
              step="1"
              value={periodMonths}
              onChange={(event) => {
                const next = Math.min(maxMonths, Math.max(1, Math.trunc(Number(event.target.value) || 1)));
                setPeriodMonths(next);
                setPage(1);
              }}
            />
          </label>
        )}
      />

      <section className="turnover-formulas" aria-label="计算公式">
        <p><strong>存货周转天数</strong> = 期间天数 ×（平均存货成本 ÷ 期间营业成本）</p>
        <p><strong>平均存货成本</strong> =（期初存货成本 + 期末存货成本）÷ 2</p>
        <p><strong>未交付覆盖天数</strong> = 期间天数 ×（未交付总数量 ÷ 期间销售出库总数量）</p>
        <p><strong>成本计算</strong> = 应收数量 × 2026年结算价；<strong>未交付数量</strong> = 采购订单剩余入库数量</p>
      </section>

      {warning && (
        <div className="turnover-warning" role="status">
          <span>{warning}</span>
          {Number(payload?.diagnostics?.missingPriceRows) > 0 && (
            <button type="button" onClick={exportMissingPriceRows} disabled={exportingMissingPrice}>
              {exportingMissingPrice ? '导出中...' : '导出缺少内部结算价明细'}
            </button>
          )}
        </div>
      )}

      <MetricCards metrics={[
        { label: '期初存货成本', value: formatAmount(metrics.openingInventoryCost) },
        { label: '期末存货成本', value: formatAmount(metrics.closingInventoryCost) },
        { label: '平均存货成本', value: formatAmount(metrics.averageInventoryCost) },
        { label: '月均销售产品成本', value: formatAmount(metrics.monthlyAverageSalesCost) },
        { label: '期间营业成本', value: formatAmount(metrics.periodOperatingCost) },
        { label: '库存周转天数', value: formatDays(metrics.inventoryTurnoverDays) },
        { label: '未交付总数量', value: formatNumber(metrics.undeliveredQty, 2) },
        { label: '未交付覆盖天数', value: formatDays(metrics.undeliveredCoverageDays) }
      ]} />

      <PanelGrid className="turnover-chart-grid">
        <TurnoverComparison title="事业部存货周转天数与未交付周转天数" rows={payload?.charts?.department || []} />
        <TurnoverComparison title="产品线存货周转天数与未交付周转天数" rows={payload?.charts?.productLine || []} />
      </PanelGrid>

      <section className="kcfx-panel turnover-detail-panel">
        <div className="panel-title-row">
          <h3>库存周转明细</h3>
          <button type="button" onClick={exportRows} disabled={exporting}>
            {exporting ? '导出中...' : '导出全部'}
          </button>
        </div>
        <SimpleTable rows={payload?.rows || []} columns={COLUMNS} paginated={false} />
        <TablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalPages={pagination.totalPages}
          totalRows={pagination.totalRows}
          onPageChange={setPage}
        />
      </section>
    </KcfxPageShell>
  );
}

function TurnoverComparison({ title, rows }) {
  const visibleRows = rows.slice(0, 20);
  const max = Math.max(
    ...visibleRows.flatMap((row) => [
      Number(row.inventoryTurnoverDays) || 0,
      Number(row.undeliveredCoverageDays) || 0
    ]),
    1
  );
  return (
    <section className="kcfx-panel turnover-comparison-panel">
      <div className="turnover-chart-heading">
        <h3>{title}</h3>
        <span><i className="turnover-legend turnover-legend-inventory" />存货周转天数 <i className="turnover-legend turnover-legend-undelivered" />未交付周转天数</span>
      </div>
      <div className="turnover-comparison-rows">
        {visibleRows.length ? visibleRows.map((row) => (
          <div className="turnover-comparison-row" key={row.name}>
            <strong title={row.name}>{row.name}</strong>
            <div className="turnover-comparison-bars">
              <div>
                <span className="turnover-bar inventory" style={{ width: `${Math.max(2, ((Number(row.inventoryTurnoverDays) || 0) / max) * 100)}%` }} />
                <em>{formatDays(row.inventoryTurnoverDays)}</em>
              </div>
              <div>
                <span className="turnover-bar undelivered" style={{ width: `${Math.max(2, ((Number(row.undeliveredCoverageDays) || 0) / max) * 100)}%` }} />
                <em>{formatDays(row.undeliveredCoverageDays)}</em>
              </div>
            </div>
          </div>
        )) : <div className="empty">暂无数据</div>}
      </div>
    </section>
  );
}
