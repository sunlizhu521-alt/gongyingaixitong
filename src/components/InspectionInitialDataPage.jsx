import React from 'react';
import DataTable from './DataTable.jsx';

export default function InspectionInitialDataPage({
  inspectionInitialData,
  inspectionInitialImportResult,
  inspectionInitialColumns,
  uploadInspectionInitialData
}) {
  return (
    <>
      <div className="section-heading-row">
        <h2>验货信息初始数据</h2>
        <span className="section-count">共 {inspectionInitialData.rows?.length || 0} 行</span>
      </div>
      <section className="single-management-panel">
        <h3>验货信息初始数据</h3>
        <label
          className="mini-drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); uploadInspectionInitialData(event.dataTransfer.files); }}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => uploadInspectionInitialData(event.target.files)}
          />
          <span>点击或拖拽上传验货信息初始数据</span>
        </label>
        {(inspectionInitialImportResult || inspectionInitialData.updatedAt) && (
          <div className="import-summary">
            <strong>读取结果</strong>
            <span>工作表：{inspectionInitialData.sheetName || inspectionInitialImportResult?.sheetName || '未识别'}</span>
            <span>成功 {inspectionInitialImportResult?.importedCount ?? inspectionInitialData.rows?.length ?? 0} 行</span>
            {inspectionInitialData.updatedAt && <span>更新时间：{inspectionInitialData.updatedAt}</span>}
          </div>
        )}
        <DataTable
          className="inspection-initial-table"
          rows={inspectionInitialData.rows || []}
          columns={inspectionInitialColumns}
          render={(row) => inspectionInitialColumns.map((column) => row[column] || '')}
        />
      </section>
    </>
  );
}
