import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import { isStoreMappingRecordValid, STORE_MAPPING_CUSTOMER_HEADERS } from '../../shared/kcfxStoreMapping.js';
import { TablePagination, useTablePagination } from './TablePagination.jsx';
import { downloadErrorWorkbook } from './errorReportExport.js';

const EMPTY_TABLES = {
  closed: emptyErrorResult(),
  detail: emptyErrorResult(),
  sales: emptySalesErrorResult(),
  trend: emptyTrendErrorResult(),
  age: emptyAgeErrorResult(),
  inventorySummary: emptySummaryErrorResult(),
  salesSummary: emptySalesSummaryErrorResult()
};

const INVENTORY_SUMMARY_ERROR_COLUMNS = [
  ['sourceType', '报表分段'],
  ['organization', '库存组织'],
  ['warehouse', '仓库名称'],
  ['supplier', '供应商'],
  ['department', '事业部'],
  ['productLine', '产品线'],
  ['materialCode', '物料编码'],
  ['sku', 'SKU'],
  ['kingdeeName', '金蝶名称'],
  ['inventoryLocation', '库存所在地'],
  ['qty', '数量'],
  ['reason', '报错原因']
];

const SALES_SUMMARY_ERROR_COLUMNS = [
  ['salesMonth', '月份'],
  ['customer', '客户名称'],
  ['department', '事业部'],
  ['channel', '渠道'],
  ['productLine', '产品线'],
  ['materialCode', '物料编码'],
  ['sku', 'SKU'],
  ['kingdeeName', '金蝶名称'],
  ['qty', '销售数量'],
  ['amount', '销售金额'],
  ['reason', '报错原因']
];

const ERROR_DOWNLOAD_CONFIG = {
  productMissing: {
    sources: ['closed', 'detail', 'sales'],
    name: '商品维度缺失表',
    columns: [
      ['materialCode', '物料编码'],
      ['sku', 'SKU'],
      ['materialName', '物料名称'],
      ['qty', '数量']
    ]
  },
  divisionMissing: {
    sources: ['closed', 'detail'],
    name: '仓库与物料维度表缺失',
    columns: [
      ['organization', '库存组织'],
      ['warehouse', '仓库名称'],
      ['materialCode', '物料编码'],
      ['sku', 'SKU'],
      ['materialName', '物料名称'],
      ['qty', '数量']
    ]
  },
  warehouseMissing: {
    sources: ['closed', 'detail'],
    name: '仓库名称缺失表',
    columns: [
      ['warehouse', '仓库'],
      ['qty', '数量']
    ]
  },
  settlementMissing: {
    sources: ['closed', 'detail'],
    name: '结算价缺失表',
    columns: [
      ['materialCode', '物料编码'],
      ['materialName', '物料名称'],
      ['productLine', '销售产品线'],
      ['qty', '数量']
    ]
  },
  customerMaterialMissing: {
    sources: ['sales'],
    name: '客户与物料对照缺失表',
    columns: [
      ['salesDepartment', '销售部门名称'],
      ['customer', '客户/店铺'],
      ['materialCode', '物料编码'],
      ['sku', 'SKU'],
      ['materialName', '物料名称'],
      ['qty', '数量']
    ]
  },
  storeMissing: {
    sources: ['sales'],
    name: '店铺名称汇总缺失表',
    columns: [
      ['store', '客户名称'],
      ['normalized', '规范化客户名称'],
      ['qty', '数量']
    ]
  },
  trendDivisionMissing: {
    sources: ['trend'],
    name: '库存趋势事业部对照缺失表',
    columns: [
      ['month', '月份'],
      ['organization', '库存组织'],
      ['warehouse', '仓库名称'],
      ['materialCode', '物料编码'],
      ['sku', 'SKU'],
      ['materialName', '物料名称'],
      ['qty', '数量'],
      ['reason', '缺失原因']
    ]
  },
  ageDivisionMissing: {
    sources: ['age'],
    name: '库龄维度分析事业部对照缺失表',
    columns: [
      ['monthLabel', '月份'],
      ['organization', '库存组织'],
      ['warehouse', '仓库名称'],
      ['materialCode', '物料编码'],
      ['sku', 'SKU'],
      ['materialName', '物料名称'],
      ['qty', '数量'],
      ['reason', '缺失原因']
    ]
  },
  inventorySummaryProductMissing: {
    sources: ['inventorySummary'],
    name: '库存汇总商品维度信息缺失表',
    columns: INVENTORY_SUMMARY_ERROR_COLUMNS
  },
  inventorySummaryDepartmentMissing: {
    sources: ['inventorySummary'],
    name: '库存汇总事业部匹配缺失表',
    columns: INVENTORY_SUMMARY_ERROR_COLUMNS
  },
  inventorySummaryWarehouseMissing: {
    sources: ['inventorySummary'],
    name: '库存汇总库存所在地匹配缺失表',
    columns: INVENTORY_SUMMARY_ERROR_COLUMNS
  },
  inventorySummarySupplierMissing: {
    sources: ['inventorySummary'],
    name: '库存汇总供应商缺失表',
    columns: INVENTORY_SUMMARY_ERROR_COLUMNS
  },
  salesSummaryProductMissing: {
    sources: ['salesSummary'],
    name: '销售汇总商品维度信息缺失表',
    columns: SALES_SUMMARY_ERROR_COLUMNS
  },
  salesSummaryDepartmentMissing: {
    sources: ['salesSummary'],
    name: '销售汇总事业部匹配缺失表',
    columns: SALES_SUMMARY_ERROR_COLUMNS
  },
  salesSummaryChannelMissing: {
    sources: ['salesSummary'],
    name: '销售汇总店铺简称匹配缺失表',
    columns: SALES_SUMMARY_ERROR_COLUMNS
  }
};

const ERROR_SOURCE_OPTIONS = [
  { value: 'closed', label: '关账库存事实表' },
  { value: 'detail', label: '库存分析月份表' },
  { value: 'sales', label: '销售数据文件' },
  { value: 'trend', label: '库存趋势事实表' },
  { value: 'age', label: '库龄维度分析' },
  { value: 'inventorySummary', label: '库存汇总报表' },
  { value: 'salesSummary', label: '销售汇总报表' }
];

const ERROR_TYPE_OPTIONS = {
  closed: [
    { value: 'productMissing', label: '商品分类缺失' },
    { value: 'divisionMissing', label: '事业部对照缺失' },
    { value: 'warehouseMissing', label: '仓库对照缺失' },
    { value: 'settlementMissing', label: '结算价缺失' }
  ],
  detail: [
    { value: 'productMissing', label: '商品分类缺失' },
    { value: 'divisionMissing', label: '事业部对照缺失' },
    { value: 'warehouseMissing', label: '仓库对照缺失' },
    { value: 'settlementMissing', label: '结算价缺失' }
  ],
  sales: [
    { value: 'productMissing', label: '商品分类缺失' },
    { value: 'customerMaterialMissing', label: '客户物料缺失' },
    { value: 'storeMissing', label: '店铺名称缺失' }
  ],
  trend: [{ value: 'trendDivisionMissing', label: '事业部对照缺失' }],
  age: [{ value: 'ageDivisionMissing', label: '事业部对照缺失' }],
  inventorySummary: [
    { value: 'inventorySummaryProductMissing', label: '商品维度信息缺失' },
    { value: 'inventorySummaryDepartmentMissing', label: '事业部匹配缺失' },
    { value: 'inventorySummaryWarehouseMissing', label: '库存所在地匹配缺失' },
    { value: 'inventorySummarySupplierMissing', label: '供应商缺失' }
  ],
  salesSummary: [
    { value: 'salesSummaryProductMissing', label: '商品维度信息缺失' },
    { value: 'salesSummaryDepartmentMissing', label: '事业部匹配缺失' },
    { value: 'salesSummaryChannelMissing', label: '店铺简称匹配缺失' }
  ]
};

function userHeaders(user) {
  return {
    ...(user?.id ? { 'x-user-id': user.id } : {}),
    ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
    ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
  };
}

export default function ErrorsPage({
  kcfxData = null,
  kcfxRecords = {},
  user = null,
  loading = false,
  error = '',
  lastLoadedAt = '',
  onRefresh
}) {
  const [downloadMessage, setDownloadMessage] = useState('');
  const [trendSummary, setTrendSummary] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const [ageSummary, setAgeSummary] = useState(null);
  const [ageLoading, setAgeLoading] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [errorsSummary, setErrorsSummary] = useState(null);
  const [errorsSummaryLoading, setErrorsSummaryLoading] = useState(false);
  const [errorsSummaryError, setErrorsSummaryError] = useState('');
  const [selectedSource, setSelectedSource] = useState('closed');
  const [selectedErrorType, setSelectedErrorType] = useState('productMissing');
  const pageLoading = loading || trendLoading || ageLoading || errorsSummaryLoading;
  const pageError = trendError || ageError || errorsSummaryError || error;

  const loadTrendSummary = useCallback(async () => {
    setTrendLoading(true);
    setTrendError('');
    try {
      const response = await fetch(`${API}/api/kcfx-library/trend-summary`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setTrendSummary(await response.json());
    } catch (loadError) {
      setTrendError(loadError?.message || String(loadError));
    } finally {
      setTrendLoading(false);
    }
  }, []);

  const loadAgeSummary = useCallback(async () => {
    setAgeLoading(true);
    setAgeError('');
    try {
      const response = await fetch(`${API}/api/kcfx-library/age-analysis/department-missing`, {
        cache: 'no-store',
        headers: userHeaders(user)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setAgeSummary(await response.json());
    } catch (loadError) {
      setAgeError(loadError?.message || String(loadError));
    } finally {
      setAgeLoading(false);
    }
  }, [user]);

  const loadErrorsSummary = useCallback(async ({ force = false } = {}) => {
    setErrorsSummaryLoading(true);
    setErrorsSummaryError('');
    try {
      const response = await fetch(`${API}/api/kcfx-library/errors-summary${force ? '?refresh=1' : ''}`, {
        cache: 'no-store',
        headers: userHeaders(user)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!result?.ok) throw new Error(result?.error || result?.message || '报错信息检查失败');
      setErrorsSummary(result);
    } catch (loadError) {
      setErrorsSummaryError(loadError?.message || String(loadError));
    } finally {
      setErrorsSummaryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTrendSummary();
  }, [loadTrendSummary, kcfxData?.savedAt]);

  useEffect(() => {
    loadAgeSummary();
  }, [loadAgeSummary, kcfxData?.savedAt]);

  useEffect(() => {
    loadErrorsSummary();
  }, [loadErrorsSummary, kcfxData?.savedAt]);

  useEffect(() => {
    if (!trendSummary?.refreshing) return undefined;
    const timer = window.setTimeout(loadTrendSummary, 1500);
    return () => window.clearTimeout(timer);
  }, [loadTrendSummary, trendSummary?.refreshing]);

  const checks = useMemo(() => {
    return {
      closed: normalizeServerErrorResult(errorsSummary?.closed),
      detail: normalizeServerErrorResult(errorsSummary?.detail),
      sales: normalizeServerSalesErrorResult(errorsSummary?.sales),
      trend: buildTrendChecks(trendSummary),
      age: buildAgeAnalysisChecks(ageSummary),
      inventorySummary: buildSummaryReportChecks(errorsSummary?.inventorySummary, 'inventory'),
      salesSummary: buildSummaryReportChecks(errorsSummary?.salesSummary, 'sales')
    };
  }, [ageSummary, errorsSummary, trendSummary]);

  const statusText = useMemo(() => {
    if (pageLoading) return '数据加载中...';
    if (pageError) return `读取失败：${pageError}`;
    const messages = [
      checks.closed.message || `关账库存事实表：有库存物料 ${formatNumber(stockMaterialCount(checks.closed))} 个，缺失 ${formatNumber(totalMissingCount(checks.closed))} 项`,
      checks.detail.message || `库存分析月份表：有库存物料 ${formatNumber(stockMaterialCount(checks.detail))} 个，缺失 ${formatNumber(totalMissingCount(checks.detail))} 项`,
      checks.sales.message || `销售数据文件：销售物料 ${formatNumber(stockMaterialCount(checks.sales))} 个，缺失 ${formatNumber(totalMissingCount(checks.sales))} 项`,
      `库存趋势事实表：事业部对照缺失 ${formatNumber(checks.trend.trendDivisionMissing.length)} 项`,
      checks.age.message || `库龄维度分析：事业部对照缺失 ${formatNumber(checks.age.ageDivisionMissing.length)} 项`,
      `库存汇总报表：缺失 ${formatNumber(summaryReportMissingCount(checks.inventorySummary))} 项`,
      `销售汇总报表：缺失 ${formatNumber(summaryReportMissingCount(checks.salesSummary))} 项`
    ];
    const loadedText = lastLoadedAt ? `；读取时间：${lastLoadedAt}` : '';
    return `检查完成：${messages.join('；')}${loadedText}`;
  }, [checks, pageError, lastLoadedAt, pageLoading]);
  const refresh = async () => {
    await onRefresh?.();
    await Promise.all([loadErrorsSummary({ force: true }), loadTrendSummary(), loadAgeSummary()]);
  };
  const errorTypeOptions = ERROR_TYPE_OPTIONS[selectedSource] || [];
  const selectedRows = checks[selectedSource]?.[selectedErrorType] || [];
  const selectSource = (source) => {
    setSelectedSource(source);
    setSelectedErrorType(ERROR_TYPE_OPTIONS[source]?.[0]?.value || '');
  };
  const sourceIssueCount = (source) => (ERROR_TYPE_OPTIONS[source] || [])
    .reduce((total, option) => total + (checks[source]?.[option.value]?.length || 0), 0);

  async function downloadSingle(source, tableName) {
    const result = checks[source];
    const config = ERROR_DOWNLOAD_CONFIG[tableName];
    if (!result || !config || !config.sources.includes(source)) {
      setDownloadMessage('未找到对应的报错明细。');
      return;
    }
    setDownloadMessage('正在生成下载文件...');
    try {
      const XLSX = await import('xlsx');
      const prefix = `${errorSourceLabel(source)}-${config.name}`;
      downloadErrorWorkbook(XLSX, [{
        sheetName: '报错明细',
        rows: result[tableName] || [],
        columns: config.columns
      }], `${prefix}_${downloadTimestamp()}.xlsx`);
      setDownloadMessage('下载已生成。');
    } catch (downloadError) {
      console.error('Failed to download error report', downloadError);
      setDownloadMessage(`下载失败：${downloadError?.message || String(downloadError)}`);
    }
  }

  async function downloadAll() {
    setDownloadMessage('正在生成全部报错明细...');
    try {
      const XLSX = await import('xlsx');
      const reports = [];
      for (const source of ['closed', 'detail', 'sales', 'trend', 'age', 'inventorySummary', 'salesSummary']) {
        for (const [tableName, config] of Object.entries(ERROR_DOWNLOAD_CONFIG)) {
          if (!config.sources.includes(source)) continue;
          reports.push({
            sheetName: `${errorSourceLabel(source)}-${config.name}`,
            rows: checks[source][tableName] || [],
            columns: config.columns
          });
        }
      }
      downloadErrorWorkbook(XLSX, reports, `报错信息汇总_${downloadTimestamp()}.xlsx`);
      setDownloadMessage('全部报错明细已生成。');
    } catch (downloadError) {
      console.error('Failed to download all error reports', downloadError);
      setDownloadMessage(`下载失败：${downloadError?.message || String(downloadError)}`);
    }
  }

  return (
    <section className="errors-page">
      <header className="board-heading-row errors-heading">
        <div>
          <h2>报错信息提示</h2>
          <p className="section-count">{statusText}</p>
        </div>
        <div className="errors-actions">
          <button type="button" onClick={refresh} disabled={pageLoading}>
            {pageLoading ? '读取中' : '应用刷新'}
          </button>
          <button type="button" className="ghost" onClick={downloadAll} disabled={pageLoading}>
            一键下载
          </button>
        </div>
      </header>
      {downloadMessage && <div className="import-summary" role="status" aria-live="polite">{downloadMessage}</div>}

      <section className="errors-filter-panel" aria-label="报错信息筛选">
        <label className="errors-filter-field">
          <span>数据来源</span>
          <select value={selectedSource} onChange={(event) => selectSource(event.target.value)}>
            {ERROR_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}（{formatNumber(sourceIssueCount(option.value))}）
              </option>
            ))}
          </select>
        </label>
        <label className="errors-filter-field">
          <span>异常类型</span>
          <select value={selectedErrorType} onChange={(event) => setSelectedErrorType(event.target.value)}>
            {errorTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}（{formatNumber(checks[selectedSource]?.[option.value]?.length || 0)}）
              </option>
            ))}
          </select>
        </label>
        <div className="errors-filter-summary">
          当前展示 <strong>{formatNumber(selectedRows.length)}</strong> 条异常，表格每页 20 条
        </div>
      </section>

      {selectedSource === 'closed' && <CheckGroup
        source="closed"
        title="根据关账库存事实表"
        description="数量取关账库存事实表有库存的物料和仓库。"
        result={checks.closed}
        activeIssue={selectedErrorType}
        onDownload={downloadSingle}
      />}
      {selectedSource === 'detail' && <CheckGroup
        source="detail"
        title="根据库存分析月份表"
        description="数量取库存分析月份表的合计库存数量；结算价、销售产品线、销售系列通过物料编码匹配商品分类维表；事业部按使用组织 + 结库 + 物料编码匹配仓库物料事业部对照表。"
        result={checks.detail}
        activeIssue={selectedErrorType}
        onDownload={downloadSingle}
      />}
      {selectedSource === 'sales' && <SalesCheckGroup result={checks.sales} activeIssue={selectedErrorType} onDownload={downloadSingle} />}
      {selectedSource === 'trend' && <TrendCheckGroup result={checks.trend} activeIssue={selectedErrorType} onDownload={downloadSingle} />}
      {selectedSource === 'age' && <AgeAnalysisCheckGroup result={checks.age} activeIssue={selectedErrorType} onDownload={downloadSingle} />}
      {selectedSource === 'inventorySummary' && <SummaryReportCheckGroup
        source="inventorySummary"
        title="根据库存汇总报表"
        result={checks.inventorySummary}
        activeIssue={selectedErrorType}
        onDownload={downloadSingle}
      />}
      {selectedSource === 'salesSummary' && <SummaryReportCheckGroup
        source="salesSummary"
        title="根据销售汇总报表"
        result={checks.salesSummary}
        activeIssue={selectedErrorType}
        onDownload={downloadSingle}
      />}
    </section>
  );
}

function CheckGroup({ source, title, description, result, activeIssue, onDownload }) {
  return (
    <section className="error-source-panel">
      <section className="error-source-title">
        <h2>{title}</h2>
        <p>{result.message || description}</p>
      </section>

      <section className="metric-grid error-metrics">
        <MetricCard label="有库存物料数" value={stockMaterialCount(result)} />
        <MetricCard label="商品分类缺失" value={result.productMissing.length} />
        <MetricCard label="事业部对照缺失" value={result.divisionMissing.length} />
        <MetricCard label="仓库对照缺失" value={result.warehouseMissing.length} />
        <MetricCard label="结算价缺失" value={result.settlementMissing.length} />
      </section>

      {activeIssue === 'productMissing' && <ErrorTable
        title="有库存商品维度表没有信息"
        columns={[
          ['materialCode', '物料编码'],
          ['sku', 'SKU'],
          ['materialName', '物料名称'],
          ['qty', '数量', 'num']
        ]}
        rows={result.productMissing}
        diagnostic={[
          '来源：事实表按物料编码汇总有库存数量。',
          '比对：商品分类维表 A 列物料编码。',
          '缺失提示：事实表有库存物料编码在商品分类维表没有信息。',
          '需要维护：维度表文件库的商品分类维表。'
        ]}
        onDownload={() => onDownload(source, 'productMissing')}
      />}
      {activeIssue === 'divisionMissing' && <ErrorTable
        title="有库存仓库物料事业部对照表没有信息"
        columns={[
          ['organization', '库存组织'],
          ['warehouse', '仓库名称'],
          ['materialCode', '物料编码'],
          ['sku', 'SKU'],
          ['materialName', '物料名称'],
          ['qty', '数量', 'num']
        ]}
        rows={result.divisionMissing}
        diagnostic={[
          '来源：事实表按库存组织 + 仓库名称 + 物料编码汇总有库存数量。',
          '比对：仓库物料事业部对照表的物料编码或三元组合匹配键。',
          '缺失提示：有库存记录在仓库物料事业部对照表没有信息。',
          '需要维护：维度表文件库的仓库物料事业部对照表。'
        ]}
        onDownload={() => onDownload(source, 'divisionMissing')}
      />}
      {activeIssue === 'warehouseMissing' && <ErrorTable
        title="有库存仓库没有信息"
        columns={[
          ['warehouse', '仓库'],
          ['qty', '数量', 'num']
        ]}
        rows={result.warehouseMissing}
        diagnostic={[
          '来源：事实表按有库存仓库汇总数量。',
          '比对：仓库维表中的仓库名称。',
          '缺失提示：事实表有库存仓库在仓库维表没有信息。',
          '需要维护：维度表文件库的仓库维表。'
        ]}
        onDownload={() => onDownload(source, 'warehouseMissing')}
      />}
      {activeIssue === 'settlementMissing' && <ErrorTable
        title="有库存没有结算价（含税）的物料"
        columns={[
          ['materialCode', '物料编码'],
          ['materialName', '物料名称'],
          ['productLine', '销售产品线'],
          ['qty', '数量', 'num']
        ]}
        rows={result.settlementMissing}
        diagnostic={[
          '来源：事实表取有库存物料编码和数量。',
          '比对：商品分类维表物料编码对应的结算价（含税）。',
          '缺失提示：销售成品有库存，但商品分类维表结算价（含税）为空或为 0。',
          '需要维护：维度表文件库的商品分类维表结算价（含税）。'
        ]}
        onDownload={() => onDownload(source, 'settlementMissing')}
      />}
    </section>
  );
}

function SalesCheckGroup({ result, activeIssue, onDownload }) {
  return (
    <section className="error-source-panel">
      <section className="error-source-title">
        <h2>根据销售数据文件</h2>
        <p>{result.message || '按销售数据文件中的物料编码、客户名称，检查商品分类维表、客户与物料对照表、店铺名称汇总是否缺失映射。'}</p>
      </section>

      <section className="metric-grid error-metrics sales-error-metrics">
        <MetricCard label="销售记录数" value={salesRowCount(result)} />
        <MetricCard label="销售物料数" value={stockMaterialCount(result)} />
        <MetricCard label="商品分类缺失" value={result.productMissing.length} />
        <MetricCard label="客户物料缺失" value={result.customerMaterialMissing.length} />
        <MetricCard label="店铺名称缺失" value={result.storeMissing.length} />
      </section>

      {activeIssue === 'productMissing' && <ErrorTable
        title="销售数据商品维度表没有信息"
        columns={[
          ['materialCode', '物料编码'],
          ['sku', 'SKU'],
          ['materialName', '物料名称'],
          ['qty', '数量', 'num']
        ]}
        rows={result.productMissing}
        diagnostic={[
          '来源：销售数据文件的物料编码，按销售数量汇总。',
          '比对：商品分类维表 A 列物料编码。',
          '缺失提示：销售数据文件有销售物料编码在商品分类维表没有信息。',
          '需要维护：维度表文件库的商品分类维表。'
        ]}
        onDownload={() => onDownload('sales', 'productMissing')}
      />}
      {activeIssue === 'customerMaterialMissing' && <ErrorTable
        title="销售数据客户与物料对照表没有信息"
        columns={[
          ['salesDepartment', '销售部门名称'],
          ['customer', '客户/店铺'],
          ['materialCode', '物料编码'],
          ['sku', 'SKU'],
          ['materialName', '物料名称'],
          ['qty', '数量', 'num']
        ]}
        rows={result.customerMaterialMissing}
        diagnostic={[
          '来源：销售数据文件销售部门名称、客户名称 + 物料编码组合。',
          '比对：客户与物料对照表维护的客户物料匹配关系。',
          '缺失提示：销售数据文件存在客户和物料组合，但客户与物料对照表没有信息。',
          '需要维护：维度表文件库的客户与物料对照表。'
        ]}
        onDownload={() => onDownload('sales', 'customerMaterialMissing')}
      />}
      {activeIssue === 'storeMissing' && <ErrorTable
        title="销售数据店铺名称汇总没有信息"
        columns={[
          ['store', '客户名称'],
          ['qty', '数量', 'num']
        ]}
        rows={result.storeMissing}
        diagnostic={salesStoreDiagnosticLines(result.storeDiagnostic)}
        onDownload={() => onDownload('sales', 'storeMissing')}
      />}
    </section>
  );
}

function TrendCheckGroup({ result, activeIssue, onDownload }) {
  return (
    <section className="error-source-panel">
      <section className="error-source-title">
        <h2>根据库存趋势事实表</h2>
        <p>按月份检查库存组织、仓库名称和物料编码是否能匹配有库存仓库物料事业部对照表。</p>
      </section>
      <section className="metric-grid error-metrics">
        <MetricCard label="事业部对照缺失" value={result.trendDivisionMissing.length} />
      </section>
      {activeIssue === 'trendDivisionMissing' && <ErrorTable
        title="有库存仓库物料事业部对照表没有信息"
        columns={ERROR_DOWNLOAD_CONFIG.trendDivisionMissing.columns.map(([key, label]) => [key, label, key === 'qty' ? 'num' : ''])}
        rows={result.trendDivisionMissing}
        diagnostic={[
          '来源：库存趋势事实表中有库存数量的记录。',
          '比对：库存组织 + 仓库名称 + 物料编码匹配有库存仓库物料事业部对照表。',
          '缺失提示：无法匹配的记录会在库存趋势中显示为“未匹配事业部”。',
          '需要维护：维度表文件库中的有库存仓库物料事业部对照表。'
        ]}
        onDownload={() => onDownload('trend', 'trendDivisionMissing')}
      />}
    </section>
  );
}

function AgeAnalysisCheckGroup({ result, activeIssue, onDownload }) {
  return (
    <section className="error-source-panel">
      <section className="error-source-title">
        <h2>根据库龄维度分析</h2>
        <p>{result.message || '按所有库龄月份检查库存组织、仓库名称和物料编码是否能匹配有库存仓库物料事业部对照表。'}</p>
      </section>
      <section className="metric-grid error-metrics">
        <MetricCard label="事业部对照缺失" value={result.ageDivisionMissing.length} />
      </section>
      {activeIssue === 'ageDivisionMissing' && <ErrorTable
        title="有库存仓库物料事业部对照表没有信息"
        columns={ERROR_DOWNLOAD_CONFIG.ageDivisionMissing.columns.map(([key, label]) => [key, label, key === 'qty' ? 'num' : ''])}
        rows={result.ageDivisionMissing}
        diagnostic={[
          '来源：库龄维度分析全部月份中有库存数量的记录。',
          '比对：库存组织 + 仓库名称 + 物料编码匹配有库存仓库物料事业部对照表。',
          '缺失提示：下方记录就是库龄维度分析中显示为“未匹配事业部”的数据。',
          '需要维护：维度表文件库中的有库存仓库物料事业部对照表。'
        ]}
        onDownload={() => onDownload('age', 'ageDivisionMissing')}
      />}
    </section>
  );
}

function SummaryReportCheckGroup({ source, title, result, activeIssue, onDownload }) {
  const issueOptions = ERROR_TYPE_OPTIONS[source] || [];
  const selectedOption = issueOptions.find((option) => option.value === activeIssue);
  const downloadConfig = ERROR_DOWNLOAD_CONFIG[activeIssue];
  const diagnostics = source === 'inventorySummary'
    ? [
        '来源：库存汇总报表使用的在库、在途和采购订单未交付记录。',
        '检查：沿用库存汇总报表的物料编码、仓库、库存组织和采购订单字段映射结果。',
        '缺失提示：报表中显示为未匹配产品线、SKU、金蝶名称、事业部、库存所在地或供应商的记录。',
        '需要维护：对应的商品分类维表、仓库维表、仓库物料事业部对照表或采购订单文件。'
      ]
    : [
        '来源：销售汇总报表使用的有效销售记录。',
        '检查：沿用销售汇总报表按客户名称 + 物料编码匹配事业部、按客户名称匹配店铺简称、按物料编码匹配商品维度的结果。',
        '缺失提示：报表中显示为未匹配事业部、渠道、产品线、SKU或金蝶名称的记录。',
        '需要维护：客户与物料对照表、店铺名称汇总维表或商品分类维表。'
      ];

  return (
    <section className="error-source-panel">
      <section className="error-source-title">
        <h2>{title}</h2>
        <p>{diagnostics[1]}</p>
      </section>
      <section className="metric-grid error-metrics">
        <MetricCard label="检查记录数" value={result.rowCount || 0} />
        {issueOptions.map((option) => (
          <MetricCard key={option.value} label={option.label} value={result[option.value]?.length || 0} />
        ))}
      </section>
      {selectedOption && downloadConfig && <ErrorTable
        title={selectedOption.label}
        columns={downloadConfig.columns.map(([key, label]) => [key, label, ['qty', 'amount'].includes(key) ? 'num' : ''])}
        rows={result[activeIssue] || []}
        diagnostic={diagnostics}
        onDownload={() => onDownload(source, activeIssue)}
      />}
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function ErrorTable({ title, rows, columns, diagnostic, onDownload }) {
  const pagination = useTablePagination(rows);
  return (
    <section className="error-section">
      <div className="table-title-row">
        <div className="table-title">{title}</div>
        <button className="ghost compact-button" type="button" onClick={onDownload}>下载</button>
      </div>
      <div className="diagnostic-panel show">
        {diagnostic.map((line) => <span key={line}>{line}</span>)}
      </div>
      <div className="table-panel error-table-panel">
        <table>
          <thead>
            <tr>
              {columns.map(([, label]) => <th key={label}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.length ? pagination.pageRows.map((row, index) => (
              <tr key={`${title}-${(pagination.page - 1) * pagination.pageSize + index}`}>
                {columns.map(([key, , className]) => (
                  <td key={key} className={className || ''}>{className === 'num' ? formatNumber(row[key]) : row[key]}</td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="empty">暂无缺失数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalPages={pagination.totalPages}
        totalRows={pagination.totalRows}
        onPageChange={pagination.setPage}
      />
    </section>
  );
}

function emptyErrorResult(message = '') {
  return {
    message,
    stockMaterialCount: 0,
    stockMaterials: [],
    productMissing: [],
    divisionMissing: [],
    warehouseMissing: [],
    settlementMissing: []
  };
}

function emptySalesErrorResult(message = '') {
  return {
    ...emptyErrorResult(message),
    salesRowCount: 0,
    salesRows: [],
    customerMaterialMissing: [],
    storeMissing: []
  };
}

function emptyTrendErrorResult() {
  return { trendDivisionMissing: [] };
}

function emptyAgeErrorResult(message = '') {
  return { message, ageDivisionMissing: [] };
}

function emptySummaryErrorResult(message = '') {
  return {
    message,
    rowCount: 0,
    inventorySummaryProductMissing: [],
    inventorySummaryDepartmentMissing: [],
    inventorySummaryWarehouseMissing: [],
    inventorySummarySupplierMissing: []
  };
}

function normalizeServerErrorResult(payload) {
  return {
    ...emptyErrorResult(payload?.message || ''),
    ...(payload || {}),
    stockMaterialCount: Number(payload?.stockMaterialCount) || payload?.stockMaterials?.length || 0,
    productMissing: Array.isArray(payload?.productMissing) ? payload.productMissing : [],
    divisionMissing: Array.isArray(payload?.divisionMissing) ? payload.divisionMissing : [],
    warehouseMissing: Array.isArray(payload?.warehouseMissing) ? payload.warehouseMissing : [],
    settlementMissing: Array.isArray(payload?.settlementMissing) ? payload.settlementMissing : []
  };
}

function normalizeServerSalesErrorResult(payload) {
  return {
    ...normalizeServerErrorResult(payload),
    salesRowCount: Number(payload?.salesRowCount) || payload?.salesRows?.length || 0,
    salesRows: [],
    customerMaterialMissing: Array.isArray(payload?.customerMaterialMissing) ? payload.customerMaterialMissing : [],
    storeMissing: Array.isArray(payload?.storeMissing) ? payload.storeMissing : []
  };
}

function stockMaterialCount(result) {
  return Number(result?.stockMaterialCount) || result?.stockMaterials?.length || 0;
}

function salesRowCount(result) {
  return Number(result?.salesRowCount) || result?.salesRows?.length || 0;
}

function emptySalesSummaryErrorResult(message = '') {
  return {
    message,
    rowCount: 0,
    salesSummaryProductMissing: [],
    salesSummaryDepartmentMissing: [],
    salesSummaryChannelMissing: []
  };
}

function buildSummaryReportChecks(payload, type) {
  if (!payload) return type === 'inventory' ? emptySummaryErrorResult() : emptySalesSummaryErrorResult();
  if (type === 'inventory') {
    return {
      ...emptySummaryErrorResult(),
      rowCount: Number(payload.rowCount) || 0,
      inventorySummaryProductMissing: Array.isArray(payload.productMissing) ? payload.productMissing : [],
      inventorySummaryDepartmentMissing: Array.isArray(payload.departmentMissing) ? payload.departmentMissing : [],
      inventorySummaryWarehouseMissing: Array.isArray(payload.warehouseMissing) ? payload.warehouseMissing : [],
      inventorySummarySupplierMissing: Array.isArray(payload.supplierMissing) ? payload.supplierMissing : []
    };
  }
  return {
    ...emptySalesSummaryErrorResult(),
    rowCount: Number(payload.rowCount) || 0,
    salesSummaryProductMissing: Array.isArray(payload.productMissing) ? payload.productMissing : [],
    salesSummaryDepartmentMissing: Array.isArray(payload.departmentMissing) ? payload.departmentMissing : [],
    salesSummaryChannelMissing: Array.isArray(payload.channelMissing) ? payload.channelMissing : []
  };
}

function buildAgeAnalysisChecks(summary) {
  if (!summary?.ok) return emptyAgeErrorResult(summary?.message || '库龄维度分析：汇总尚未生成完成');
  return {
    message: '',
    ageDivisionMissing: Array.isArray(summary.rows) ? summary.rows : []
  };
}

function buildTrendChecks(summary) {
  const grouped = new Map();
  for (const monthSummary of summary?.monthSummaries || []) {
    const missingRows = monthSummary?.departmentMissingRows
      || (monthSummary?.unclassifiedRows || []).filter((row) => !normalizeText(row.department));
    for (const row of missingRows) {
      const month = normalizeText(row.month || monthSummary.label);
      const organization = normalizeText(row.organization || row.materialA);
      const warehouse = normalizeText(row.warehouse);
      const materialCode = normalizeMaterialCode(row.materialCode);
      const sku = normalizeText(row.sku);
      const materialName = normalizeText(row.materialName);
      const key = [month, organization, warehouse, materialCode].map(normalizeKey).join('|');
      if (!grouped.has(key)) {
        grouped.set(key, {
          month,
          organization,
          warehouse,
          materialCode,
          sku,
          materialName,
          qty: 0,
          reason: '有库存仓库物料事业部对照表没有信息'
        });
      }
      const item = grouped.get(key);
      item.qty += Number(row.qty) || 0;
      if (!item.sku) item.sku = sku;
      if (!item.materialName) item.materialName = materialName;
    }
  }
  return {
    trendDivisionMissing: [...grouped.values()].sort((a, b) => monthNumber(a.month) - monthNumber(b.month)
      || b.qty - a.qty
      || a.organization.localeCompare(b.organization, 'zh-CN')
      || a.warehouse.localeCompare(b.warehouse, 'zh-CN')
      || a.materialCode.localeCompare(b.materialCode, 'zh-CN'))
  };
}

function monthNumber(value) {
  return Number.parseInt(String(value || ''), 10) || 0;
}

function buildDimensionMaps(records) {
  const productMap = mapProduct(records['dim-product']?.rows || []);
  const divisionRows = records['dim-warehouse-material']?.rows || [];
  const warehouseRows = records['dim-warehouse']?.rows || [];
  const customerMaterialRows = records['dim-store-name']?.rows || [];
  const storeRecord = records['dim-customer-material'];
  const storeRows = storeRecord?.rows || [];
  const storeNameMap = mapStoreNames(storeRows);
  return {
    productMap,
    divisionMaterialCodes: mapDivisionMaterialCodes(divisionRows),
    divisionDepartmentKeys: mapDivisionDepartmentKeys(divisionRows),
    divisionWarehouses: mapDivisionWarehouses(divisionRows),
    warehouseNames: mapWarehouseNames(warehouseRows),
    customerMaterialKeys: mapCustomerMaterialKeys(customerMaterialRows),
    storeNames: new Set(storeNameMap.keys()),
    storeNameSamples: [...storeNameMap.values()].slice(0, 8),
    storeSummaryValid: isStoreSummaryRecordValid(storeRecord),
    storeSummaryRecord: storeRecord
  };
}

function isStoreSummaryRecordValid(record) {
  return isStoreMappingRecordValid(record);
}

function buildClosedInventoryChecks(records, maps) {
  const fact = records['fact-inventory'];
  if (!fact) return emptyErrorResult('关账库存事实表：未引用');
  if (!records['dim-product']) return emptyErrorResult('关账库存事实表：缺少商品分类维表');
  if (!records['dim-warehouse-material']) return emptyErrorResult('关账库存事实表：缺少仓库物料事业部对照表');

  const stockMaterials = summarizeClosedStockMaterials(fact.rows || []);
  const stockWarehouses = summarizeClosedStockWarehouses(fact.rows || []);
  const productMissing = stockMaterials.filter((item) => !maps.productMap.has(item.materialCode));
  const divisionMissing = summarizeClosedDivisionMissing(fact.rows || [], maps.divisionMaterialCodes, maps.productMap);
  const warehouseSet = maps.warehouseNames.size ? maps.warehouseNames : maps.divisionWarehouses;
  const warehouseMissing = stockWarehouses.filter((item) => !warehouseSet.has(item.warehouse));
  const settlementMissing = stockMaterials.filter((item) => {
    const product = maps.productMap.get(item.materialCode);
    return product && isSalesFinishedProduct(product) && product.settlementPrice <= 0;
  });

  return {
    stockMaterials,
    productMissing: productMissing.map((item) => enrichMissingRow(item, maps.productMap)),
    divisionMissing,
    warehouseMissing,
    settlementMissing: settlementMissing.map((item) => enrichMissingRow(item, maps.productMap))
  };
}

function buildInventoryMonthChecks(records, maps) {
  const detail = records['fact-2'];
  if (!detail) return emptyErrorResult('库存分析月份表：未引用');
  if (!records['dim-product']) return emptyErrorResult('库存分析月份表：缺少商品分类维表');
  if (!records['dim-warehouse-material']) return emptyErrorResult('库存分析月份表：缺少仓库物料事业部对照表');

  const rows = detail.rows || [];
  const stockMaterials = summarizeDetailStockMaterials(rows);
  const stockWarehouses = summarizeDetailStockWarehouses(rows);
  const productMissing = stockMaterials.filter((item) => !maps.productMap.has(item.materialCode));
  const divisionMissing = summarizeDetailDivisionMissing(rows, maps.divisionDepartmentKeys, maps.productMap);
  const warehouseMissing = maps.warehouseNames.size
    ? stockWarehouses.filter((item) => !maps.warehouseNames.has(item.warehouse))
    : [];
  const settlementMissing = stockMaterials.filter((item) => {
    const product = maps.productMap.get(item.materialCode);
    return product && isSalesFinishedProduct(product) && product.settlementPrice <= 0;
  });

  return {
    stockMaterials,
    productMissing: productMissing.map((item) => enrichMissingRow(item, maps.productMap)),
    divisionMissing,
    warehouseMissing,
    settlementMissing: settlementMissing.map((item) => enrichMissingRow(item, maps.productMap))
  };
}

function buildSalesDataChecks(records, maps) {
  const sales = records['sales-data'];
  if (!sales) return emptySalesErrorResult('销售数据文件：未引用');

  const rows = (sales.rows || []).filter((row) => getSalesMaterialCode(row) || getSalesStoreName(row) || getSalesStoreNameForStoreSummary(row) || getSalesCustomerName(row));
  const salesStoreValues = collectSalesStoreValues(rows);
  const stockMaterials = summarizeSalesMaterials(rows);
  const productMissing = stockMaterials.filter((item) => !maps.productMap.has(item.materialCode));
  const customerMaterialMissing = summarizeSalesCustomerMaterialMissing(rows, maps.customerMaterialKeys, maps.productMap);
  const storeMissing = maps.storeSummaryValid ? summarizeSalesStoreMissing(rows, maps.storeNames) : [];

  return {
    ...emptySalesErrorResult(),
    salesRows: rows,
    stockMaterials,
    productMissing: productMissing.map((item) => enrichMissingRow(item, maps.productMap)),
    customerMaterialMissing,
    storeMissing,
    storeDiagnostic: buildSalesStoreDiagnostic(salesStoreValues, maps.storeNames, maps.storeNameSamples, maps.storeSummaryValid, maps.storeSummaryRecord)
  };
}

function collectSalesStoreValues(rows) {
  const map = new Map();
  for (const row of rows) {
    const store = getSalesStoreNameForStoreSummary(row);
    const normalized = normalizeStoreName(store);
    if (!store || !normalized) continue;
    if (!map.has(normalized)) map.set(normalized, { raw: store, normalized, qty: 0 });
    map.get(normalized).qty += getSalesReceivableQty(row);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.raw.localeCompare(b.raw, 'zh-CN'));
}

function buildSalesStoreDiagnostic(salesStoreValues, storeNames, storeNameSamples = [], storeSummaryValid = true, storeSummaryRecord = null) {
  const hitCount = salesStoreValues.filter((item) => storeNames.has(item.normalized)).length;
  const missingCount = salesStoreValues.length - hitCount;
  return {
    salesCount: salesStoreValues.length,
    dimCount: storeNames.size,
    hitCount,
    missingCount,
    salesSamples: salesStoreValues.slice(0, 8).map((item) => item.raw),
    dimSamples: storeNameSamples,
    storeSummaryValid,
    storeSheetName: storeRecordSheetName(storeSummaryRecord),
    storeHeaderB: storeSummaryRecord?.headers?.[1] || storeSummaryRecord?.parseDiagnostics?.headerFirst12?.[1] || ''
  };
}

function storeRecordSheetName(record) {
  return record?.sheetName || record?.parseDiagnostics?.sheetName || '';
}

function salesStoreDiagnosticLines(diagnostic = {}) {
  const lines = [
    '客户名称来源：销售数据文件 B 列（客户名称）',
    '数量来源：销售数据文件 I 列（应收数量）',
    '比对维表：月度维度表文件库 - 店铺名称汇总（金蝶&领星&简称）',
    '比对列：店铺名称汇总表 B 列（金蝶名称）',
    '缺失提示：销售数据文件 B 列客户名称有、维表 B 列金蝶名称没有的信息会列在下方',
    `销售客户数：${formatNumber(diagnostic.salesCount || 0)}；维表名称数：${formatNumber(diagnostic.dimCount || 0)}；命中：${formatNumber(diagnostic.hitCount || 0)}；缺失：${formatNumber(diagnostic.missingCount || 0)}`
  ];
  if (diagnostic.storeSummaryValid === false) {
    lines.push(`当前店铺名称汇总文件引用的 sheet 是「${diagnostic.storeSheetName || '-'}」，B列表头是「${diagnostic.storeHeaderB || '-'}」。请在维度表文件库重新上传或重新应用店铺名称汇总文件后再检查。`);
  }
  return lines;
}

function summarizeClosedStockMaterials(rows) {
  return summarizeByMaterial(rows, getClosedMaterialCode, getClosedMaterialName, getClosedStockQty);
}

function summarizeDetailStockMaterials(rows) {
  return summarizeByMaterial(rows, getDetailMaterialCode, getDetailMaterialName, getDetailStockQty);
}

function summarizeSalesMaterials(rows) {
  return summarizeByMaterial(rows, getSalesMaterialCode, getSalesMaterialName, getSalesReceivableQty);
}

function summarizeByMaterial(rows, materialGetter, nameGetter, qtyGetter) {
  const map = new Map();
  for (const row of rows) {
    const materialCode = materialGetter(row);
    if (!materialCode) continue;
    const qty = qtyGetter(row);
    if (qty <= 0) continue;
    if (!map.has(materialCode)) {
      map.set(materialCode, {
        materialCode,
        sku: normalizeText(firstValue(row, ['SKU'])),
        materialName: nameGetter(row),
        qty: 0
      });
    }
    const item = map.get(materialCode);
    item.qty += qty;
    if (!item.sku) item.sku = normalizeText(firstValue(row, ['SKU']));
    if (!item.materialName) item.materialName = nameGetter(row);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.materialCode.localeCompare(b.materialCode, 'zh-CN'));
}

function summarizeClosedStockWarehouses(rows) {
  return summarizeByWarehouse(rows, getClosedWarehouse, getClosedStockQty);
}

function summarizeDetailStockWarehouses(rows) {
  return summarizeByWarehouse(rows, getDetailWarehouse, getDetailStockQty);
}

function summarizeByWarehouse(rows, warehouseGetter, qtyGetter) {
  const map = new Map();
  for (const row of rows) {
    const warehouse = warehouseGetter(row);
    if (!warehouse) continue;
    const qty = qtyGetter(row);
    if (qty <= 0) continue;
    map.set(warehouse, (map.get(warehouse) || 0) + qty);
  }
  return [...map.entries()]
    .map(([warehouse, qty]) => ({ warehouse, qty }))
    .sort((a, b) => b.qty - a.qty || a.warehouse.localeCompare(b.warehouse, 'zh-CN'));
}

function summarizeDetailDivisionMissing(rows, departmentKeys, productMap) {
  return summarizeDivisionMissing(rows, productMap, {
    qtyGetter: getDetailStockQty,
    materialGetter: getDetailMaterialCode,
    materialNameGetter: getDetailMaterialName,
    organizationGetter: getDetailOrganization,
    warehouseGetter: getDetailWarehouse,
    isMissing: (row) => !departmentKeys.has(makeDetailDepartmentKey(row))
  });
}

function summarizeClosedDivisionMissing(rows, divisionMaterialCodes, productMap) {
  return summarizeDivisionMissing(rows, productMap, {
    qtyGetter: getClosedStockQty,
    materialGetter: getClosedMaterialCode,
    materialNameGetter: getClosedMaterialName,
    organizationGetter: getClosedOrganization,
    warehouseGetter: getClosedWarehouse,
    isMissing: (row, materialCode) => !divisionMaterialCodes.has(materialCode)
  });
}

function summarizeDivisionMissing(rows, productMap, config) {
  const map = new Map();
  for (const row of rows) {
    const qty = config.qtyGetter(row);
    if (qty <= 0) continue;
    const materialCode = config.materialGetter(row);
    if (!materialCode) continue;
    if (!config.isMissing(row, materialCode)) continue;
    const organization = config.organizationGetter(row);
    const warehouse = config.warehouseGetter(row);
    const mapKey = `${normalizeKey(organization)}|${normalizeKey(warehouse)}|${materialCode}`;
    if (!map.has(mapKey)) {
      map.set(mapKey, {
        organization,
        warehouse,
        materialCode,
        sku: normalizeText(firstValue(row, ['SKU'])),
        materialName: config.materialNameGetter(row),
        qty: 0
      });
    }
    const item = map.get(mapKey);
    item.qty += qty;
    if (!item.materialName) item.materialName = config.materialNameGetter(row);
  }
  return [...map.values()]
    .map((item) => enrichMissingRow(item, productMap))
    .sort((a, b) => b.qty - a.qty
      || a.organization.localeCompare(b.organization, 'zh-CN')
      || a.warehouse.localeCompare(b.warehouse, 'zh-CN')
      || a.materialCode.localeCompare(b.materialCode, 'zh-CN'));
}

function summarizeSalesCustomerMaterialMissing(rows, customerMaterialKeys, productMap) {
  const map = new Map();
  for (const row of rows) {
    const materialCode = getSalesMaterialCode(row);
    const customer = getSalesCustomerName(row) || getSalesStoreName(row);
    if (!materialCode || !customer) continue;
    const key = makeCustomerMaterialKey(customer, materialCode);
    if (customerMaterialKeys.has(key)) continue;
    const mapKey = `${normalizeStoreName(customer)}|${materialCode}`;
    if (!map.has(mapKey)) {
      map.set(mapKey, {
        salesDepartment: getSalesDepartmentName(row),
        customer,
        materialCode,
        sku: normalizeText(firstValue(row, ['SKU'])),
        materialName: getSalesMaterialName(row),
        qty: 0
      });
    }
    const item = map.get(mapKey);
    item.qty += getSalesReceivableQty(row);
    if (!item.salesDepartment) item.salesDepartment = getSalesDepartmentName(row);
    if (!item.materialName) item.materialName = getSalesMaterialName(row);
  }
  return [...map.values()]
    .map((item) => enrichSalesCustomerRow(item, productMap))
    .sort((a, b) => b.qty - a.qty || a.customer.localeCompare(b.customer, 'zh-CN') || a.materialCode.localeCompare(b.materialCode, 'zh-CN'));
}

function summarizeSalesStoreMissing(rows, storeNames) {
  const map = new Map();
  for (const row of rows) {
    const store = getSalesStoreNameForStoreSummary(row);
    if (!store) continue;
    const normalized = normalizeStoreName(store);
    if (storeNames.has(normalized)) continue;
    if (!map.has(normalized)) map.set(normalized, { store, normalized, qty: 0 });
    map.get(normalized).qty += getSalesReceivableQty(row);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || a.store.localeCompare(b.store, 'zh-CN'));
}

function mapProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    const materialCode = normalizeMaterialCode(firstText([
      firstValue(row, ['物料编码']),
      nthValue(row, 1)
    ]));
    if (!materialCode || map.has(materialCode)) continue;
    map.set(materialCode, {
      sku: normalizeText(firstText([firstValue(row, ['SKU']), nthValue(row, 3)])),
      materialName: normalizeText(firstText([firstValue(row, ['金蝶名称', '物料名称', '货品名称']), nthValue(row, 4)])),
      productLine: normalizeText(firstText([firstValue(row, ['销售产品线', '产品线']), nthValue(row, 7)])),
      materialGroup: normalizeText(firstValue(row, ['物料分组'])),
      category1: normalizeText(firstValue(row, ['一级品类'])),
      productStatus: normalizeText(firstValue(row, ['产品状态（Dim）', '产品状态'])),
      settlementPrice: firstNumber([
        firstValue(row, ['结算价（含税）', '结算价(含税)', '结算价含税', '结算价', '内部结算价', '26年内部结算价', '2026年内部结算价']),
        firstValueByHeaderIncludes(row, ['结算价']),
        nthValue(row, 9)
      ])
    });
  }
  return map;
}

function isSalesFinishedProduct(product) {
  const productLine = normalizeText(product.productLine);
  if (!productLine) return false;
  if (['其他/配件', '配件', '售后配件', '健康办公'].includes(productLine)) return false;
  if (productLine.includes('配件') && !productLine.includes('成品')) return false;
  return true;
}

function mapDivisionMaterialCodes(rows) {
  const set = new Set();
  for (const row of rows) {
    const materialCode = normalizeMaterialCode(firstText([
      firstValue(row, ['物料编码']),
      nthValue(row, 3)
    ]));
    if (materialCode) set.add(materialCode);
  }
  return set;
}

function mapDivisionDepartmentKeys(rows) {
  const set = new Set();
  for (const row of rows) {
    const key = normalizeDepartmentKey(firstText([
      firstValue(row, ['F列', '匹配键', '三元组合', '三元联合键']),
      nthValue(row, 6),
      [
        firstValue(row, ['使用组织', '库存组织', '组织']),
        firstValue(row, ['仓库名称', '仓库', '金蝶仓库', '库存仓库']),
        firstValue(row, ['物料编码'])
      ].join('')
    ]));
    if (key) set.add(key);
  }
  return set;
}

function mapDivisionWarehouses(rows) {
  const set = new Set();
  for (const row of rows) {
    const warehouse = normalizeText(firstText([
      firstValue(row, ['仓库', '仓库名称', '金蝶名称']),
      nthValue(row, 2)
    ]));
    if (warehouse) set.add(warehouse);
  }
  return set;
}

function mapWarehouseNames(rows) {
  const set = new Set();
  for (const row of rows) {
    const warehouse = normalizeText(firstText([
      firstValue(row, ['仓库金蝶名称', '仓库名称', '金蝶名称', '仓库']),
      nthValue(row, 2)
    ]));
    if (warehouse) set.add(warehouse);
  }
  return set;
}

function mapCustomerMaterialKeys(rows) {
  const set = new Set();
  for (const row of rows) {
    const materialCode = normalizeMaterialCode(firstText([
      firstValue(row, ['物料编码', '货品编码', '商品编码', 'SKU']),
      nthValue(row, 2),
      nthValue(row, 3)
    ]));
    const customer = normalizeText(firstText([
      firstValue(row, ['客户', '客户名称', '渠道', '店铺', '店铺名称', '店铺简称', '简称', '金蝶客户', '领星客户']),
      nthValue(row, 1)
    ]));
    const explicitKey = normalizeCustomerMaterialKey(firstText([
      firstValue(row, ['匹配键', '客户物料键', '客户物料匹配键', '客户+物料', '店铺物料键'])
    ]));
    if (explicitKey) set.add(explicitKey);
    if (materialCode && customer) set.add(makeCustomerMaterialKey(customer, materialCode));
  }
  return set;
}

function mapStoreNames(rows) {
  const map = new Map();
  for (const row of rows) {
    const candidates = [
      firstValue(row, STORE_MAPPING_CUSTOMER_HEADERS),
      nthValue(row, 2)
    ];
    for (const candidate of candidates) {
      const raw = normalizeText(candidate);
      const value = normalizeStoreName(raw);
      if (value && !map.has(value)) map.set(value, raw);
    }
  }
  return map;
}

function enrichMissingRow(item, productMap) {
  const product = productMap.get(item.materialCode) || {};
  return {
    organization: item.organization || '',
    warehouse: item.warehouse || '',
    materialCode: item.materialCode,
    sku: item.sku || product.sku || '',
    materialName: item.materialName || product.materialName || '',
    productLine: product.productLine || '',
    qty: item.qty
  };
}

function enrichSalesCustomerRow(item, productMap) {
  const product = productMap.get(item.materialCode) || {};
  return {
    salesDepartment: item.salesDepartment || '',
    customer: item.customer,
    materialCode: item.materialCode,
    sku: item.sku || product.sku || '',
    materialName: item.materialName || product.materialName || '',
    qty: item.qty
  };
}

function getClosedMaterialCode(row) {
  return normalizeMaterialCode(firstValue(row, ['物料编码']));
}

function getClosedMaterialName(row) {
  return normalizeText(firstValue(row, ['物料名称', '金蝶名称', '货品名称']));
}

function getClosedWarehouse(row) {
  return normalizeText(firstValue(row, ['仓库', '仓库名称', '金蝶名称']));
}

function getClosedOrganization(row) {
  return normalizeText(firstText([
    firstValue(row, ['库存组织', '使用组织', '组织', '主体名称']),
    nthValue(row, 1)
  ]));
}

function getClosedStockQty(row) {
  return firstNumber([
    firstValue(row, ['数量', '库存数量', '结存数量', '(结存)数量（库存）', 'K-现货+在途库存']),
    nthValue(row, 7)
  ]);
}

function getDetailMaterialCode(row) {
  return normalizeMaterialCode(firstText([
    firstValue(row, ['物料编码', '货品编码', '商品编码', 'SKU']),
    nthValue(row, 1)
  ]));
}

function getDetailWarehouse(row) {
  return normalizeText(firstText([
    firstValue(row, ['仓库', '仓库名称', '金蝶仓库', '库存仓库']),
    nthValue(row, 3)
  ]));
}

function getDetailOrganization(row) {
  return normalizeText(firstText([
    firstValue(row, ['使用组织', '库存组织', '组织', '主体名称']),
    nthValue(row, 4)
  ]));
}

function getDetailMaterialName(row) {
  return normalizeText(firstValue(row, ['物料名称', '货品名称', '商品名称', '金蝶名称']));
}

function getDetailStockQty(row) {
  return firstNumber([
    firstValue(row, ['数量(库存)', '数量（库存）']),
    firstValue(row, ['合计库存数量', '合计数量', '合计', '关账结存库存']),
    firstValueByHeaderIncludes(row, ['合计', '库存', '数量']),
    firstValueByHeaderIncludes(row, ['合计', '数量']),
    firstValue(row, ['0430结存库存数量', '4月30日结余库存数量', '结余库存数量'])
  ]);
}

function getSalesMaterialCode(row) {
  return normalizeMaterialCode(firstText([
    firstValue(row, ['物料编码', '货品编码', '商品编码', '产品编码', 'SKU', 'MSKU', 'SellerSKU', '平台SKU']),
    firstValueByHeaderIncludes(row, ['物料', '编码']),
    firstValueByHeaderIncludes(row, ['商品', '编码']),
    nthValue(row, 1)
  ]));
}

function getSalesMaterialName(row) {
  return normalizeText(firstText([
    firstValue(row, ['物料名称', '货品名称', '商品名称', '产品名称', '金蝶名称', '品名']),
    firstValueByHeaderIncludes(row, ['物料', '名称']),
    firstValueByHeaderIncludes(row, ['商品', '名称'])
  ]));
}

function getSalesDepartmentName(row) {
  return normalizeText(firstText([
    firstValue(row, ['销售部门名称', '销售部门', '部门名称', '部门']),
    firstValueByHeaderIncludes(row, ['销售', '部门']),
    nthValue(row, 6)
  ]));
}

function getSalesCustomerName(row) {
  return normalizeText(firstText([
    firstValue(row, ['客户', '客户名称', '渠道', '渠道名称', '销售渠道', '买家', '买家名称']),
    firstValueByHeaderIncludes(row, ['客户']),
    firstValueByHeaderIncludes(row, ['渠道'])
  ]));
}

function getSalesStoreName(row) {
  return normalizeText(firstText([
    firstValue(row, ['店铺', '店铺名称', '店铺简称', '平台店铺', '领星店铺', '金蝶店铺', '店铺名', '简称']),
    firstValueByHeaderIncludes(row, ['店铺']),
    firstValueByHeaderIncludes(row, ['简称'])
  ]));
}

function getSalesStoreNameForStoreSummary(row) {
  return normalizeText(nthValue(row, 2));
}

function getSalesReceivableQty(row) {
  return firstNumber([
    firstValue(row, ['应收数量']),
    firstValueByHeaderIncludes(row, ['应收', '数量'])
  ]);
}

function makeDetailDepartmentKey(row) {
  return normalizeDepartmentKey([
    getDetailOrganization(row),
    getDetailWarehouse(row),
    getDetailMaterialCode(row)
  ].join(''));
}

function normalizeDepartmentKey(value) {
  return normalizeMaterialCode(value).replace(/&/g, '').toLowerCase();
}

function makeCustomerMaterialKey(customer, materialCode) {
  return normalizeCustomerMaterialKey(`${customer}${materialCode}`);
}

function normalizeCustomerMaterialKey(value) {
  return normalizeKey(value).replace(/&/g, '').toLowerCase();
}

function normalizeStoreName(value) {
  return normalizeKey(value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[&＆]/g, '')
    .replace(/[()（）【】[\]{}<>《》]/g, '')
    .replace(/[，,、；;：:\-_\s]/g, '')
    .toLowerCase();
}

function firstText(candidates) {
  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    if (text) return text;
  }
  return '';
}

function firstNumber(candidates) {
  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    const value = toNumber(candidate);
    if (value !== 0 || text === '0') return value;
  }
  return 0;
}

function totalMissingCount(result) {
  return result.productMissing.length
    + result.divisionMissing.length
    + result.warehouseMissing.length
    + result.settlementMissing.length
    + (result.customerMaterialMissing?.length || 0)
    + (result.storeMissing?.length || 0)
    + (result.trendDivisionMissing?.length || 0);
}

function summaryReportMissingCount(result) {
  return Object.entries(result || {})
    .filter(([key, value]) => key.endsWith('Missing') && Array.isArray(value))
    .reduce((total, [, rows]) => total + rows.length, 0);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function downloadTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function errorSourceLabel(source) {
  return {
    closed: '关账库存事实表',
    detail: '库存分析月份表',
    sales: '销售数据文件',
    trend: '库存趋势事实表',
    age: '库龄维度分析',
    inventorySummary: '库存汇总报表',
    salesSummary: '销售汇总报表'
  }[source] || '报错信息';
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

function normalizeHeaderName(value) {
  return normalizeText(value)
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeMaterialCode(value) {
  return normalizeText(value).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, '');
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = normalizeText(value).replace(/[,\s￥元]/g, '');
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name) && normalizeText(row[name]) !== '') {
      return row[name];
    }
  }
  const wanted = names.map(normalizeHeaderName);
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.includes(normalizeHeaderName(key)) && normalizeText(value) !== '') {
      return value;
    }
  }
  return '';
}

function firstValueByHeaderIncludes(row, includeWords, excludeWords = []) {
  const includes = includeWords.map(normalizeHeaderName).filter(Boolean);
  const excludes = excludeWords.map(normalizeHeaderName).filter(Boolean);
  for (const [key, value] of Object.entries(row || {})) {
    const header = normalizeHeaderName(key);
    const hasAllWords = includes.every((word) => header.includes(word));
    const hasExcludedWord = excludes.some((word) => header.includes(word));
    if (hasAllWords && !hasExcludedWord && normalizeText(value) !== '') {
      return value;
    }
  }
  return '';
}

function nthValue(row, oneBasedIndex) {
  const index = oneBasedIndex - 1;
  if (Array.isArray(row?.__cells)) {
    return row.__cells[index] ?? '';
  }
  return Object.entries(row || {})
    .filter(([key]) => key !== '__cells')
    .map(([, value]) => value)[index] ?? '';
}
