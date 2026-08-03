import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API } from '../constants.js';
import { KcfxPageShell, MetricCards, SimpleTable } from './KcfxCommon.jsx';
import { formatNumber } from './kcfxUtils.js';
import InventoryRiskLogicPage from './InventoryRiskLogicPage.jsx';

const DEFAULT_PARAMS = {
  transitHighOverseas: 120,
  transitHighDomestic: 38,
  transitSevereOverseas: 180,
  transitSevereDomestic: 83,
  chainAttentionOverseas: 165,
  chainAttentionDomestic: 83,
  chainInterventionOverseas: 200,
  chainInterventionDomestic: 120,
  deliveryPeriod: 45,
  forecastMonths: 6,
  historicalMonths: 6
};

const PARAM_FIELDS = [
  { key: 'transitHighOverseas', label: '在途偏高线-海外', unit: '天' },
  { key: 'transitHighDomestic', label: '在途偏高线-国内', unit: '天' },
  { key: 'transitSevereOverseas', label: '在途严重线-海外', unit: '天' },
  { key: 'transitSevereDomestic', label: '在途严重线-国内', unit: '天' },
  { key: 'chainAttentionOverseas', label: '全链关注线-海外', unit: '天' },
  { key: 'chainAttentionDomestic', label: '全链关注线-国内', unit: '天' },
  { key: 'chainInterventionOverseas', label: '全链干预线-海外', unit: '天' },
  { key: 'chainInterventionDomestic', label: '全链干预线-国内', unit: '天' },
  { key: 'deliveryPeriod', label: '交期天数', unit: '天' },
  { key: 'forecastMonths', label: '预测月数', unit: '月', integer: true },
  { key: 'historicalMonths', label: '历史销量月数', unit: '月', integer: true }
];

function userHeaders(user, extra = {}) {
  return {
    ...extra,
    ...(user?.id ? { 'x-user-id': user.id } : {}),
    ...(user?.sessionToken ? { 'x-session-token': user.sessionToken } : {}),
    ...(user?.deviceId ? { 'x-device-id': user.deviceId } : {})
  };
}

function number(value, digits = 1) {
  return formatNumber(Number(value) || 0, digits);
}

function days(value) {
  return `${number(value, 1)}天`;
}

const RISK_COLUMNS = [
  { key: 'materialCode', label: '物料编码' },
  { key: 'sku', label: 'SKU' },
  { key: 'productLine', label: '产品线' },
  { key: 'inventorySegment', label: '库存段' },
  { key: 'onHandQty', label: '在库量', render: (row) => number(row.onHandQty) },
  { key: 'inTransitQty', label: '在途量', render: (row) => number(row.inTransitQty) },
  { key: 'inventoryQty', label: '库存合计', render: (row) => number(row.inventoryQty) },
  { key: 'undeliveredQty', label: '待交付量', render: (row) => number(row.undeliveredQty) },
  { key: 'forecastMonthlyAverage', label: '预测月均销量', render: (row) => number(row.forecastMonthlyAverage) },
  { key: 'historicalMonthlyAverage', label: '历史月均销量', render: (row) => number(row.historicalMonthlyAverage) },
  { key: 'transitTurnoverDays', label: '在途周转天数', render: (row) => days(row.transitTurnoverDays) },
  { key: 'fullChainCoverageDays', label: '全链覆盖天数', render: (row) => days(row.fullChainCoverageDays) },
  { key: 'forecastStatus', label: '预测数据状态' },
  { key: 'action', label: '处置动作', render: (row) => <strong className={`risk-action ${row.action === '停止采购' ? 'stopped' : 'restricted'}`}>{row.action}</strong> }
];

const UNKNOWN_COLUMNS = [
  { key: 'materialCode', label: '物料编码' },
  { key: 'sku', label: 'SKU' },
  { key: 'productLine', label: '产品线' },
  { key: 'warehouse', label: '仓库名称' },
  { key: 'warehouseLocation', label: '仓库位置' },
  { key: 'qty', label: '影响数量', render: (row) => number(row.qty) },
  { key: 'reason', label: '问题' }
];

function monthLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}年${Number(match[2])}月` : value;
}

export default function InventoryRiskPage({ user = null, kcfxData = null, onRefresh }) {
  const [showLogic, setShowLogic] = useState(false);
  const [draftParams, setDraftParams] = useState(DEFAULT_PARAMS);
  const [requestParams, setRequestParams] = useState(DEFAULT_PARAMS);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const forceRefreshRef = useRef(-1);
  const requestKey = useMemo(() => JSON.stringify(requestParams), [requestParams]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const forceRefresh = forceRefreshRef.current === refreshVersion;
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API}/api/kcfx-library/risk-analysis/query`, {
          method: 'POST',
          cache: 'no-store',
          headers: userHeaders(user, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ ...requestParams, refresh: forceRefresh })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.error || `HTTP ${response.status}`);
        if (!cancelled) setPayload(result);
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null);
          setError(loadError?.message || String(loadError));
        }
      } finally {
        if (forceRefresh) forceRefreshRef.current = 0;
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kcfxData?.savedAt, refreshVersion, requestKey, requestParams, user]);

  const refresh = useCallback(async () => {
    await onRefresh?.();
    setRefreshVersion((value) => {
      const nextValue = value + 1;
      forceRefreshRef.current = nextValue;
      return nextValue;
    });
  }, [onRefresh]);

  const calculate = useCallback(() => {
    setRequestParams(Object.fromEntries(Object.entries(draftParams).map(([key, value]) => [key, Number(value)])));
  }, [draftParams]);

  const reset = useCallback(() => {
    setDraftParams(DEFAULT_PARAMS);
    setRequestParams(DEFAULT_PARAMS);
  }, []);

  const exportRows = useCallback(async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API}/api/kcfx-library/risk-analysis/export`, {
        method: 'POST',
        headers: userHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(requestParams)
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `库存风险分析_${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      window.alert(`导出失败：${exportError?.message || exportError}`);
    } finally {
      setExporting(false);
    }
  }, [requestParams, user]);

  if (showLogic) return <InventoryRiskLogicPage onBack={() => setShowLogic(false)} />;

  const status = payload?.periods
    ? `预测期间：${monthLabel(payload.periods.forecastStartMonth)}至${monthLabel(payload.periods.forecastEndMonth)}；历史期间：${monthLabel(payload.periods.historicalStartMonth)}至${monthLabel(payload.periods.historicalEndMonth)}`
    : loading ? '正在计算库存风险...' : '等待有效数据';

  return (
    <KcfxPageShell
      title="库存风险分析"
      status={status}
      note="以物料编码为主键，按国内和海外库存段独立判断；正常物料默认继续采购，不在风险明细中展示。"
      loading={loading}
      onRefresh={refresh}
      actions={(
        <>
          <button type="button" className="ghost" onClick={() => setShowLogic(true)}>计算逻辑说明</button>
          <button type="button" className="ghost" onClick={exportRows} disabled={loading || exporting || !payload?.ok}>
            {exporting ? '导出中...' : '导出Excel'}
          </button>
        </>
      )}
      className="inventory-risk-page"
    >
      <section className="kcfx-panel risk-parameter-panel">
        <div className="risk-panel-heading">
          <div><h3>风险参数</h3><p>达到阈值即命中，停止采购优先于限制采购。</p></div>
          <div className="risk-parameter-actions">
            <button type="button" className="ghost" onClick={reset} disabled={loading}>恢复默认</button>
            <button type="button" onClick={calculate} disabled={loading}>{loading ? '计算中...' : '重新计算'}</button>
          </div>
        </div>
        <div className="risk-parameter-grid">
          {PARAM_FIELDS.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <div><input
                type="number"
                min={field.integer ? 1 : 0}
                max={field.integer ? 24 : undefined}
                step={field.integer ? 1 : 0.1}
                value={draftParams[field.key]}
                onChange={(event) => setDraftParams((current) => ({ ...current, [field.key]: event.target.value }))}
              /><em>{field.unit}</em></div>
            </label>
          ))}
        </div>
      </section>

      {error && <div className="risk-error" role="alert"><strong>计算失败</strong><span>{error}</span></div>}

      {payload?.ok && <MetricCards metrics={[
        { label: '限制采购', value: formatNumber(payload.summary.restrictedCount), note: '达到偏高线或关注线' },
        { label: '停止采购', value: formatNumber(payload.summary.stoppedCount), note: '达到严重线、干预线或无预测' },
        { label: '正常未展示', value: formatNumber(payload.summary.normalCount), note: '默认继续采购' },
        { label: '未确定位置', value: formatNumber(payload.summary.unknownLocationCount), note: `影响数量 ${number(payload.summary.unknownLocationQty)}` }
      ]} />}

      <section className="kcfx-panel risk-result-panel restricted-panel">
        <div className="risk-panel-heading"><h3>限制采购</h3><span>{formatNumber(payload?.restricted?.length || 0)} 条</span></div>
        <SimpleTable columns={RISK_COLUMNS} rows={payload?.restricted || []} pageSize={20} resetKey={requestKey} />
      </section>

      <section className="kcfx-panel risk-result-panel stopped-panel">
        <div className="risk-panel-heading"><h3>停止采购</h3><span>{formatNumber(payload?.stopped?.length || 0)} 条</span></div>
        <SimpleTable columns={RISK_COLUMNS} rows={payload?.stopped || []} pageSize={20} resetKey={requestKey} />
      </section>

      <section className="kcfx-panel risk-result-panel diagnostic-panel">
        <div className="risk-panel-heading">
          <div><h3>未确定位置诊断</h3><p>这些正库存未参与风险动作，请维护仓库维表的仓库位置。</p></div>
          <span>{formatNumber(payload?.diagnostics?.unknownLocations?.length || 0)} 条</span>
        </div>
        <SimpleTable columns={UNKNOWN_COLUMNS} rows={payload?.diagnostics?.unknownLocations || []} pageSize={20} resetKey={requestKey} />
      </section>
    </KcfxPageShell>
  );
}
