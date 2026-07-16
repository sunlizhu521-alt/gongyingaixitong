import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_TABLE_PAGE_SIZE, visiblePageNumbers } from '../../shared/tablePagination.js';

export { DEFAULT_TABLE_PAGE_SIZE };

export function useTablePagination(rows = [], options = {}) {
  const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : DEFAULT_TABLE_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const resetKey = options.resetKey ?? rows;

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageSize, rows, safePage]);

  return { page: safePage, pageRows, pageSize, setPage, totalPages, totalRows };
}

export function TablePagination({
  page,
  totalPages,
  totalRows,
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  onPageChange,
  disabled = false
}) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages);
  const pageNumbers = visiblePageNumbers(safePage, safeTotalPages);
  const changePage = (nextPage) => onPageChange(Math.min(Math.max(1, nextPage), safeTotalPages));

  return (
    <div className="table-pagination-controls">
      <span className="table-pagination-summary">共 {Number(totalRows || 0).toLocaleString('zh-CN')} 行，每页 {pageSize} 行</span>
      <div className="table-pagination-actions">
        <button type="button" className="ghost compact-button" onClick={() => changePage(1)} disabled={disabled || safePage <= 1}>首页</button>
        <button type="button" className="ghost compact-button" onClick={() => changePage(safePage - 1)} disabled={disabled || safePage <= 1}>上一页</button>
        <div className="table-pagination-pages" aria-label="表格页码">
          {pageNumbers.map((pageNumber) => (
            <button
              type="button"
              className={`ghost compact-button${pageNumber === safePage ? ' active' : ''}`}
              aria-current={pageNumber === safePage ? 'page' : undefined}
              key={pageNumber}
              onClick={() => changePage(pageNumber)}
              disabled={disabled}
            >
              {pageNumber}
            </button>
          ))}
        </div>
        <button type="button" className="ghost compact-button" onClick={() => changePage(safePage + 1)} disabled={disabled || safePage >= safeTotalPages}>下一页</button>
        <button type="button" className="ghost compact-button" onClick={() => changePage(safeTotalPages)} disabled={disabled || safePage >= safeTotalPages}>末页</button>
      </div>
    </div>
  );
}
