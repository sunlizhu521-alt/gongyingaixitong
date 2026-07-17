import React from 'react';
import { KCFX_COLORS, formatNumber, percent } from './kcfxUtils.js';
import { DEFAULT_TABLE_PAGE_SIZE, TablePagination, useTablePagination } from './TablePagination.jsx';

export function KcfxPageShell({ title, status, loading, onRefresh, children, className = '' }) {
  return (
    <section className={`kcfx-react-page ${className}`.trim()}>
      <header className="kcfx-page-header">
        <div>
          <h2>{title}</h2>
          {status && <p className="section-count">{status}</p>}
        </div>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={loading}>
            {loading ? '读取中...' : '应用刷新'}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

export function MetricCards({ metrics }) {
  return (
    <div className="kcfx-metric-grid">
      {metrics.map((metric) => (
        <div className="kcfx-metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.note && <small>{metric.note}</small>}
        </div>
      ))}
    </div>
  );
}

export function BarPanel({ title, rows, total, valueFormatter = formatNumber }) {
  const panelTotal = Number.isFinite(Number(total))
    ? Number(total)
    : rows.reduce((amount, row) => amount + (Number(row.value) || 0), 0);
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);

  return (
    <section className="panel">
      <h2>
        {title}
        <span className="chart-total">合计 {valueFormatter(panelTotal)}</span>
      </h2>
      <div className="chart-bars">
        {rows.length ? rows.map((row, index) => {
          const value = Number(row.value) || 0;
          return (
            <div className="bar-row" key={`${row.name}-${index}`} title={`${row.name} ${valueFormatter(value)} ${percent(value, panelTotal)}`}>
              <div className="bar-label">{row.name}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.max(3, (value / max) * 100)}%`,
                    background: KCFX_COLORS[index % KCFX_COLORS.length]
                  }}
                />
              </div>
              <div className="bar-value">{valueFormatter(value)} / {percent(value, panelTotal)}</div>
            </div>
          );
        }) : <div className="empty">暂无数据</div>}
      </div>
    </section>
  );
}

export function PanelGrid({ children, className = '' }) {
  return <div className={`dashboard-grid receipt-chart-grid ${className}`.trim()}>{children}</div>;
}

export function SimpleTable({ columns, rows, pageSize = DEFAULT_TABLE_PAGE_SIZE, paginated = true, resetKey }) {
  const pagination = useTablePagination(rows, { pageSize, resetKey });
  const visibleRows = paginated ? pagination.pageRows : rows;
  const startIndex = paginated ? (pagination.page - 1) * pagination.pageSize : 0;
  return (
    <div className="table-pagination-shell">
      <div className="kcfx-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map((row, index) => (
              <tr key={row.id || `${startIndex + index}`}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row, startIndex + index) : row[column.key]}</td>
                ))}
              </tr>
            )) : (
              <tr><td className="empty" colSpan={columns.length}>暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {paginated && (
        <TablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalPages={pagination.totalPages}
          totalRows={pagination.totalRows}
          onPageChange={pagination.setPage}
        />
      )}
    </div>
  );
}

export function SourcePanel({ sources }) {
  return (
    <section className="kcfx-source-panel">
      {sources.map((source) => (
        <div key={source.label}><strong>{source.label}</strong>：{source.value}</div>
      ))}
    </section>
  );
}
