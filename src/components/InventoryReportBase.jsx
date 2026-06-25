import React, { useMemo } from 'react';
import { BarPanel, KcfxPageShell, MetricCards, PanelGrid, SimpleTable, SourcePanel } from './KcfxCommon.jsx';
import { formatNumber, getInventoryRows, groupSum, moneyWan, normalizeText, recordSourceText, sum, uniqueCount } from './kcfxUtils.js';

export default function InventoryReportBase({
  title,
  kcfxRecords = {},
  loading = false,
  error = '',
  lastLoadedAt = '',
  onRefresh,
  filterRows = (rows) => rows,
  detailLimit = 120
}) {
  const allRows = useMemo(() => getInventoryRows(kcfxRecords), [kcfxRecords]);
  const rows = useMemo(() => filterRows(allRows), [allRows, filterRows]);
  const totalAmount = useMemo(() => sum(rows, 'amount'), [rows]);
  const totalQty = useMemo(() => sum(rows, 'qty'), [rows]);
  const status = loading
    ? '正在读取报告数据...'
    : error || `已读取 ${formatNumber(rows.length)} 行，库存金额 ${moneyWan(totalAmount)}${lastLoadedAt ? `；读取时间：${lastLoadedAt}` : ''}`;

  return (
    <KcfxPageShell title={title} status={status} loading={loading} onRefresh={onRefresh}>
      <MetricCards metrics={[
        { label: '库存金额', value: moneyWan(totalAmount) },
        { label: '库存数量', value: formatNumber(totalQty, 2) },
        { label: '物料数量', value: formatNumber(uniqueCount(rows, 'materialCode')) },
        { label: '仓库数量', value: formatNumber(uniqueCount(rows, 'warehouse')) }
      ]} />
      <PanelGrid>
        <BarPanel title="仓库类型" rows={groupSum(rows, 'warehouseType', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="仓库位置" rows={groupSum(rows, 'warehouseLocation', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="销售产品线" rows={groupSum(rows, 'productLine', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="销售系列" rows={groupSum(rows, 'productSeries', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="库龄段" rows={groupSum(rows, 'ageGroup', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
      </PanelGrid>
      <section className="kcfx-panel">
        <h3>库存明细</h3>
        <SimpleTable
          rows={rows}
          maxRows={detailLimit}
          columns={[
            { key: 'department', label: '事业部' },
            { key: 'warehouseLocation', label: '仓库位置' },
            { key: 'warehouse', label: '仓库' },
            { key: 'productLine', label: '销售产品线' },
            { key: 'productSeries', label: '销售系列' },
            { key: 'materialCode', label: '物料编码' },
            { key: 'qty', label: '库存数量', render: (row) => formatNumber(row.qty, 2) },
            { key: 'amount', label: '库存金额', render: (row) => moneyWan(row.amount) }
          ]}
        />
      </section>
      <SourcePanel sources={[
        { label: '库存数据', value: recordSourceText(kcfxRecords['fact-2']) },
        { label: '商品分类维表', value: recordSourceText(kcfxRecords['dim-product']) },
        { label: '仓库维表', value: recordSourceText(kcfxRecords['dim-warehouse']) }
      ]} />
    </KcfxPageShell>
  );
}

export function includesAny(value, words) {
  const text = normalizeText(value);
  return words.some((word) => text.includes(word));
}
