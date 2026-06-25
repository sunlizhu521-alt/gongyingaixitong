import React from 'react';
import DataTable from './DataTable.jsx';
import MultiFilter from './MultiFilter.jsx';

export default function InvoiceManagementPage({
  invoices,
  query,
  setQuery,
  supplierFilter,
  setSupplierFilter,
  ownerFilter,
  setOwnerFilter,
  statusFilter,
  setStatusFilter,
  paymentWeekFilter,
  setPaymentWeekFilter,
  paymentMonthFilter,
  setPaymentMonthFilter,
  oaSubmitWeekFilter,
  setOaSubmitWeekFilter,
  openFilter,
  setOpenFilter,
  supplierOptions,
  ownerOptions,
  statusOptions,
  ledgerStats,
  resetFilters,
  togglePaymentPeriod,
  toggleOaSubmitWeek,
  updateInvoice,
  openPreview,
  editInvoice,
  deleteInvoice,
  setPreviewFile,
  downloadInvoiceFile
}) {
  void setPaymentWeekFilter;
  void setPaymentMonthFilter;
  void setOaSubmitWeekFilter;
  void editInvoice;
  void deleteInvoice;
  void setPreviewFile;
  void downloadInvoiceFile;

  return (
    <>
      <div className="toolbar">
        <div className="board-heading-row">
          <h2>供应商付款看板</h2>
          <div className="filter-row" onClick={(event) => event.stopPropagation()}>
            <MultiFilter
              id="supplier"
              label="供应商简称"
              allLabel="供应商简称"
              options={supplierOptions}
              selected={supplierFilter}
              onChange={setSupplierFilter}
              openFilter={openFilter}
              setOpenFilter={setOpenFilter}
            />
            <MultiFilter
              id="owner"
              label="采购员"
              allLabel="采购员"
              options={ownerOptions}
              selected={ownerFilter}
              onChange={setOwnerFilter}
              openFilter={openFilter}
              setOpenFilter={setOpenFilter}
            />
            <MultiFilter
              id="status"
              label="状态"
              allLabel="状态"
              options={statusOptions}
              selected={statusFilter}
              onChange={setStatusFilter}
              openFilter={openFilter}
              setOpenFilter={setOpenFilter}
            />
            <button
              className={`quick-filter-button ${paymentWeekFilter.length ? 'active' : ''}`}
              type="button"
              onClick={() => togglePaymentPeriod('week')}
            >
              本周付款
            </button>
            <button
              className={`quick-filter-button ${paymentMonthFilter.length ? 'active' : ''}`}
              type="button"
              onClick={() => togglePaymentPeriod('month')}
            >
              本月付款
            </button>
            <button
              className={`quick-filter-button ${oaSubmitWeekFilter.length ? 'active' : ''}`}
              type="button"
              onClick={toggleOaSubmitWeek}
            >
              本周提交OA
            </button>
            <button className="ghost compact-button" onClick={resetFilters}>清空筛选</button>
          </div>
        </div>
        <input placeholder="搜索供应商、发票号、采购员或状态" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="metric-grid ledger-metric-grid">
        <div className="metric-card">
          <span>上传发票数量</span>
          <strong>{ledgerStats.uploadedSupplierCount}</strong>
        </div>
        <div className="metric-card">
          <span>未到付款时间数量</span>
          <strong>{ledgerStats.notDueSupplierCount}</strong>
        </div>
        <div className="metric-card">
          <span>已经提交OA流程</span>
          <strong>{ledgerStats.submittedOaSupplierCount}</strong>
        </div>
        <div className="metric-card">
          <span>待财务付款</span>
          <strong>{ledgerStats.awaitingFinanceCount}</strong>
        </div>
        <div className="metric-card">
          <span>已经完成</span>
          <strong>{ledgerStats.completedSupplierCount}</strong>
        </div>
        <div className="metric-card">
          <span>本周需要提交OA流程</span>
          <strong>{ledgerStats.thisWeekSupplierCount}</strong>
        </div>
        <div className="metric-card">
          <span>本周需要提交OA付款</span>
          <strong>{`¥${ledgerStats.thisWeekAmount.toLocaleString()}`}</strong>
        </div>
        <div className="metric-card">
          <span>本月需要提交OA流程</span>
          <strong>{ledgerStats.thisMonthSupplierCount}</strong>
        </div>
        <div className="metric-card">
          <span>本月需要提交OA付款</span>
          <strong>{`¥${ledgerStats.thisMonthAmount.toLocaleString()}`}</strong>
        </div>
      </div>
      <DataTable
        className="ledger-table"
        rows={invoices}
        columns={['采购员', '供应商', '发票号', '金额', '开票日', '账期', '付款时间', '提交OA时间', '下载发票', 'OA流程号', '是否已打印OA单据', '是否付款', '状态']}
        render={(row) => [
          row.buyer,
          row.supplier,
          row.invoiceNo,
          `¥${Number(row.amount).toLocaleString()}`,
          row.issueDate,
          row.termText,
          row.paymentDate,
          row.oaSubmitDate,
          <button className="ghost compact-button" onClick={() => openPreview(row)}>下载发票</button>,
          <input
            className="table-input"
            defaultValue={row.oaProcessNo || ''}
            placeholder="填写OA流程号"
            onBlur={(event) => updateInvoice(row.id, { oaProcessNo: event.target.value })}
          />,
          <select
            className="table-select"
            value={row.isOaPrinted || ''}
            onChange={(event) => updateInvoice(row.id, { isOaPrinted: event.target.value })}
          >
            <option value="">未填写</option>
            <option value="否">否</option>
            <option value="是">是</option>
          </select>,
          <select
            className="table-select"
            value={row.isPaid || ''}
            onChange={(event) => updateInvoice(row.id, { isPaid: event.target.value })}
          >
            <option value="">未完成</option>
            <option value="是">是</option>
          </select>,
          row.status
        ]}
      />
    </>
  );
}
