import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import { BarPanel, KcfxPageShell, MetricCards, PanelGrid, SimpleTable, SourcePanel } from './KcfxCommon.jsx';
import { FilterToolbar, useDashboardFilters } from './KcfxFilters.jsx';
import { readFeedbackDrafts, writeFeedbackDrafts } from './feedbackDraftStorage.js';
import { downloadKcfxRowsAsXlsx } from './kcfxExport.js';
import { formatNumber, groupSum, moneyWan, recordSourceText, sum, uniqueCount } from './kcfxUtils.js';
import { CURRENT_INVENTORY_AGE_BUCKETS, LEGACY_INVENTORY_AGE_BUCKETS } from '../../shared/kcfxInventoryMonth.js';

const AGE_BUCKET_ORDER = [
  ...CURRENT_INVENTORY_AGE_BUCKETS,
  ...LEGACY_INVENTORY_AGE_BUCKETS.filter((bucket) => !CURRENT_INVENTORY_AGE_BUCKETS.includes(bucket))
];
const RECEIPT_FILTERS = [
  { id: 'receiptWarehouseType', field: 'warehouseType', allLabel: '全部仓库类型', sortByName: true, sortValueField: 'amount' },
  { id: 'receiptDepartment', field: 'department', allLabel: '全部事业部', sortValueField: 'amount' },
  { id: 'receiptAgeGroup', field: 'ageGroup', allLabel: '全部库龄', preferredOrder: AGE_BUCKET_ORDER, sortValueField: 'amount' },
  { id: 'receiptSaleStatus', field: 'saleStatus', allLabel: '全部可售状态', sortValueField: 'amount' },
  { id: 'receiptProductCategory', field: 'productCategory', allLabel: '全部商品分类', sortValueField: 'amount' },
  { id: 'receiptProductLine', field: 'productLine', allLabel: '全部销售产品线', sortValueField: 'amount' },
  { id: 'receiptProductSeries', field: 'productSeries', allLabel: '全部销售系列', sortValueField: 'amount' },
  { id: 'receiptWarehouseLocation', field: 'warehouseLocation', allLabel: '全部仓库位置', sortValueField: 'amount' }
];
const RECEIPT_SEARCH_FIELDS = ['materialCode', 'materialName', 'warehouse', 'organization', 'department', 'warehouseType', 'saleStatus', 'productCategory', 'productLine', 'productSeries', 'warehouseLocation'];
const RECEIPT_TABLE_COLUMNS = [
  { key: 'department', label: '事业部' },
  { key: 'productLine', label: '销售产品线' },
  { key: 'productSeries', label: '销售系列' },
  { key: 'materialCode', label: '物料编码' },
  { key: 'materialName', label: '物料名称' },
  { key: 'warehouse', label: '仓库' },
  { key: 'qty', label: '关账结存库存', render: (row) => formatNumber(row.qty, 2), exportValue: (row) => Number(row.qty) || 0 },
  { key: 'amount', label: '库存金额合计', render: (row) => moneyWan(row.amount), exportValue: (row) => Number(row.amount) || 0 }
];
const RECEIPT_FEEDBACK_DRAFT_STORAGE_KEY = 'gongyingai:receipt-feedback-drafts:v1';
const RECEIPT_FILTER_FEEDBACK_DRAFT_STORAGE_KEY = 'gongyingai:receipt-filter-feedback-draft:v1';
let receiptSummaryCache = { savedAt: '', payload: null };
let receiptSummaryPromise = null;
let receiptSummaryPromiseSavedAt = '';

async function fetchReceiptSummary(savedAt = '', { force = false } = {}) {
  if (!force && receiptSummaryCache.payload && receiptSummaryCache.savedAt === savedAt) {
    return receiptSummaryCache.payload;
  }
  if (!force && receiptSummaryPromise && receiptSummaryPromiseSavedAt === savedAt) return receiptSummaryPromise;
  receiptSummaryPromiseSavedAt = savedAt;
  const requestPromise = fetch(`${API}/api/kcfx-library/receipt-summary`, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.ok) throw new Error(payload?.message || payload?.error || 'summary not ready');
      receiptSummaryCache = { savedAt, payload };
      return payload;
    })
    .finally(() => {
      if (receiptSummaryPromise === requestPromise) {
        receiptSummaryPromise = null;
        receiptSummaryPromiseSavedAt = '';
      }
    });
  receiptSummaryPromise = requestPromise;
  return requestPromise;
}
const RECEIPT_FEEDBACK_REQUIRED_FIELDS = [
  {
    key: 'operationStatus',
    label: '销售/运营状态',
    options: ['正常在售', '低动销', '已停售', '计划下市', 'Listing异常', '从未上架', '渠道转卖中', '促销清货中', '认证/合规不可售', '非可销成品', '售后备件库存', '库存数据异常']
  },
  {
    key: 'inventoryCause',
    label: '库存形成原因',
    options: ['销售预测偏高', '采购/MOQ备货过量', '项目/客户取消', '产品迭代下市', '退货未拆检', '质量/电池/功能问题', '缺包装/缺配件/需换标', 'Listing/广告/链接异常', '认证合规问题', '调拨/在途/FBA差异', '非运营备货', '历史遗留']
  },
  {
    key: 'consumptionPlan',
    label: '初步消耗方案',
    options: ['正常销售消耗', '降价促销', '跨渠道转卖', '跨仓/跨区域调拨', '组合赠品/搭售', '翻新/换包/换标后销售', '转售后备件', '退供/返厂', '报废/销毁', '账务差异核销', '需管理层决策']
  }
];

export default function ReceiptSummaryPage({ user = null, kcfxData = null, kcfxRecords = {}, error = '', lastLoadedAt = '', onRefresh }) {
  const [search, setSearch] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState(() => readFeedbackDrafts(RECEIPT_FEEDBACK_DRAFT_STORAGE_KEY));
  const [filterFeedbackDraft, setFilterFeedbackDraft] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(RECEIPT_FILTER_FEEDBACK_DRAFT_STORAGE_KEY) || '';
  });
  const [receiptFeedbackRequired, setReceiptFeedbackRequired] = useState({});
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const loadSummary = useCallback(async ({ force = false } = {}) => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const payload = await fetchReceiptSummary(kcfxData?.savedAt || '', { force });
      setSummary(payload);
    } catch (loadError) {
      setSummaryError(loadError?.message || String(loadError));
    } finally {
      setSummaryLoading(false);
    }
  }, [kcfxData?.savedAt]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, kcfxData?.savedAt]);

  const records = summary?.records || kcfxRecords || {};
  const pageError = summaryError || error;
  const rows = useMemo(() => expandReceiptSummaryRows(summary), [summary]);
  const filterState = useDashboardFilters(rows, RECEIPT_FILTERS, {
    searchFields: RECEIPT_SEARCH_FIELDS,
    searchValue: search,
    storageKey: 'gongyingai:filters:receipt-summary:v1'
  });
  const filteredRows = filterState.filteredRows;
  const totalAmount = useMemo(() => sum(filteredRows, 'amount'), [filteredRows]);
  const totalQty = useMemo(() => sum(filteredRows, 'qty'), [filteredRows]);
  const ageAmountRows = useMemo(() => orderedAgeGroupSum(filteredRows), [filteredRows]);
  const status = summaryLoading
    ? '数据加载中...'
    : pageError || `已读取 ${formatNumber(rows.length)} 行关账库存，筛选后 ${formatNumber(filteredRows.length)} 行，库存金额 ${moneyWan(totalAmount)}${lastLoadedAt ? `；读取时间：${lastLoadedAt}` : ''}`;

  const refresh = async () => {
    await Promise.all([loadSummary({ force: true }), onRefresh?.()]);
  };

  const downloadReceiptRows = useCallback(() => {
    downloadKcfxRowsAsXlsx('关账库存分析', filteredRows, RECEIPT_TABLE_COLUMNS, '关账库存分析');
  }, [filteredRows]);

  const filterFeedbackSnapshot = useMemo(() => buildReceiptFilterFeedbackSnapshot({
    filters: RECEIPT_FILTERS,
    selections: filterState.selections,
    search,
    filteredRowCount: filteredRows.length,
    totalQty,
    totalAmount,
    materialCount: uniqueCount(filteredRows, 'materialCode'),
    warehouseCount: uniqueCount(filteredRows, 'warehouse')
  }), [filterState.selections, filteredRows, search, totalAmount, totalQty]);

  const updateFilterFeedbackDraft = useCallback((value) => {
    setFilterFeedbackDraft(value);
    if (typeof window !== 'undefined') {
      if (String(value || '').trim()) window.localStorage.setItem(RECEIPT_FILTER_FEEDBACK_DRAFT_STORAGE_KEY, value);
      else window.localStorage.removeItem(RECEIPT_FILTER_FEEDBACK_DRAFT_STORAGE_KEY);
    }
  }, []);

  const submitFilterFeedback = useCallback(async () => {
    const feedback = String(filterFeedbackDraft || '').trim();
    if (!feedback) return;
    const response = await fetch(`${API}/api/kcfx-feedback/receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user?.id ? { 'x-user-id': user.id } : {}),
        ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
        ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
      },
      body: JSON.stringify({
        user: user?.name,
        userId: user?.id,
        sessionToken: user?.sessionToken,
        deviceId: user?.deviceId,
        feedback,
        rowKey: filterFeedbackSnapshot.rowKey,
        rowSummary: filterFeedbackSnapshot.summary,
        rowData: {
          feedbackScope: 'filter',
          feedbackScopeLabel: '筛选条件',
          filterKey: filterFeedbackSnapshot.rowKey,
          filterWarehouseType: filterFeedbackSnapshot.values.receiptWarehouseType,
          filterDepartment: filterFeedbackSnapshot.values.receiptDepartment,
          filterAgeGroup: filterFeedbackSnapshot.values.receiptAgeGroup,
          filterSaleStatus: filterFeedbackSnapshot.values.receiptSaleStatus,
          filterProductCategory: filterFeedbackSnapshot.values.receiptProductCategory,
          filterProductLine: filterFeedbackSnapshot.values.receiptProductLine,
          filterProductSeries: filterFeedbackSnapshot.values.receiptProductSeries,
          filterWarehouseLocation: filterFeedbackSnapshot.values.receiptWarehouseLocation,
          filterSearch: filterFeedbackSnapshot.search,
          filteredRowCount: filterFeedbackSnapshot.filteredRowCount,
          qty: filterFeedbackSnapshot.totalQty,
          amount: filterFeedbackSnapshot.totalAmount,
          materialCount: filterFeedbackSnapshot.materialCount,
          warehouseCount: filterFeedbackSnapshot.warehouseCount
        }
      })
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        message = payload?.error || payload?.message || message;
      } catch {}
      window.alert(`反馈提交失败：${message}`);
      return;
    }
    updateFilterFeedbackDraft('');
    window.alert('反馈已提交');
  }, [filterFeedbackDraft, filterFeedbackSnapshot, updateFilterFeedbackDraft, user?.deviceId, user?.id, user?.name, user?.sessionToken]);

  const receiptFeedbackKey = useCallback((row) => (
    [row.materialCode, row.warehouse, row.department, row.productLine, row.productSeries].filter(Boolean).join('|')
  ), []);

  const updateReceiptFeedbackDraft = useCallback((row, value) => {
    const key = receiptFeedbackKey(row);
    setFeedbackDrafts((current) => {
      const next = { ...current };
      if (String(value || '').trim()) next[key] = value;
      else delete next[key];
      writeFeedbackDrafts(RECEIPT_FEEDBACK_DRAFT_STORAGE_KEY, next);
      return next;
    });
  }, [receiptFeedbackKey]);

  const updateReceiptFeedbackRequired = useCallback((row, fieldKey, value) => {
    const key = receiptFeedbackKey(row);
    setReceiptFeedbackRequired((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [fieldKey]: value
      }
    }));
  }, [receiptFeedbackKey]);

  const submitReceiptFeedback = useCallback(async (row) => {
    const rowKey = receiptFeedbackKey(row);
    const feedback = feedbackDrafts[rowKey] || '';
    if (!feedback.trim()) return;
    const requiredValues = receiptFeedbackRequired[rowKey] || {};
    const missingField = RECEIPT_FEEDBACK_REQUIRED_FIELDS.find((field) => !String(requiredValues[field.key] || '').trim());
    if (missingField) {
      window.alert(`请选择${missingField.label}`);
      return;
    }
    const rowSummary = [row.materialCode, row.materialName, row.warehouse].filter(Boolean).join(' / ');
    const response = await fetch(`${API}/api/kcfx-feedback/receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user?.id ? { 'x-user-id': user.id } : {}),
        ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
        ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
      },
      body: JSON.stringify({
        user: user?.name,
        userId: user?.id,
        sessionToken: user?.sessionToken,
        deviceId: user?.deviceId,
        feedback,
        rowKey,
        rowSummary,
        rowData: {
          department: row.department,
          productLine: row.productLine,
          productSeries: row.productSeries,
          materialCode: row.materialCode,
          materialName: row.materialName,
          warehouse: row.warehouse,
          operationStatus: requiredValues.operationStatus,
          inventoryCause: requiredValues.inventoryCause,
          consumptionPlan: requiredValues.consumptionPlan,
          qty: Number(row.qty) || 0,
          amount: Number(row.amount) || 0
        }
      })
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        message = payload?.error || payload?.message || message;
      } catch {}
      window.alert(`反馈提交失败：${message}`);
      return;
    }
    window.alert('反馈已提交');
  }, [feedbackDrafts, receiptFeedbackKey, receiptFeedbackRequired, user?.deviceId, user?.id, user?.name, user?.sessionToken]);

  const receiptTableColumns = useMemo(() => [
    ...RECEIPT_TABLE_COLUMNS,
    ...RECEIPT_FEEDBACK_REQUIRED_FIELDS.map((field) => ({
      key: field.key,
      label: <span className="kcfx-required-column-label">{field.label}<em>*</em></span>,
      render: (row) => {
        const rowKey = receiptFeedbackKey(row);
        const values = receiptFeedbackRequired[rowKey] || {};
        return (
          <select
            className="table-input kcfx-feedback-select"
            required
            value={values[field.key] || ''}
            onChange={(event) => updateReceiptFeedbackRequired(row, field.key, event.target.value)}
          >
            <option value="">请选择</option>
            {field.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      }
    })),
    {
      key: 'feedbackText',
      label: '问题反馈',
      render: (row) => {
        const key = receiptFeedbackKey(row);
        return (
          <input
            className="table-input kcfx-feedback-input"
            value={feedbackDrafts[key] || ''}
            onChange={(event) => updateReceiptFeedbackDraft(row, event.target.value)}
            placeholder="填写问题反馈"
          />
        );
      }
    },
    {
      key: 'feedbackAction',
      label: '操作',
      render: (row) => {
        const rowKey = receiptFeedbackKey(row);
        const requiredValues = receiptFeedbackRequired[rowKey] || {};
        const missingRequired = RECEIPT_FEEDBACK_REQUIRED_FIELDS.some((field) => !String(requiredValues[field.key] || '').trim());
        return (
          <button
            type="button"
            className="ghost compact-button"
            onClick={() => submitReceiptFeedback(row)}
            disabled={!String(feedbackDrafts[rowKey] || '').trim() || missingRequired}
          >
            提交
          </button>
        );
      }
    }
  ], [feedbackDrafts, receiptFeedbackKey, receiptFeedbackRequired, submitReceiptFeedback, updateReceiptFeedbackDraft, updateReceiptFeedbackRequired]);

  return (
    <KcfxPageShell title="关账库存分析" status={status} loading={summaryLoading} onRefresh={refresh}>
      <FilterToolbar
        filters={RECEIPT_FILTERS}
        searchValue={search}
        setSearchValue={setSearch}
        searchPlaceholder="搜索物料、仓库、事业部"
        {...filterState}
      />

      <MetricCards metrics={[
        { label: '库存金额合计', value: moneyWan(totalAmount) },
        { label: '库存合计', value: formatNumber(totalQty, 2) },
        { label: '物料数量', value: formatNumber(uniqueCount(filteredRows, 'materialCode')) },
        { label: '仓库数量', value: formatNumber(uniqueCount(filteredRows, 'warehouse')) },
        { label: '事业部数量', value: formatNumber(uniqueCount(filteredRows, 'department')) }
      ]} />

      <PanelGrid className="receipt-summary-amount-grid">
        <BarPanel title="仓库类型库存金额" rows={groupSum(filteredRows, 'warehouseType', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="库龄段库存金额" rows={ageAmountRows} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="销售产品线库存金额" rows={groupSum(filteredRows, 'productLine', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="销售系列库存金额" rows={groupSum(filteredRows, 'productSeries', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
        <BarPanel title="仓库位置库存金额" rows={groupSum(filteredRows, 'warehouseLocation', 'amount', 10)} total={totalAmount} valueFormatter={moneyWan} />
      </PanelGrid>

      <section className="kcfx-panel kcfx-filter-feedback-panel">
        <div className="table-title-row">
          <div>
            <div className="kcfx-filter-feedback-heading">
              <h3>当前筛选条件问题反馈</h3>
              <button
                type="button"
                className="ghost compact-button"
                onClick={submitFilterFeedback}
                disabled={!String(filterFeedbackDraft || '').trim()}
              >
                提交反馈
              </button>
            </div>
            <p className="kcfx-table-note">{filterFeedbackSnapshot.summary}</p>
          </div>
        </div>
        <div className="kcfx-filter-feedback-tags">
          {filterFeedbackSnapshot.displayPairs.map((item) => (
            <span key={item.label}><strong>{item.label}</strong>{item.value}</span>
          ))}
        </div>
        <textarea
          className="kcfx-filter-feedback-textarea"
          value={filterFeedbackDraft}
          onChange={(event) => updateFilterFeedbackDraft(event.target.value)}
          placeholder="填写当前筛选条件下发现的问题"
        />
      </section>

      <section className="kcfx-panel">
        <div className="table-title-row">
          <h3>库存分析月份表</h3>
          <button type="button" className="ghost compact-button" onClick={downloadReceiptRows} disabled={summaryLoading || !filteredRows.length}>
            导出
          </button>
        </div>
        <SimpleTable rows={filteredRows} maxRows={120} columns={receiptTableColumns} />
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

function buildReceiptFilterFeedbackSnapshot({
  filters,
  selections,
  search,
  filteredRowCount,
  totalQty,
  totalAmount,
  materialCount,
  warehouseCount
}) {
  const values = Object.fromEntries(filters.map((filter) => [
    filter.id,
    selectedFilterValue(selections?.[filter.id], filter.allLabel)
  ]));
  const normalizedSearch = String(search || '').trim();
  const displayPairs = [
    { label: '仓库类型', value: values.receiptWarehouseType },
    { label: '事业部', value: values.receiptDepartment },
    { label: '库龄', value: values.receiptAgeGroup },
    { label: '可售状态', value: values.receiptSaleStatus },
    { label: '商品分类', value: values.receiptProductCategory },
    { label: '销售产品线', value: values.receiptProductLine },
    { label: '销售系列', value: values.receiptProductSeries },
    { label: '仓库位置', value: values.receiptWarehouseLocation },
    { label: '搜索词', value: normalizedSearch || '全部' }
  ];
  const keyParts = [
    '筛选条件',
    ...displayPairs.filter((item) => item.label !== '搜索词').map((item) => `${item.label}:${item.value}`),
    `搜索词:${normalizedSearch}`
  ];
  const rowKey = keyParts.reduce((key, part) => (
    part.startsWith('销售系列:') ? `${key}+${part}` : `${key}|${part}`
  ));
  return {
    values,
    search: normalizedSearch,
    rowKey,
    summary: `筛选后 ${formatNumber(filteredRowCount)} 行，库存 ${formatNumber(totalQty, 2)}，金额 ${moneyWan(totalAmount)}`,
    displayPairs,
    filteredRowCount,
    totalQty: Number(totalQty) || 0,
    totalAmount: Number(totalAmount) || 0,
    materialCount: Number(materialCount) || 0,
    warehouseCount: Number(warehouseCount) || 0
  };
}

function selectedFilterValue(values = [], allLabel = '全部') {
  if (!Array.isArray(values) || !values.length) return allLabel || '全部';
  return values.join('、');
}

function expandReceiptSummaryRows(summary) {
  const fields = Array.isArray(summary?.rowFields) ? summary.rowFields : [];
  const compactRows = Array.isArray(summary?.rowsCompact) ? summary.rowsCompact : [];
  const ageBuckets = Array.isArray(summary?.ageBuckets) ? summary.ageBuckets : [];
  return compactRows.map((values) => {
    const row = {};
    fields.forEach((field, index) => {
      const value = values[index];
      if (field === 'ageQuantities' || field === 'ageSettlementAmounts') {
        row[field] = Object.fromEntries(ageBuckets.map((bucket, bucketIndex) => [bucket, Number(value?.[bucketIndex]) || 0]));
      } else {
        row[field] = value;
      }
    });
    const qty = Number(row.inventoryTotal || row.endingQty || row.ageQuantityTotal) || 0;
    const amount = Number(row.inventoryAmountTotal || row.settlementAmount || row.ageSettlementAmount) || 0;
    return {
      ...row,
      qty,
      amount,
      productSeries: row.productSeries || row.series || '',
      ageGroup: dominantAgeBucket(row.ageQuantities, row.ageSettlementAmounts)
    };
  });
}

function dominantAgeBucket(ageQuantities = {}, ageSettlementAmounts = {}) {
  const entries = Object.keys(ageQuantities).map((bucket) => ({
    bucket,
    value: Number(ageSettlementAmounts[bucket]) || Number(ageQuantities[bucket]) || 0
  }));
  return entries.sort((a, b) => b.value - a.value)[0]?.bucket || '';
}

function orderedAgeGroupSum(rows) {
  const totals = new Map(AGE_BUCKET_ORDER.map((bucket) => [bucket, 0]));
  for (const row of rows) {
    const name = String(row.ageGroup || '').trim();
    if (!name) continue;
    totals.set(name, (totals.get(name) || 0) + (Number(row.amount) || 0));
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value !== 0)
    .sort((a, b) => {
      const ai = AGE_BUCKET_ORDER.indexOf(a.name);
      const bi = AGE_BUCKET_ORDER.indexOf(b.name);
      const aIndex = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
      const bIndex = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex || a.name.localeCompare(b.name, 'zh-CN');
    });
}
