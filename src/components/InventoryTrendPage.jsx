import React, { useMemo } from 'react';
import { BarPanel, KcfxPageShell, MetricCards, PanelGrid, SimpleTable, SourcePanel } from './KcfxCommon.jsx';
import { INVENTORY_TREND_MONTHS, KCFX_COLORS, buildInventoryTrendRows, formatNumber, groupSum, moneyWan, recordSourceText, sum } from './kcfxUtils.js';
import { useKcfxRecordMap } from './kcfxRecordLoader.js';

const INVENTORY_TREND_RECORD_IDS = ['fact-2', 'fact-3', 'fact-4', 'fact-5', 'fact-6', 'fact-7', 'dim-product', 'dim-warehouse', 'dim-warehouse-material'];

export default function InventoryTrendPage({ kcfxData = null, kcfxRecords = {}, loading = false, error = '', lastLoadedAt = '', onRefresh }) {
  const { records: loadedRecords, loading: recordsLoading, error: recordsError, reload } = useKcfxRecordMap(kcfxData, INVENTORY_TREND_RECORD_IDS);
  const records = useMemo(() => ({ ...kcfxRecords, ...loadedRecords }), [kcfxRecords, loadedRecords]);
  const pageLoading = loading || recordsLoading;
  const pageError = recordsError || error;

  const monthRows = useMemo(() => (
    buildInventoryTrendRows(records).map((row, index) => ({ ...row, label: `${index + 1}月` }))
  ), [records]);
  const items = useMemo(() => monthRows.flatMap((row) => row.items || []), [monthRows]);
  const totalAmount = useMemo(() => sum(monthRows, 'amount'), [monthRows]);
  const totalQty = useMemo(() => sum(monthRows, 'qty'), [monthRows]);
  const loadedMonthCount = monthRows.filter((row) => row.record).length;
  const status = pageLoading
    ? '数据加载中...'
    : pageError || `已读取 ${loadedMonthCount}/${INVENTORY_TREND_MONTHS.length} 个月份文件，参与趋势计算 ${formatNumber(items.length)} 行，库存货值 ${moneyWan(totalAmount)}${lastLoadedAt ? `；读取时间：${lastLoadedAt}` : ''}`;

  const refresh = async () => {
    await Promise.all([reload(), onRefresh?.()]);
  };

  return (
    <KcfxPageShell title="库存趋势分析" status={status} loading={pageLoading} onRefresh={refresh}>
      <MetricCards metrics={[
        { label: '库存货值', value: moneyWan(totalAmount) },
        { label: '库存数量', value: formatNumber(totalQty, 2) },
        { label: '趋势月份', value: formatNumber(loadedMonthCount) },
        { label: '最大月份金额', value: moneyWan(Math.max(...monthRows.map((row) => row.amount), 0)) }
      ]} />

      <section className="trend-embed-panel analysis-section-trend">
        <div className="trend-chart-grid inventory-trend-chart-grid">
          <section className="panel trend-panel">
            <h2>
              库存货值趋势
              <span className="chart-total">合计 {moneyWan(totalAmount)}</span>
            </h2>
            <MonthTrendChart rows={monthRows.map((row) => ({ ...row, value: row.amount }))} formatter={moneyWan} />
          </section>
          <section className="panel trend-panel">
            <h2>
              库存数量趋势
              <span className="chart-total">合计 {formatNumber(totalQty, 2)}</span>
            </h2>
            <MonthTrendChart rows={monthRows.map((row) => ({ ...row, value: row.qty }))} formatter={(value) => formatNumber(value, 2)} />
          </section>
        </div>
      </section>

      <PanelGrid>
        <BarPanel title="事业部库存货值" rows={groupSum(items, 'department', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="销售产品线库存货值" rows={groupSum(items, 'productLine', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="仓库位置库存货值" rows={groupSum(items, 'warehouseLocation', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
      </PanelGrid>

      <section className="kcfx-panel">
        <h3>趋势明细</h3>
        <SimpleTable
          rows={monthRows}
          columns={[
            { key: 'label', label: '月份' },
            { key: 'usedRows', label: '参与行数', render: (row) => formatNumber(row.usedRows) },
            { key: 'qty', label: '库存合计', render: (row) => formatNumber(row.qty, 2) },
            { key: 'amount', label: '库存金额合计', render: (row) => moneyWan(row.amount) }
          ]}
        />
      </section>

      <SourcePanel sources={[
        ...INVENTORY_TREND_MONTHS.map((month, index) => ({ label: `${index + 1}月库存事实表`, value: recordSourceText(records[month.id]) })),
        { label: '库存分析月份表', value: recordSourceText(records['fact-2']) },
        { label: '商品分类维表', value: recordSourceText(records['dim-product']) },
        { label: '仓库维表', value: recordSourceText(records['dim-warehouse']) },
        { label: '仓库物料事业部对照表', value: recordSourceText(records['dim-warehouse-material']) }
      ]} />
    </KcfxPageShell>
  );
}

function MonthTrendChart({ rows, formatter }) {
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);

  return (
    <div className="vertical-trend-chart">
      <div
        className="trend-bars-vertical trend-one-row single-category"
        style={{ '--trend-month-count': Math.max(rows.length, 1) }}
      >
        <div className="trend-category">
          <div className="trend-bar-group">
            {rows.length ? rows.map((row, index) => {
              const value = Number(row.value) || 0;
              return (
                <div className="trend-bar-wrap" title={`${row.label} ${formatter(value)}`} key={row.id || row.label}>
                  <div
                    className="trend-bar"
                    style={{
                      height: `${Math.max(value ? 2 : 0, (value / max) * 100)}%`,
                      background: KCFX_COLORS[index % KCFX_COLORS.length]
                    }}
                  >
                    <span className="trend-bar-value">{formatter(value)}</span>
                  </div>
                </div>
              );
            }) : <div className="empty">暂无数据</div>}
          </div>
          <div className="trend-category-label">月份趋势</div>
        </div>
      </div>
      <div className="trend-month-axis" style={{ '--trend-month-count': Math.max(rows.length, 1) }}>
        {rows.map((row) => <span key={row.id || row.label}>{row.label}</span>)}
      </div>
    </div>
  );
}
