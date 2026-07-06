import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API, systemOwnerName } from '../constants.js';
import { KcfxPageShell, SimpleTable } from './KcfxCommon.jsx';
import { downloadKcfxRowsAsXlsx } from './kcfxExport.js';
import { formatNumber, moneyWan } from './kcfxUtils.js';

const FEEDBACK_CONFIG = {
  receipt: {
    title: '关账库存反馈信息汇总',
    endpoint: 'receipt',
    columns: [
      { key: 'createdAt', label: '提交时间' },
      { key: 'userName', label: '提交人' },
      { key: 'feedback', label: '反馈信息' },
      { key: 'feedbackScopeLabel', label: '反馈对象', render: (row) => row.rowData?.feedbackScopeLabel || (row.rowData?.feedbackScope === 'filter' ? '筛选条件' : '明细行') },
      { key: 'filterKey', label: '筛选条件主键', render: (row) => row.rowData?.filterKey || '' },
      { key: 'filterWarehouseType', label: '筛选-仓库类型', render: (row) => row.rowData?.filterWarehouseType || '' },
      { key: 'filterDepartment', label: '筛选-事业部', render: (row) => row.rowData?.filterDepartment || '' },
      { key: 'filterAgeGroup', label: '筛选-库龄', render: (row) => row.rowData?.filterAgeGroup || '' },
      { key: 'filterSaleStatus', label: '筛选-可售状态', render: (row) => row.rowData?.filterSaleStatus || '' },
      { key: 'filterProductCategory', label: '筛选-商品分类', render: (row) => row.rowData?.filterProductCategory || '' },
      { key: 'filterProductLine', label: '筛选-销售产品线', render: (row) => row.rowData?.filterProductLine || '' },
      { key: 'filterProductSeries', label: '筛选-销售系列', render: (row) => row.rowData?.filterProductSeries || '' },
      { key: 'filterWarehouseLocation', label: '筛选-仓库位置', render: (row) => row.rowData?.filterWarehouseLocation || '' },
      { key: 'filterSearch', label: '筛选-搜索词', render: (row) => row.rowData?.filterSearch || '' },
      { key: 'filteredRowCount', label: '筛选后行数', render: (row) => row.rowData?.filteredRowCount === undefined ? '' : formatNumber(row.rowData.filteredRowCount) },
      { key: 'department', label: '事业部', render: (row) => row.rowData?.department || '' },
      { key: 'productLine', label: '销售产品线', render: (row) => row.rowData?.productLine || '' },
      { key: 'productSeries', label: '销售系列', render: (row) => row.rowData?.productSeries || '' },
      { key: 'materialCode', label: '物料编码', render: (row) => row.rowData?.materialCode || '' },
      { key: 'materialName', label: '物料名称', render: (row) => row.rowData?.materialName || '' },
      { key: 'warehouse', label: '仓库', render: (row) => row.rowData?.warehouse || '' },
      { key: 'qty', label: '关账结存库存', render: (row) => formatNumber(row.rowData?.qty, 2) },
      { key: 'amount', label: '库存金额合计', render: (row) => moneyWan(row.rowData?.amount) }
    ]
  },
  sales: {
    title: '月销售数据反馈信息反馈',
    endpoint: 'sales',
    columns: [
      { key: 'createdAt', label: '提交时间' },
      { key: 'userName', label: '提交人' },
      { key: 'feedback', label: '反馈信息' },
      { key: 'salesMonth', label: '销售月份', render: (row) => row.rowData?.salesMonth || '' },
      { key: 'salesOrg', label: '销售部门', render: (row) => row.rowData?.salesOrg || '' },
      { key: 'storeShortName', label: '店铺简称', render: (row) => row.rowData?.storeShortName || '' },
      { key: 'productLine', label: '销售产品线', render: (row) => row.rowData?.productLine || '' },
      { key: 'productSeries', label: '销售系列', render: (row) => row.rowData?.productSeries || '' },
      { key: 'model', label: '型号', render: (row) => row.rowData?.model || '' },
      { key: 'qty', label: '销售数量', render: (row) => formatNumber(row.rowData?.qty, 2) }
    ]
  }
};

export default function KcfxFeedbackPage({ type, user }) {
  const config = FEEDBACK_CONFIG[type] || FEEDBACK_CONFIG.receipt;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');

  const loadFeedback = useCallback(async () => {
    if (!user?.name) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/kcfx-feedback/${config.endpoint}?user=${encodeURIComponent(user.name)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setLoadedAt(new Date().toLocaleString('zh-CN', { hour12: false }));
    } catch (loadError) {
      setError(loadError?.message || String(loadError));
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, user?.name]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const status = useMemo(() => {
    if (loading) return '数据加载中...';
    if (error) return `读取失败：${error}`;
    return `共 ${formatNumber(rows.length)} 条反馈${loadedAt ? `；读取时间：${loadedAt}` : ''}`;
  }, [error, loadedAt, loading, rows.length]);

  const canExport = user?.name === systemOwnerName;
  const downloadFeedbackRows = useCallback(() => {
    downloadKcfxRowsAsXlsx(config.title, rows, config.columns, config.title);
  }, [config.columns, config.title, rows]);

  return (
    <KcfxPageShell title={config.title} status={status} loading={loading} onRefresh={loadFeedback}>
      {canExport && (
        <div className="kcfx-actions-row">
          <button type="button" onClick={downloadFeedbackRows} disabled={!rows.length}>
            导出反馈
          </button>
        </div>
      )}
      <section className="kcfx-panel">
        <SimpleTable rows={rows} maxRows={500} columns={config.columns} />
      </section>
    </KcfxPageShell>
  );
}
