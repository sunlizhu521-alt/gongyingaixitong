import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import { FilterToolbar } from './KcfxFilters.jsx';
import { KcfxPageShell, MetricCards, PanelGrid, SimpleTable } from './KcfxCommon.jsx';
import { formatNumber, moneyWan } from './kcfxUtils.js';
import { TablePagination } from './TablePagination.jsx';

const FILTERS = [
  { id: 'inventorySegment', field: 'inventorySegment', allLabel: '全部库存段' },
  { id: 'department', field: 'department', allLabel: '全部事业部' },
  { id: 'productLine', field: 'productLine', allLabel: '全部产品线' },
  { id: 'productSeries', field: 'productSeries', allLabel: '全部销售系列' },
  { id: 'nonInternalTransactionStatus', field: 'nonInternalTransactionStatus', allLabel: '全部内部交易状态' },
  { id: 'finishedGoodsStatus', field: 'finishedGoodsStatus', allLabel: '全部成品状态' },
  { id: 'hasSalesData', field: 'hasSalesData', allLabel: '是否有销售数据' }
];
const DEFAULT_FILTERS = {
  inventorySegment: [],
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
  { key: 'openingOnHandInventoryCost', label: '期初在库库存成本', render: (row) => formatAmount(row.openingOnHandInventoryCost) },
  { key: 'openingInTransitInventoryCost', label: '期初在途库存成本', render: (row) => formatAmount(row.openingInTransitInventoryCost) },
  { key: 'closingOnHandInventoryCost', label: '期末在库库存成本', render: (row) => formatAmount(row.closingOnHandInventoryCost) },
  { key: 'closingInTransitInventoryCost', label: '期末在途库存成本', render: (row) => formatAmount(row.closingInTransitInventoryCost) },
  { key: 'averageOnHandInventoryCost', label: '平均在库库存成本', render: (row) => formatAmount(row.averageOnHandInventoryCost) },
  { key: 'averageInTransitInventoryCost', label: '平均在途库存成本', render: (row) => formatAmount(row.averageInTransitInventoryCost) },
  { key: 'monthlyAverageSalesCost', label: '月均销售产品成本', render: (row) => formatAmount(row.monthlyAverageSalesCost) },
  { key: 'periodOperatingCost', label: '期间营业成本', render: (row) => formatAmount(row.periodOperatingCost) },
  { key: 'onHandInventoryTurnoverDays', label: '在库量存货周转天数', render: (row) => formatDays(row.onHandInventoryTurnoverDays) },
  { key: 'inTransitInventoryTurnoverDays', label: '在途量存货周转天数', render: (row) => formatDays(row.inTransitInventoryTurnoverDays) },
  { key: 'undeliveredQty', label: '未交付总数量', render: (row) => formatNumber(row.undeliveredQty, 2) },
  { key: 'outboundQty', label: '期间销售出库总数量', render: (row) => formatNumber(row.outboundQty, 2) },
  { key: 'undeliveredTurnoverDays', label: '未交付周转天数', render: (row) => formatDays(row.undeliveredTurnoverDays) },
  { key: 'onHandQty', label: '在库量', render: (row) => formatNumber(row.onHandQty, 2) },
  { key: 'inTransitQty', label: '在途量', render: (row) => formatNumber(row.inTransitQty, 2) },
  { key: 'inventoryTotalQty', label: '库存合计', render: (row) => formatNumber(row.inventoryTotalQty, 2) },
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

  useEffect(() => {
    if (!payload?.options) return;
    setFilters((current) => {
      let changed = false;
      const next = { ...current };
      for (const filter of FILTERS) {
        const currentValues = current[filter.id] || [];
        const allowed = new Set(payload.options[filter.id] || []);
        const validValues = currentValues.filter((value) => allowed.has(value));
        if (validValues.length !== currentValues.length) {
          next[filter.id] = validValues;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [payload?.options]);

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
        ? `统计期间：${period.startLabel}至${period.endLabel}，共${period.days}天；事业部＋产品线＋销售系列汇总明细${formatNumber(pagination.totalRows)}行；在库量 = 非海上在途仓库库存；在途量 = 海上在途仓库存；未交付数量 = 采购订单剩余数量`
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

      <div className="turnover-metric-scroll">
        <MetricCards metrics={[
          { label: '期初在库库存成本', value: formatAmount(metrics.openingOnHandInventoryCost) },
          { label: '期初在途库存成本', value: formatAmount(metrics.openingInTransitInventoryCost) },
          { label: '期末在库库存成本', value: formatAmount(metrics.closingOnHandInventoryCost) },
          { label: '期末在途库存成本', value: formatAmount(metrics.closingInTransitInventoryCost) },
          { label: '平均在库库存成本', value: formatAmount(metrics.averageOnHandInventoryCost) },
          { label: '平均在途库存成本', value: formatAmount(metrics.averageInTransitInventoryCost) },
          { label: '月均销售产品成本', value: formatAmount(metrics.monthlyAverageSalesCost) },
          { label: '期间营业成本', value: formatAmount(metrics.periodOperatingCost) },
          { label: '在库量存货周转天数', value: formatDays(metrics.onHandInventoryTurnoverDays) },
          { label: '在途量存货周转天数', value: formatDays(metrics.inTransitInventoryTurnoverDays) },
          { label: '未交付总数量', value: formatNumber(metrics.undeliveredQty, 2) },
          { label: '未交付周转天数', value: formatDays(metrics.undeliveredTurnoverDays) }
        ]} />
      </div>

      <PanelGrid className="turnover-chart-grid">
        <TurnoverComparison title="事业部在库量、在途量存货周转天数与未交付周转天数" rows={payload?.charts?.department || []} />
        <TurnoverComparison title="产品线在库量、在途量存货周转天数与未交付周转天数" rows={payload?.charts?.productLine || []} />
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
        <div className="turnover-calculation-details">
          <h4>详细计算逻辑</h4>
          <div className="turnover-detail-formulas" aria-label="计算公式">
            <p><strong>在库量存货周转天数</strong> = 期间天数 ×（平均在库库存成本 ÷ 期间营业成本）</p>
            <p><strong>在途量存货周转天数</strong> = 期间天数 ×（平均在途库存成本 ÷ 期间营业成本）</p>
            <p><strong>平均库存成本</strong> =（对应期初库存成本 + 对应期末库存成本）÷ 2</p>
            <p><strong>未交付周转天数</strong> = 期间天数 ×（未交付总数量 ÷ 期间销售出库总数量）</p>
            <p><strong>成本计算</strong> = 应收数量 × 2026年结算价；<strong>未交付数量</strong> = 采购订单剩余入库数量</p>
            <p><strong>库存合计</strong> = 在库量 + 在途量 + 未交付总数量</p>
          </div>
          <ol>
            <li>
              <strong>库存成本分类：</strong>
              按仓库维表二级仓库分类拆分库存成本。“海上在途”计入在途库存成本，其他有效库存计入在库库存成本。
            </li>
            <li>
              <strong>期初、期末及平均成本：</strong>
              平均在库库存成本 =（期初在库库存成本 + 期末在库库存成本）÷ 2；
              平均在途库存成本 =（期初在途库存成本 + 期末在途库存成本）÷ 2。
            </li>
            <li>
              <strong>在库与在途存货周转天数：</strong>
              两项共用完整期间营业成本。在库量存货周转天数 = 期间天数 ×（平均在库库存成本 ÷ 期间营业成本）；
              在途量存货周转天数 = 期间天数 ×（平均在途库存成本 ÷ 期间营业成本）。
              两项相加等于原存货周转天数。
            </li>
            <li>
              <strong>未交付周转天数：</strong>
              期间天数 ×（未交付总数量 ÷ 期间销售出库总数量）。
              期间营业成本或期间销售出库总数量小于等于0时，对应周转天数显示“--”。
            </li>
            <li>
              <strong>页面及导出口径：</strong>
              指标卡、库存周转明细和导出分别展示期初、期末、平均在库与在途库存成本，不再保留原总存货周转天数。
              事业部和产品线图表每项显示在库量存货周转天数、在途量存货周转天数、未交付周转天数三条横柱。
            </li>
          </ol>
        </div>
      </section>
    </KcfxPageShell>
  );
}

function TurnoverComparison({ title, rows }) {
  const visibleRows = rows.slice(0, 20);
  const max = Math.max(
    ...visibleRows.flatMap((row) => [
      Number(row.onHandInventoryTurnoverDays) || 0,
      Number(row.inTransitInventoryTurnoverDays) || 0,
      Number(row.undeliveredTurnoverDays) || 0
    ]),
    1
  );
  return (
    <section className="kcfx-panel turnover-comparison-panel">
      <div className="turnover-chart-heading">
        <h3>{title}</h3>
        <span>
          <i className="turnover-legend turnover-legend-on-hand" />在库量存货周转天数
          <i className="turnover-legend turnover-legend-in-transit" />在途量存货周转天数
          <i className="turnover-legend turnover-legend-undelivered" />未交付周转天数
        </span>
      </div>
      <div className="turnover-comparison-rows">
        {visibleRows.length ? visibleRows.map((row) => (
          <div className="turnover-comparison-row" key={row.name}>
            <strong title={row.name}>{row.name}</strong>
            <div className="turnover-comparison-bars">
              <div>
                <span className="turnover-bar on-hand" style={{ width: `${Math.max(2, ((Number(row.onHandInventoryTurnoverDays) || 0) / max) * 100)}%` }} />
                <em>{formatDays(row.onHandInventoryTurnoverDays)}</em>
              </div>
              <div>
                <span className="turnover-bar in-transit" style={{ width: `${Math.max(2, ((Number(row.inTransitInventoryTurnoverDays) || 0) / max) * 100)}%` }} />
                <em>{formatDays(row.inTransitInventoryTurnoverDays)}</em>
              </div>
              <div>
                <span className="turnover-bar undelivered" style={{ width: `${Math.max(2, ((Number(row.undeliveredTurnoverDays) || 0) / max) * 100)}%` }} />
                <em>{formatDays(row.undeliveredTurnoverDays)}</em>
              </div>
            </div>
          </div>
        )) : <div className="empty">暂无数据</div>}
      </div>
    </section>
  );
}
