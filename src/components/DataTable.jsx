import React from 'react';
import { DEFAULT_TABLE_PAGE_SIZE, TablePagination, useTablePagination } from './TablePagination.jsx';

function DataTable({ rows, columns, render, className = '', pageSize = DEFAULT_TABLE_PAGE_SIZE, paginated = true, resetKey }) {
  const pagination = useTablePagination(rows, { pageSize, resetKey });
  const visibleRows = paginated ? pagination.pageRows : rows;
  return (
    <div className="table-pagination-shell">
      <div className={`table-wrap ${className}`}>
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {visibleRows.length === 0 && <tr><td colSpan={columns.length} className="empty">暂无数据</td></tr>}
            {visibleRows.map((row) => <tr key={row.id || `${row.name}-${row.supplier}`}>{render(row).map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
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

export default DataTable;
