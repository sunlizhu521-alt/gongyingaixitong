import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import { BarPanel, KcfxPageShell, MetricCards, PanelGrid, SimpleTable } from './KcfxCommon.jsx';
import { FilterToolbar } from './KcfxFilters.jsx';
import {
  KCFX_COLORS,
  formatMonthOverMonth,
  formatNumber,
  moneyWan
} from './kcfxUtils.js';
import { buildAgeTrendMatrix } from '../../shared/kcfxAgeTrend.js';
import { buildDimensionTrendMatrix } from '../../shared/kcfxDimensionTrend.js';
import { buildSalesOutboundWarehouseLocationTrend, buildWarehouseFlowTrend } from '../../shared/kcfxWarehouseTypeTrend.js';
import { TablePagination } from './TablePagination.jsx';

const FILTERS = [
  { id: 'month', field: 'month', type: 'month', allLabel: '全部月份', monthAllLabel: '全部月份' },
  { id: 'warehouseType', field: 'warehouseType', allLabel: '全部仓库类型' },
  { id: 'department', field: 'department', allLabel: '全部事业部' },
  { id: 'ageGroup', field: 'ageGroup', allLabel: '全部库龄' },
  { id: 'saleStatus', field: 'saleStatus', allLabel: '全部可售状态' },
  { id: 'productCategory', field: 'productCategory', allLabel: '全部商品分类' },
  { id: 'productLine', field: 'productLine', allLabel: '全部销售产品线' },
  { id: 'productSeries', field: 'productSeries', allLabel: '全部销售系列' },
  { id: 'warehouseLocation', field: 'warehouseLocation', allLabel: '全部仓库位置' }
];

const EMPTY_SELECTIONS = Object.fromEntries(FILTERS.map((filter) => [filter.id, []]));
const DIMENSION_TREND_VIEWS = [
  { id: 'department', label: '事业部变化趋势' },
  { id: 'productLine', label: '销售产品线变化趋势' },
  { id: 'productSeries', label: '销售系列变化趋势' }
];
const AGE_TREND_COLORS = [
  '#007aff',
  '#30b85a',
  '#ff9f0a',
  '#9b51e0',
  '#ff375f',
  '#2aa7d6',
  '#5856d6',
  '#0f9d76',
  '#d94fd5',
  '#ff6b35',
  '#b38b00',
  '#0f766e'
];

const TABLE_COLUMNS = [
  { key: 'monthLabel', label: '月份' },
  { key: 'department', label: '事业部' },
  { key: 'productLine', label: '销售产品线' },
  { key: 'productSeries', label: '销售系列' },
  { key: 'materialCode', label: '物料编码' },
  { key: 'sku', label: 'SKU' },
  { key: 'materialName', label: '物料名称' },
  { key: 'warehouse', label: '仓库' },
  { key: 'ageGroup', label: '库龄' },
  { key: 'qty', label: '库存数量', render: (row) => formatNumber(row.qty, 2) },
  { key: 'settlementPrice', label: '结算价', render: (row) => formatNumber(row.settlementPrice, 4) },
  { key: 'amount', label: '库存金额', render: (row) => moneyWan(row.amount) }
];

function userHeaders(user, extra = {}) {
  return {
    ...extra,
    ...(user?.id ? { 'x-user-id': user.id } : {}),
    ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
    ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
  };
}

function monthFromRecordId(id) {
  const match = String(id || '').match(/^inventory-age-(\d{4})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

export default function AgeAnalysisPage({ user = null, kcfxData = null, onRefresh }) {
  const [selections, setSelections] = useState(EMPTY_SELECTIONS);
  const [search, setSearch] = useState('');
  const [openFilter, setOpenFilter] = useState('');
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [ageMode, setAgeMode] = useState('amount');
  const [warehouseTypeMode, setWarehouseTypeMode] = useState('amount');
  const [dimensionTrendView, setDimensionTrendView] = useState('department');
  const filtersKey = useMemo(() => JSON.stringify(selections), [selections]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API}/api/kcfx-library/age-analysis/query`, {
          method: 'POST',
          cache: 'no-store',
          headers: userHeaders(user, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ user: user?.name || '', filters: selections, search, page, pageSize: 20 })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result?.ok) throw new Error(result?.message || result?.error || '库龄维度分析数据尚未生成');
        if (!cancelled) {
          if (!initialized) {
            const latestMonth = monthFromRecordId(result.activeRecordId);
            setInitialized(true);
            if (latestMonth && !selections.month.length) {
              setSelections((current) => ({ ...current, month: [latestMonth] }));
              setPage(1);
              return;
            }
          }
          setPayload(result);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filtersKey, initialized, kcfxData?.savedAt, page, refreshVersion, search, selections, user]);

  const optionsById = useMemo(() => Object.fromEntries(FILTERS.map((filter) => [
    filter.id,
    (payload?.options?.[filter.id] || []).map((value) => ({
      value,
      label: filter.id === 'month'
        ? `${Number(value.slice(0, 4))}年${Number(value.slice(5, 7))}月`
        : value
    }))
  ])), [payload?.options]);

  const setFilterValue = useCallback((id, values) => {
    setSelections((current) => ({ ...current, [id]: values }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setSelections(EMPTY_SELECTIONS);
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
      const response = await fetch(`${API}/api/kcfx-library/age-analysis/export`, {
        method: 'POST',
        headers: userHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ user: user?.name || '', filters: selections, search })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `库龄维度分析明细_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      window.alert(`导出失败：${exportError?.message || exportError}`);
    } finally {
      setExporting(false);
    }
  }, [search, selections, user]);

  const metrics = payload?.metrics || {};
  const pagination = payload?.pagination || { page: 1, totalPages: 1, totalRows: 0 };
  const status = loading
    ? '数据加载中...'
    : error || `筛选后 ${formatNumber(metrics.rowCount || 0)} 行，库存数量 ${formatNumber(metrics.qty || 0, 2)}，库存货值 ${moneyWan(metrics.amount || 0)}`;
  const activeDimensionTrend = DIMENSION_TREND_VIEWS.find((item) => item.id === dimensionTrendView) || DIMENSION_TREND_VIEWS[0];
  const trendMonths = (payload?.monthSummaries || []).map((item) => item.month);

  return (
    <KcfxPageShell className="age-analysis-page" title="库龄维度分析" status={status} loading={loading} onRefresh={refresh}>
      <AgeAnalysisZone title="筛选条件" subtitle="按月份、仓库、事业部和商品维度限定分析范围" tone="filter">
        <FilterToolbar
          filters={FILTERS}
          optionsById={optionsById}
          selections={selections}
          openFilter={openFilter}
          setOpenFilter={setOpenFilter}
          setFilterValue={setFilterValue}
          resetFilters={resetFilters}
          searchValue={search}
          setSearchValue={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="搜索物料、SKU、仓库、事业部"
        />
      </AgeAnalysisZone>

      <AgeAnalysisZone title="核心指标" subtitle="当前筛选范围的库存规模和月份环比" tone="metrics">
        <MetricCards metrics={[
          {
            label: '库存货值',
            value: moneyWan(metrics.amount || 0),
            note: `环比 ${formatMonthOverMonth(metrics.amountMom)}`
          },
          {
            label: '库存数量',
            value: formatNumber(metrics.qty || 0, 2),
            note: `环比 ${formatMonthOverMonth(metrics.qtyMom)}`
          },
          { label: '物料数量', value: formatNumber(metrics.materialCount || 0) },
          { label: '仓库数量', value: formatNumber(metrics.warehouseCount || 0) },
          { label: '对比月份', value: metrics.comparisonMonth ? metrics.comparisonMonth.replace('-', '年') + '月' : '-' }
        ]} />
      </AgeAnalysisZone>

      <AgeAnalysisZone title="库存总体趋势" subtitle="库存货值与库存数量的跨月变化" tone="overview">
        <div className="trend-chart-grid inventory-trend-chart-grid age-analysis-trend-grid">
          <TrendPanel title="库存货值趋势" rows={payload?.trend || []} valueKey="amount" formatter={moneyWan} />
          <TrendPanel title="库存数量趋势" rows={payload?.trend || []} valueKey="qty" formatter={(value) => formatNumber(value, 2)} />
        </div>
      </AgeAnalysisZone>

      <AgeAnalysisZone
        title="维度变化趋势"
        subtitle="切换查看事业部、销售产品线或销售系列的跨月表现"
        tone="dimension"
        actions={(
          <div className="dimension-trend-switch" role="tablist" aria-label="维度变化趋势">
            {DIMENSION_TREND_VIEWS.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={dimensionTrendView === item.id}
                className={dimensionTrendView === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setDimensionTrendView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      >
        <div className="age-dimension-trend-grid">
          <DimensionTrendPanel
            title={activeDimensionTrend.label}
            rows={payload?.dimensionTrends?.[activeDimensionTrend.id] || []}
            months={trendMonths}
          />
        </div>
      </AgeAnalysisZone>

      <AgeAnalysisZone title="库龄结构趋势" subtitle="各库龄区间的库存金额或数量变化" tone="age">
        <AgeStackedTrend rows={payload?.ageTrend || []} mode={ageMode} setMode={setAgeMode} />
      </AgeAnalysisZone>

      <AgeAnalysisZone title="仓库货物流转" subtitle="按仓库类型和仓库位置查看跨月流转变化" tone="warehouse">
        <WarehouseFlowTrend
          rows={payload?.warehouseTypeTrend || []}
          salesOutboundLocationRows={payload?.salesOutboundWarehouseLocationTrend || []}
          months={trendMonths}
          mode={warehouseTypeMode}
          setMode={setWarehouseTypeMode}
        />
      </AgeAnalysisZone>

      <AgeAnalysisZone title="库存分布" subtitle="按库龄、事业部、产品线和仓库位置拆分库存" tone="distribution">
        <PanelGrid className="age-analysis-distribution-grid">
          <BarPanel title="库龄库存数量" rows={payload?.distributions?.ageQty || []} valueFormatter={(value) => formatNumber(value, 2)} />
          <BarPanel title="库龄库存金额" rows={payload?.distributions?.ageAmount || []} valueFormatter={moneyWan} />
          <BarPanel title="事业部库存货值" rows={payload?.distributions?.departmentAmount || []} valueFormatter={moneyWan} />
          <BarPanel title="销售产品线库存货值" rows={payload?.distributions?.productLineAmount || []} valueFormatter={moneyWan} />
          <BarPanel title="仓库位置库存货值" rows={payload?.distributions?.warehouseLocationAmount || []} valueFormatter={moneyWan} />
        </PanelGrid>
      </AgeAnalysisZone>

      <AgeAnalysisZone title="明细数据" subtitle="当前筛选结果的逐行库存明细" tone="detail">
        <section className="kcfx-panel">
          <div className="table-title-row">
            <div>
              <h3>库龄维度分析明细</h3>
              <p className="kcfx-table-note">共 {formatNumber(pagination.totalRows)} 行，每页20行</p>
            </div>
            <button type="button" className="ghost compact-button" onClick={exportRows} disabled={exporting || loading}>
              {exporting ? '导出中...' : '导出'}
            </button>
          </div>
          <SimpleTable rows={payload?.rows || []} paginated={false} columns={TABLE_COLUMNS} />
          <TablePagination
            page={pagination.page || page}
            pageSize={20}
            totalPages={pagination.totalPages || 1}
            totalRows={pagination.totalRows || 0}
            onPageChange={setPage}
            disabled={loading}
          />
        </section>
      </AgeAnalysisZone>
    </KcfxPageShell>
  );
}

function AgeAnalysisZone({ title, subtitle, tone, actions = null, children }) {
  return (
    <section className={`age-analysis-zone is-${tone}`}>
      <header className="age-analysis-zone-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

function DimensionTrendPanel({ title, rows, months }) {
  const [mode, setMode] = useState('amount');
  const [page, setPage] = useState(1);
  const matrix = useMemo(() => buildDimensionTrendMatrix(rows, mode, months, {
    page,
    pageSize: 20
  }), [mode, months, page, rows]);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setPage(1);
  };
  const minWidth = 190 + matrix.months.length * 108 + 106;

  return (
    <section className="kcfx-panel dimension-trend-panel">
      <div className="table-title-row dimension-trend-header">
        <h3>{title}</h3>
        <div className="age-mode-switch" role="group" aria-label={`${title}口径`}>
          <button type="button" className={mode === 'amount' ? 'active' : ''} onClick={() => changeMode('amount')}>金额</button>
          <button type="button" className={mode === 'qty' ? 'active' : ''} onClick={() => changeMode('qty')}>数量</button>
        </div>
      </div>
      <div className="dimension-trend-scroll">
        <table className="dimension-trend-table" style={{ minWidth: `${minWidth}px` }}>
          <thead>
            <tr>
              <th>分类</th>
              {matrix.months.map((month) => <th key={month}>{formatDimensionMonth(month)}</th>)}
              <th>走势</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.length ? matrix.rows.map((item) => (
              <tr key={item.name}>
                <th scope="row" title={item.name}>{item.name}</th>
                {item.values.map((valueItem) => {
                  const intensity = item.maxValue > 0 ? valueItem.value / item.maxValue : 0;
                  const alpha = valueItem.value > 0 ? 0.08 + intensity * 0.34 : 0;
                  return (
                    <td
                      key={valueItem.month}
                      style={{ backgroundColor: alpha ? `rgba(23, 105, 224, ${alpha})` : undefined }}
                      title={`${item.name} ${formatDimensionMonth(valueItem.month)} ${formatDimensionTrendValue(mode, valueItem.value)}，环比 ${formatMonthOverMonth(valueItem.mom)}`}
                    >
                      <strong>{formatDimensionTrendValue(mode, valueItem.value)}</strong>
                      <small>环比 {formatMonthOverMonth(valueItem.mom)}</small>
                    </td>
                  );
                })}
                <td className="dimension-trend-spark-cell">
                  <DimensionSparkline values={item.values.map((valueItem) => valueItem.value)} label={item.name} />
                </td>
              </tr>
            )) : (
              <tr><td className="empty" colSpan={matrix.months.length + 2}>暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {matrix.totalRows > matrix.pageSize && (
        <TablePagination
          page={matrix.page}
          pageSize={matrix.pageSize}
          totalPages={matrix.totalPages}
          totalRows={matrix.totalRows}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}

function DimensionSparkline({ values, label }) {
  const width = 88;
  const height = 34;
  const padding = 4;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min;
  const points = values.map((value, index) => {
    const x = values.length > 1
      ? padding + (index / (values.length - 1)) * (width - padding * 2)
      : width / 2;
    const y = range
      ? height - padding - ((value - min) / range) * (height - padding * 2)
      : height / 2;
    return { x, y };
  });

  return (
    <svg className="dimension-trend-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}跨月走势`}>
      <polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} />
      {points.map(({ x, y }, index) => (
        <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 2.6 : 1.8} />
      ))}
    </svg>
  );
}

function formatDimensionTrendValue(mode, value) {
  return mode === 'amount' ? moneyWan(value) : formatNumber(value, 0);
}

function formatDimensionMonth(month) {
  const monthNumber = Number(String(month || '').split('-').at(-1));
  return monthNumber ? `${monthNumber}月` : String(month || '');
}

function TrendPanel({ title, rows, valueKey, formatter }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  return (
    <section className="panel trend-panel">
      <h2>{title}</h2>
      <div className="age-month-bars" style={{ '--age-month-count': Math.max(rows.length, 1) }}>
        {rows.length ? rows.map((row, index) => {
          const value = Number(row[valueKey]) || 0;
          const previous = index > 0 ? Number(rows[index - 1]?.[valueKey]) || 0 : 0;
          const mom = index > 0 && previous ? ((value - previous) / Math.abs(previous)) * 100 : null;
          return (
            <div className="age-month-bar-item" key={row.month}>
              <div className="age-month-bar-value">
                <span>{formatter(value)}</span>
                <small>环比 {formatMonthOverMonth(mom)}</small>
              </div>
              <div className="age-month-bar-track">
                <div
                  className="age-month-bar-fill"
                  style={{
                    height: `${Math.max(value ? 3 : 0, (value / max) * 100)}%`,
                    background: KCFX_COLORS[index % KCFX_COLORS.length]
                  }}
                />
              </div>
              <span className="age-month-label">{row.label}</span>
            </div>
          );
        }) : <div className="empty">暂无数据</div>}
      </div>
    </section>
  );
}

function AgeStackedTrend({ rows, mode, setMode }) {
  const { ageGroups, matrix } = buildAgeTrendMatrix(rows, mode);
  const colors = Object.fromEntries(ageGroups.map((group, index) => [group, AGE_TREND_COLORS[index % AGE_TREND_COLORS.length]]));
  const maxVisibleSegments = Math.max(...matrix.map((item) => item.values.filter(({ value }) => value > 0).length), 1);
  const chartMinWidth = Math.max(920, maxVisibleSegments * 104 + 220);
  return (
    <section className="kcfx-panel age-stacked-panel">
      <div className="table-title-row">
        <h3>库龄跨月趋势</h3>
        <div className="age-mode-switch" role="group" aria-label="库龄趋势口径">
          <button type="button" className={mode === 'amount' ? 'active' : ''} onClick={() => setMode('amount')}>金额</button>
          <button type="button" className={mode === 'qty' ? 'active' : ''} onClick={() => setMode('qty')}>数量</button>
        </div>
      </div>
      <div className="age-legend">
        {ageGroups.map((group) => <span key={group}><i style={{ background: colors[group] }} />{group}</span>)}
      </div>
      <div className="age-stacked-chart-scroll">
        <div className="age-stacked-chart" style={{ minWidth: `${chartMinWidth}px` }}>
          <div className="age-stacked-rows">
            {matrix.length ? matrix.map((item) => (
              <div className="age-stacked-row" key={item.month}>
                <span>{item.month.replace('-', '年')}月</span>
                <div className="age-stacked-track">
                  {item.values.map(({ ageGroup, value, mom }) => (
                    <div
                      className={`age-stacked-segment${value ? '' : ' is-zero'}`}
                      key={ageGroup}
                      title={`${ageGroup} ${formatAgeTrendValue(mode, value)}，环比 ${formatMonthOverMonth(mom)}`}
                      style={{
                        flexGrow: Math.max(value, 0),
                        flexBasis: value > 0 ? '104px' : '0px',
                        background: colors[ageGroup]
                      }}
                    >
                      {value > 0 && (
                        <span>
                          <b>{formatAgeTrendSegmentValue(mode, value)}</b>
                          <small>环比 {formatMonthOverMonth(mom)}</small>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <strong>
                  <span>{formatAgeTrendValue(mode, item.total)}</span>
                  <small>环比 {formatMonthOverMonth(item.totalMom)}</small>
                </strong>
              </div>
            )) : <div className="empty">暂无数据</div>}
          </div>
        </div>
      </div>
      {matrix.length > 0 && (
        <div className="age-value-table-wrap">
          <table className="age-value-table">
            <thead>
              <tr>
                <th>月份</th>
                {ageGroups.map((ageGroup) => (
                  <th key={ageGroup}>
                    <span className="age-value-heading">
                      <i style={{ background: colors[ageGroup] }} />
                      {ageGroup}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((item) => (
                <tr key={item.month}>
                  <th>{item.month.replace('-', '年')}月</th>
                  {item.values.map(({ ageGroup, value, mom }) => (
                    <td className={value ? '' : 'is-zero'} key={ageGroup}>
                      <span>{formatAgeTrendValue(mode, value)}</span>
                      <small>环比 {formatMonthOverMonth(mom)}</small>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatAgeTrendValue(mode, value) {
  return mode === 'amount' ? moneyWan(value) : formatNumber(value, 0);
}

function formatAgeTrendSegmentValue(mode, value) {
  if (mode === 'amount') return `${formatNumber(value / 10000, 1)}万`;
  return formatNumber(value, 0);
}

function WarehouseFlowTrend({ rows, salesOutboundLocationRows, months, mode, setMode }) {
  const { groups, months: trendMonths } = buildWarehouseFlowTrend(rows, mode, months);
  const { series: salesOutboundLocationSeries } = buildSalesOutboundWarehouseLocationTrend(salesOutboundLocationRows, mode, trendMonths);
  const hasData = groups.some((group) => group.series.some((item) => item.values.some(({ value }) => value)));
  return (
    <section className="kcfx-panel warehouse-flow-trend-panel">
      <div className="table-title-row">
        <h3>仓库货物流转跨月趋势</h3>
        <WarehouseFlowModeSwitch mode={mode} setMode={setMode} label="仓库类型趋势口径" />
      </div>
      {hasData ? (
        <div className="warehouse-flow-groups">
          {groups.map((group) => (
            <section className={`warehouse-flow-group is-${group.id}`} key={group.id}>
              <div className="warehouse-flow-group-heading">
                <strong>{group.label}</strong>
              </div>
              <div className="warehouse-flow-scroll">
                <div className="warehouse-flow-row">
                  {group.series.map((item, index) => (
                    <React.Fragment key={item.warehouseType}>
                      {index > 0 && group.usesFlowArrows ? <span className="warehouse-flow-arrow" aria-hidden="true">→</span> : null}
                      <WarehouseFlowChart item={item} months={trendMonths} mode={mode} />
                    </React.Fragment>
                  ))}
                </div>
              </div>
              {group.id === 'forward' && salesOutboundLocationSeries.length > 0 ? (
                <div className="warehouse-flow-subgroup">
                  <div className="warehouse-flow-subgroup-heading">
                    <strong>销售出库仓-正向</strong>
                  </div>
                  <div className="warehouse-flow-scroll">
                    <div className="warehouse-flow-row">
                      {salesOutboundLocationSeries.map((item) => (
                        <WarehouseFlowChart item={item} months={trendMonths} mode={mode} key={item.warehouseType} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : <div className="empty">暂无数据</div>}
    </section>
  );
}

function WarehouseFlowModeSwitch({ mode, setMode, label }) {
  return (
    <div className="age-mode-switch" role="group" aria-label={label}>
      <button type="button" className={mode === 'amount' ? 'active' : ''} onClick={() => setMode('amount')}>金额</button>
      <button type="button" className={mode === 'qty' ? 'active' : ''} onClick={() => setMode('qty')}>数量</button>
    </div>
  );
}

function WarehouseFlowChart({ item, months, mode }) {
  const width = Math.max(mode === 'qty' ? 432 : 408, 72 + Math.max(months.length - 1, 0) * 68);
  const height = 176;
  const padding = { left: 36, right: 36, top: 52, bottom: 34 };
  const values = item.values.map(({ value }) => Number(value) || 0);
  const maxValue = Math.max(...values, 0);
  const chartBottom = height - padding.bottom;
  const chartHeight = chartBottom - padding.top;
  const slotWidth = (width - padding.left - padding.right) / Math.max(values.length, 1);
  const barWidth = Math.min(34, Math.max(18, slotWidth * 0.56));
  const bars = values.map((value, index) => {
    const scaledHeight = maxValue > 0 && value > 0 ? (value / maxValue) * chartHeight : 0;
    const barHeight = scaledHeight > 0 ? Math.max(2, scaledHeight) : 0;
    const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2;
    return {
      x,
      centerX: x + barWidth / 2,
      y: chartBottom - barHeight,
      height: barHeight
    };
  });
  return (
    <article className={`warehouse-flow-chart${item.dashed ? ' is-dashed' : ''}`}>
      <header>
        <strong title={item.warehouseType}>{item.warehouseType}</strong>
      </header>
      <svg style={{ width: `${width}px` }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${item.warehouseType}跨月趋势`}>
        <line className="warehouse-flow-axis-line" x1={padding.left} x2={width - padding.right} y1={chartBottom} y2={chartBottom} />
        {bars.map(({ x, centerX, y, height: currentBarHeight }, index) => {
          const valueItem = item.values[index] || {};
          const labelY = Math.max(13, y - 24);
          return (
            <g key={valueItem.month || index}>
              <title>{`${item.warehouseType} ${formatWarehouseMonth(valueItem.month)} ${formatWarehouseTypeTrendValue(mode, valueItem.value)}，环比 ${formatMonthOverMonth(valueItem.mom)}`}</title>
              <rect
                className={`warehouse-flow-bar${index === bars.length - 1 ? ' is-latest' : ''}`}
                x={x}
                y={y}
                width={barWidth}
                height={currentBarHeight}
                rx="2"
              />
              <text className={`warehouse-flow-value-label is-${mode}`} x={centerX} y={labelY}>
                <tspan x={centerX}>{formatWarehouseFlowBarValue(mode, valueItem.value)}</tspan>
                <tspan className="warehouse-flow-mom-label" x={centerX} dy="12">环比 {formatMonthOverMonth(valueItem.mom)}</tspan>
              </text>
              <text className="warehouse-flow-month-label" x={centerX} y={height - 10}>{formatWarehouseMonth(valueItem.month)}</text>
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function formatWarehouseTypeTrendValue(mode, value) {
  return mode === 'amount' ? moneyWan(value) : formatNumber(value, 0);
}

function formatWarehouseFlowBarValue(mode, value) {
  return mode === 'amount'
    ? `${formatNumber((Number(value) || 0) / 10000, 2)}万`
    : `${formatNumber(value, 0)}件`;
}

function formatWarehouseMonth(month) {
  const monthNumber = Number(String(month || '').split('-').at(-1));
  return monthNumber ? `${monthNumber}月` : String(month || '');
}
