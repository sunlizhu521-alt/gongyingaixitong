import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MultiFilter from './MultiFilter.jsx';
import MonthCalendarFilter from './MonthCalendarFilter.jsx';
import { BarPanel, KcfxPageShell, PanelGrid, SimpleTable } from './KcfxCommon.jsx';
import { downloadKcfxRowsAsXlsx } from './kcfxExport.js';
import { KCFX_COLORS, formatNumber, formatQuantity, getCachedSalesRows, groupSum, recordSourceText, sum } from './kcfxUtils.js';
import { useKcfxRecordMap, useKcfxSalesRows } from './kcfxRecordLoader.js';
import { TablePagination } from './TablePagination.jsx';

const TREND_YEARS = ['2025', '2026'];
const TREND_YEAR_COLORS = { 2025: '#007aff', 2026: '#34c759' };
const TREND_FILTERS = [
  { id: 'salesMonth', field: 'salesMonth', allLabel: '全部销售月份', monthAllLabel: '全部数据月份', multiple: true, independentOptions: true, limit: 300 },
  { id: 'salesOrg', field: 'salesOrg', allLabel: '全部销售部门', limit: 300 },
  { id: 'storeShortName', field: 'storeShortName', allLabel: '店铺简称', limit: 300 },
  { id: 'productLine', field: 'productLine', allLabel: '全部销售产品线', limit: 300 },
  { id: 'productSeries', field: 'productSeries', allLabel: '全部销售系列', limit: 300 },
  { id: 'model', field: 'model', allLabel: '型号', limit: 300 },
  { id: 'realTransactionStatus', field: 'realTransactionStatus', allLabel: '是否真实交易', limit: 10 },
  { id: 'nonInternalTransactionStatus', field: 'nonInternalTransactionStatus', allLabel: '是否内部交易', limit: 10 },
  { id: 'finishedGoodsStatus', field: 'finishedGoodsStatus', allLabel: '是否成品', limit: 10 }
];
const SALES_TREND_NOTE = [
  '统计口径：',
  '销售数量取“应收数量”，销售金额取“销售额-不含税”。三个条件默认选择“真实交易、非内部交易、成品”。',
  '1、是否真实交易按销售仓库匹配一级仓库分类，系统集成仓库为“非真实交易”；',
  '2、是否内部交易按客户名称+物料编码匹配销售部门，内部交易显示“内部交易”，其他显示“非内部交易”；',
  '3、是否成品按商品维表判断，销售产品线为“其他/配件”或“健康办公”，或一级分类为“配件”或“护理床附件”时显示“非成品”；无法匹配均显示“未匹配”。'
].join('\n');
const DEFAULT_SELECTIONS = {
  ...Object.fromEntries(TREND_FILTERS.map((filter) => [filter.id, []])),
  realTransactionStatus: ['真实交易'],
  nonInternalTransactionStatus: ['非内部交易'],
  finishedGoodsStatus: ['成品']
};
const SALES_TREND_FILTER_STORAGE_KEY = 'gongyingai:filters:sales-trend:v2';
const SALES_TREND_RECORD_IDS = ['sales-data', 'dim-product', 'dim-store-name', 'dim-customer-material', 'dim-warehouse'];
const SALES_TREND_PAGE_SIZE = 20;
const SALES_TREND_TABLE_COLUMNS = [
  { key: 'salesMonth', label: '月份' },
  { key: 'salesOrg', label: '事业部' },
  { key: 'productLine', label: '销售产品线' },
  { key: 'productSeries', label: '销售系列' },
  { key: 'materialCode', label: '物料编码' },
  { key: 'sku', label: 'SKU', render: (row) => row.model || row.sku || '' },
  { key: 'materialName', label: '名称' },
  { key: 'qty', label: '数量', render: (row) => formatNumber(row.qty, 2), exportValue: (row) => Number(row.qty) || 0 }
];

export default function SalesTrendPage({ kcfxData = null, kcfxRecords = {}, error = '', lastLoadedAt = '', onRefresh }) {
  const [openFilter, setOpenFilter] = useState('');
  const [selections, setSelections] = useState(() => readTrendSelections());
  const [detailPage, setDetailPage] = useState(1);
  const salesRowsResult = useKcfxSalesRows(kcfxData);
  const shouldUseFallbackRecords = salesRowsResult.loaded && !salesRowsResult.loading && salesRowsResult.rows.length === 0;
  const fallbackRecordsResult = useKcfxRecordMap(kcfxData, shouldUseFallbackRecords ? SALES_TREND_RECORD_IDS : []);
  const fallbackRows = shouldUseFallbackRecords
    ? getCachedSalesRows({ ...kcfxRecords, ...fallbackRecordsResult.records }, { includeExcluded: true })
    : [];
  const salesRows = salesRowsResult.rows.length
    ? salesRowsResult.rows
    : fallbackRows;
  const usingFallbackRows = !salesRowsResult.rows.length && fallbackRows.length > 0;
  const loadedRecords = salesRowsResult.rows.length ? salesRowsResult.records : fallbackRecordsResult.records;
  const recordsLoading = salesRowsResult.loading || fallbackRecordsResult.loading;
  const recordsError = usingFallbackRows ? fallbackRecordsResult.error : (salesRowsResult.error || fallbackRecordsResult.error);
  const reload = async ({ force = false } = {}) => {
    const result = await salesRowsResult.reload({ force });
    if (!Array.isArray(result?.rows) || result.rows.length === 0) {
      await fallbackRecordsResult.reload({ force });
    }
    return result;
  };
  const records = useMemo(() => ({ ...kcfxRecords, ...loadedRecords }), [kcfxRecords, loadedRecords]);
  const pageLoading = recordsLoading;
  const pageError = recordsError || error;

  const trendRows = useMemo(() => (
    salesRows
      .filter((row) => TREND_YEARS.includes(row.salesYear) && row.salesMonthNumber)
  ), [salesRows]);

  const linkedOptions = useMemo(() => (
    Object.fromEntries(TREND_FILTERS.map((filter) => [
      filter.id,
      linkedFilterOptions(trendRows, filter, selections).map((value) => ({
        value,
        label: filter.id === 'salesMonth' ? formatMonthLabel(value) : value
      }))
    ]))
  ), [selections, trendRows]);

  const normalizedSelections = useMemo(() => (
    Object.fromEntries(TREND_FILTERS.map((filter) => {
      const optionValues = new Set((linkedOptions[filter.id] || []).map((option) => option.value));
      return [filter.id, (selections[filter.id] || []).filter((value) => optionValues.has(value))];
    }))
  ), [linkedOptions, selections]);

  const filteredRows = useMemo(() => (
    trendRows.filter((row) => rowMatchesSelections(row, normalizedSelections))
  ), [normalizedSelections, trendRows]);
  const detailPageCount = Math.max(1, Math.ceil(filteredRows.length / SALES_TREND_PAGE_SIZE));
  const detailRows = useMemo(() => {
    const start = (detailPage - 1) * SALES_TREND_PAGE_SIZE;
    return filteredRows.slice(start, start + SALES_TREND_PAGE_SIZE);
  }, [detailPage, filteredRows]);

  useEffect(() => {
    setDetailPage((current) => Math.min(Math.max(current, 1), detailPageCount));
  }, [detailPageCount]);

  const months = useMemo(() => (
    [...new Set(filteredRows.map((row) => row.salesMonthNumber).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b))
  ), [filteredRows]);

  const groupedTrend = useMemo(() => {
    const map = new Map();
    for (const row of filteredRows) {
      const key = `${row.salesYear}-${row.salesMonthNumber}`;
      map.set(key, (map.get(key) || 0) + (Number(row.qty) || 0));
    }
    return map;
  }, [filteredRows]);

  const totalQty = sum(filteredRows, 'qty');
  const status = pageLoading
    ? '数据加载中...'
    : pageError || `已按销售数据日期列读取 ${formatNumber(trendRows.length)} 行，年份：${TREND_YEARS.join(' / ')}，应收数量合计 ${formatQuantity(sum(trendRows, 'qty'))}${lastLoadedAt ? `；读取时间：${lastLoadedAt}` : ''}`;

  const refresh = async () => {
    await Promise.all([reload({ force: true }), onRefresh?.()]);
  };

  const downloadTrendRows = useCallback(() => {
    downloadKcfxRowsAsXlsx('销售趋势变化明细', filteredRows, SALES_TREND_TABLE_COLUMNS, '销售趋势变化明细');
  }, [filteredRows]);

  function setFilterValue(id, value) {
    setSelections((current) => {
      const next = { ...current, [id]: value };
      writeTrendSelections(next);
      return next;
    });
  }

  function clearFilters() {
    const defaults = cloneDefaultSelections();
    setSelections(defaults);
    writeTrendSelections(defaults);
    setOpenFilter('');
  }

  return (
    <KcfxPageShell
      title="销售趋势变化"
      status={status}
      note={SALES_TREND_NOTE}
      loading={pageLoading}
      onRefresh={refresh}
    >
      <section className="toolbar trend-filter-toolbar">
        <MonthCalendarFilter
          id="sales-trend-salesMonth"
          label="全部销售月份"
          allLabel="全部数据月份"
          multiple
          selected={normalizedSelections.salesMonth || []}
          options={linkedOptions.salesMonth || []}
          onChange={(value) => setFilterValue('salesMonth', value)}
          openFilter={openFilter}
          setOpenFilter={setOpenFilter}
        />
        {TREND_FILTERS.filter((filter) => filter.id !== 'salesMonth').map((filter) => (
          <MultiFilter
            key={filter.id}
            id={`sales-trend-${filter.id}`}
            label={filter.allLabel}
            allLabel={filter.allLabel}
            options={linkedOptions[filter.id] || []}
            selected={normalizedSelections[filter.id] || []}
            onChange={(value) => setFilterValue(filter.id, value)}
            openFilter={openFilter}
            setOpenFilter={setOpenFilter}
          />
        ))}
        <button type="button" onClick={clearFilters}>清除所有筛选</button>
      </section>

      <section className="trend-embed-panel analysis-section-trend">
        <div className="trend-chart-grid">
          <section className="panel trend-panel">
            <h2>
              销售趋势
              <span className="chart-total">合计 {formatQuantity(totalQty)}</span>
            </h2>
            <VerticalTrendChart months={months} grouped={groupedTrend} />
          </section>
        </div>
      </section>

      <PanelGrid>
        <BarPanel title="全部销售部门" rows={groupSum(filteredRows, 'salesOrg', 'qty', 10)} total={totalQty} valueFormatter={(value) => formatNumber(value, 2)} />
        <BarPanel title="店铺简称（日常汇报沟通简称）" rows={groupSum(filteredRows, 'storeShortName', 'qty', 10)} total={totalQty} valueFormatter={(value) => formatNumber(value, 2)} />
        <BarPanel title="销售产品线" rows={groupSum(filteredRows, 'productLine', 'qty', 10)} total={totalQty} valueFormatter={(value) => formatNumber(value, 2)} />
        <BarPanel title="销售系列" rows={groupSum(filteredRows, 'productSeries', 'qty', 10)} total={totalQty} valueFormatter={(value) => formatNumber(value, 2)} />
        <BarPanel title="型号" rows={groupSum(filteredRows, 'model', 'qty', 10)} total={totalQty} valueFormatter={(value) => formatNumber(value, 2)} />
      </PanelGrid>

      <section className="kcfx-panel sales-trend-detail-panel">
        <div className="table-title-row">
          <div>
            <h3>销售趋势明细</h3>
            <p className="kcfx-table-note">共 {formatNumber(filteredRows.length)} 行，每页 {SALES_TREND_PAGE_SIZE} 行</p>
          </div>
          <button type="button" className="ghost compact-button" onClick={downloadTrendRows} disabled={pageLoading || !filteredRows.length}>
            导出
          </button>
        </div>
        <SimpleTable rows={detailRows} paginated={false} columns={SALES_TREND_TABLE_COLUMNS} />
        <TablePagination
          page={detailPage}
          pageSize={SALES_TREND_PAGE_SIZE}
          totalPages={detailPageCount}
          totalRows={filteredRows.length}
          onPageChange={setDetailPage}
          disabled={pageLoading}
        />
      </section>

      <section className="data-source-panel sales-trend-source-panel">
        <div><strong>销售数据文件</strong>：{recordSourceText(records['sales-data'])}</div>
        <div><strong>商品分类维表</strong>：{recordSourceText(records['dim-product'])}</div>
        <div><strong>客户与物料对照表</strong>：{recordSourceText(records['dim-store-name'])}；销售数据文件 L 列匹配维表 D 列，取维表 E 列作为销售部门</div>
        <div><strong>店铺名称汇总（金蝶&领星&简称）</strong>：{recordSourceText(records['dim-customer-material'])}</div>
        <div><strong>仓库维表</strong>：{recordSourceText(records['dim-warehouse'])}</div>
      </section>
    </KcfxPageShell>
  );
}

function VerticalTrendChart({ months, grouped }) {
  const values = months.flatMap((month) => TREND_YEARS.map((year) => grouped.get(`${year}-${month}`) || 0));
  const max = Math.max(...values, 1);

  return (
    <div className="vertical-trend-chart">
      <div className="trend-legend">
        {TREND_YEARS.map((year) => (
          <span key={year}><i style={{ background: TREND_YEAR_COLORS[year] }} />{year}年</span>
        ))}
      </div>
      <div
        className="trend-bars-vertical trend-one-row single-category sales-yoy-trend"
        style={{ '--trend-month-count': Math.max(months.length, 1) }}
        aria-label="2025年和2026年同月同比趋势"
      >
        <div className="trend-category">
          <div className="trend-bar-group">
            {months.length ? months.map((month) => (
              <div className="trend-yoy-month-group" title={`${Number(month)}月`} key={month}>
                <div className="trend-yoy-bars">
                  {TREND_YEARS.map((year, index) => {
                    const value = grouped.get(`${year}-${month}`) || 0;
                    return (
                      <div className="trend-bar-wrap trend-yoy-bar-wrap" title={`${year}年${Number(month)}月 ${formatQuantity(value)}`} key={year}>
                        <div
                          className="trend-bar"
                          style={{
                            height: `${Math.max(value ? 2 : 0, (value / max) * 100)}%`,
                            background: TREND_YEAR_COLORS[year] || KCFX_COLORS[index % KCFX_COLORS.length]
                          }}
                        >
                          <span className="trend-bar-value">{formatQuantity(value)}</span>
                        </div>
                        <span className="trend-year-label">{year.slice(2)}年</span>
                      </div>
                    );
                  })}
                </div>
                <span className="trend-month-label trend-yoy-month-label">{Number(month)}月</span>
              </div>
            )) : <div className="empty">暂无数据</div>}
          </div>
          <div className="trend-category-label">销售趋势</div>
        </div>
      </div>
    </div>
  );
}

function linkedFilterOptions(rows, targetFilter, selections) {
  if (targetFilter.independentOptions) {
    return [...new Set(rows.map((row) => String(row[targetFilter.field] || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }
  const totals = new Map();
  for (const row of rows) {
    if (!rowMatchesSelections(row, selections, targetFilter.id)) continue;
    const name = String(row[targetFilter.field] || '').trim();
    if (!name) continue;
    totals.set(name, (totals.get(name) || 0) + (Number(row.qty) || 0));
  }
  return [...totals.entries()]
    .filter(([, value]) => value !== 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([name]) => name);
}

function rowMatchesSelections(row, selections, excludedFilterId = '') {
  return TREND_FILTERS.every((filter) => {
    if (filter.id === excludedFilterId) return true;
    const selected = selections[filter.id] || [];
    if (!selected.length) return true;
    const value = String(row[filter.field] || '').trim();
    if (filter.matchMonthNumber) {
      const rowMonth = value.slice(5, 7);
      return selected.some((selectedValue) => String(selectedValue || '').trim().slice(5, 7) === rowMonth);
    }
    return selected.includes(value);
  });
}

function formatMonthLabel(value) {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${year}年${Number(month)}月` : value;
}

function readTrendSelections() {
  if (typeof window === 'undefined') return cloneDefaultSelections();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SALES_TREND_FILTER_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cloneDefaultSelections();
    return Object.fromEntries(TREND_FILTERS.map((filter) => [
      filter.id,
      Array.isArray(parsed[filter.id]) && parsed[filter.id].length
        ? parsed[filter.id].map(String).filter(Boolean)
        : [...(DEFAULT_SELECTIONS[filter.id] || [])]
    ]));
  } catch {
    return cloneDefaultSelections();
  }
}

function cloneDefaultSelections() {
  return Object.fromEntries(Object.entries(DEFAULT_SELECTIONS).map(([key, values]) => [key, [...values]]));
}

function writeTrendSelections(selections) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SALES_TREND_FILTER_STORAGE_KEY, JSON.stringify(selections || DEFAULT_SELECTIONS));
  } catch {
    // Filter persistence is best-effort.
  }
}
