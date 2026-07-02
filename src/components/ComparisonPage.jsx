import React, { useMemo } from 'react';
import { KcfxPageShell, MetricCards, SimpleTable, SourcePanel } from './KcfxCommon.jsx';
import { FilterToolbar, useDashboardFilters } from './KcfxFilters.jsx';
import { formatNumber, getClosedInventoryRows, getInventoryRows, moneyWan, recordSourceText, sum } from './kcfxUtils.js';
import { useKcfxRecordMap } from './kcfxRecordLoader.js';

const COMPARISON_RECORD_IDS = ['fact-inventory', 'fact-2', 'dim-product', 'dim-warehouse', 'dim-warehouse-material'];
const EPSILON = 0.000001;
const COMPARISON_FILTERS = [
  { id: 'comparisonType', field: 'diffType', allLabel: '全部差异类型', sortByName: true },
  { id: 'comparisonDepartment', field: 'department', allLabel: '全部事业部', sortValueField: 'absDiff' },
  { id: 'comparisonProductLine', field: 'productLine', allLabel: '全部销售产品线', sortValueField: 'absDiff' },
  { id: 'comparisonProductSeries', field: 'productSeries', allLabel: '全部销售系列', sortValueField: 'absDiff' }
];

export default function ComparisonPage({ kcfxData = null, kcfxRecords = {}, error = '', lastLoadedAt = '', onRefresh }) {
  const { records: loadedRecords, loading: recordsLoading, error: recordsError, reload } = useKcfxRecordMap(kcfxData, COMPARISON_RECORD_IDS);
  const records = useMemo(() => ({ ...kcfxRecords, ...loadedRecords }), [kcfxRecords, loadedRecords]);
  const pageError = recordsError || error;
  const comparison = useMemo(() => buildComparison(records), [records]);
  const filterState = useDashboardFilters(comparison.rows, COMPARISON_FILTERS, {
    storageKey: 'gongyingai:filters:comparison:v1'
  });
  const filteredRows = filterState.filteredRows;
  const status = recordsLoading
    ? '数据加载中...'
    : pageError || `已生成 ${formatNumber(comparison.rows.length)} 条差异记录，筛选后 ${formatNumber(filteredRows.length)} 条${lastLoadedAt ? `；读取时间：${lastLoadedAt}` : ''}`;

  const refresh = async () => {
    await Promise.all([reload({ force: true }), onRefresh?.()]);
  };

  return (
    <KcfxPageShell title="表格对比分析" status={status} loading={recordsLoading} onRefresh={refresh}>
      <FilterToolbar filters={COMPARISON_FILTERS} {...filterState} />

      <MetricCards metrics={[
        { label: '数量差异行', value: formatNumber(comparison.qtyRows.length) },
        { label: '价格差异行', value: formatNumber(comparison.priceRows.length) },
        { label: '库存数量合计', value: formatNumber(comparison.inventoryQtyTotal, 2) },
        { label: '月份表数量合计', value: formatNumber(comparison.detailQtyTotal, 2) },
        { label: '差异金额合计', value: moneyWan(sum(filteredRows, 'valueDiff')) }
      ]} />

      <section className="kcfx-panel">
        <h3>差异明细</h3>
        <SimpleTable
          rows={filteredRows}
          maxRows={200}
          columns={[
            { key: 'diffType', label: '差异类型' },
            { key: 'organization', label: '组织' },
            { key: 'warehouse', label: '仓库' },
            { key: 'materialCode', label: '物料编码' },
            { key: 'materialName', label: '物料名称' },
            { key: 'department', label: '事业部' },
            { key: 'productLine', label: '销售产品线' },
            { key: 'productSeries', label: '销售系列' },
            { key: 'inventoryQty', label: '关账库存数量', render: (row) => formatNumber(row.inventoryQty, 2) },
            { key: 'detailQty', label: '月份表库存数量', render: (row) => formatNumber(row.detailQty, 2) },
            { key: 'qtyDiff', label: '数量差异', render: (row) => formatNumber(row.qtyDiff, 2) },
            { key: 'priceDiff', label: '价格差异', render: (row) => formatNumber(row.priceDiff, 4) }
          ]}
        />
      </section>

      <SourcePanel sources={[
        { label: '最近关账库存', value: recordSourceText(records['fact-inventory']) },
        { label: '库存分析月份表', value: recordSourceText(records['fact-2']) },
        { label: '商品分类维表', value: recordSourceText(records['dim-product']) },
        { label: '仓库维表', value: recordSourceText(records['dim-warehouse']) },
        { label: '仓库物料事业部对照表', value: recordSourceText(records['dim-warehouse-material']) }
      ]} />
    </KcfxPageShell>
  );
}

function buildComparison(records) {
  const inventoryRows = getClosedInventoryRows(records);
  const detailRows = getInventoryRows(records);
  const inventoryMap = summarizeRows(inventoryRows);
  const detailMap = summarizeRows(detailRows);
  const keys = new Set([...inventoryMap.keys(), ...detailMap.keys()]);
  const allRows = [...keys].map((key) => {
    const inventory = inventoryMap.get(key) || {};
    const detail = detailMap.get(key) || {};
    const inventoryQty = inventory.qty || 0;
    const detailQty = detail.qty || 0;
    const inventoryPrice = inventory.price || 0;
    const detailPrice = detail.price || 0;
    const qtyDiff = inventoryQty - detailQty;
    const priceDiff = inventoryPrice && detailPrice ? inventoryPrice - detailPrice : 0;
    const valueDiff = (inventory.amount || 0) - (detail.amount || 0);
    const base = inventory.materialCode ? inventory : detail;
    return {
      key,
      organization: base.organization || '',
      warehouse: base.warehouse || '',
      materialCode: base.materialCode || '',
      materialName: base.materialName || '',
      department: base.department || '未匹配事业部',
      productLine: base.productLine || '未匹配产品线',
      productSeries: base.productSeries || '未匹配系列',
      inventoryQty,
      detailQty,
      inventoryPrice,
      detailPrice,
      qtyDiff,
      priceDiff,
      valueDiff,
      absDiff: Math.abs(qtyDiff) + Math.abs(priceDiff) + Math.abs(valueDiff)
    };
  });
  const qtyRows = allRows
    .filter((row) => Math.abs(row.qtyDiff) > EPSILON)
    .map((row) => ({ ...row, diffType: '数量差异' }));
  const priceRows = allRows
    .filter((row) => row.inventoryPrice > 0 && row.detailPrice > 0 && Math.abs(row.priceDiff) > 0.0001)
    .map((row) => ({ ...row, diffType: '价格差异' }));
  return {
    rows: [...qtyRows, ...priceRows].sort((a, b) => b.absDiff - a.absDiff).slice(0, 1500),
    qtyRows,
    priceRows,
    inventoryQtyTotal: sum(inventoryRows, 'qty'),
    detailQtyTotal: sum(detailRows, 'qty')
  };
}

function summarizeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = [row.organization || '', row.warehouse || '', row.materialCode || ''].join('|');
    if (!row.materialCode) continue;
    const current = map.get(key) || {
      organization: row.organization,
      warehouse: row.warehouse,
      materialCode: row.materialCode,
      materialName: row.materialName,
      department: row.department,
      productLine: row.productLine,
      productSeries: row.productSeries,
      qty: 0,
      amount: 0,
      price: 0
    };
    current.qty += Number(row.qty) || 0;
    current.amount += Number(row.amount) || 0;
    current.price = current.qty ? current.amount / current.qty : Number(row.price) || 0;
    map.set(key, current);
  }
  return map;
}
