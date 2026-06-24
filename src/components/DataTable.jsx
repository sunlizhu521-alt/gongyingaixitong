import React from 'react';

function DataTable({ rows, columns, render, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="empty">暂无数据</td></tr>}
          {rows.map((row) => <tr key={row.id || `${row.name}-${row.supplier}`}>{render(row).map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
