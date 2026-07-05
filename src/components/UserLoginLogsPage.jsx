import React, { useEffect, useMemo, useState } from 'react';
import { API } from '../constants.js';
import DataTable from './DataTable.jsx';

function formatLoginTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function compactDeviceId(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function userAgentLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const browser = [
    ['Edg/', 'Edge'],
    ['Chrome/', 'Chrome'],
    ['Firefox/', 'Firefox'],
    ['Safari/', 'Safari']
  ].find(([marker]) => text.includes(marker))?.[1];
  const os = [
    ['Windows', 'Windows'],
    ['Mac OS X', 'macOS'],
    ['Android', 'Android'],
    ['iPhone', 'iPhone'],
    ['iPad', 'iPad']
  ].find(([marker]) => text.includes(marker))?.[1];
  return [browser, os].filter(Boolean).join(' / ') || text;
}

export default function UserLoginLogsPage({ authFetch }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadLogs() {
    setLoading(true);
    setMessage('');
    try {
      const response = await authFetch(`${API}/api/user-login-logs?limit=500`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setRows(await response.json());
    } catch (error) {
      setMessage(`登录日志读取失败：${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const stats = useMemo(() => {
    const users = new Set(rows.map((row) => row.userName).filter(Boolean)).size;
    const ips = new Set(rows.map((row) => row.ip).filter(Boolean)).size;
    return { users, ips };
  }, [rows]);

  return (
    <section className="single-management-panel">
      <div className="section-heading-row">
        <div>
          <h2>用户登录日志</h2>
          <p className="section-subtitle">记录最近 500 次成功登录，包含用户、登录时间、IP、设备和浏览器信息。</p>
        </div>
        <button type="button" className="ghost" onClick={loadLogs} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {message && <div className="inline-error">{message}</div>}

      <div className="metric-grid login-log-metrics">
        <div className="metric-card">
          <span>登录记录</span>
          <strong>{rows.length.toLocaleString('zh-CN')}</strong>
        </div>
        <div className="metric-card">
          <span>登录用户</span>
          <strong>{stats.users.toLocaleString('zh-CN')}</strong>
        </div>
        <div className="metric-card">
          <span>登录 IP</span>
          <strong>{stats.ips.toLocaleString('zh-CN')}</strong>
        </div>
      </div>

      <DataTable
        className="login-log-table"
        rows={rows}
        columns={['登录时间', '用户', '角色', 'IP 地址', '设备 ID', '浏览器/系统']}
        render={(row) => [
          formatLoginTime(row.createdAt),
          row.userName || '-',
          row.role || '-',
          row.ip || '-',
          <span title={row.deviceId || ''}>{compactDeviceId(row.deviceId)}</span>,
          <span title={row.userAgent || ''}>{userAgentLabel(row.userAgent)}</span>
        ]}
      />
    </section>
  );
}
