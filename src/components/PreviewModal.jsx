import React from 'react';

export default function PreviewModal({ previewFile, setPreviewFile, downloadInvoiceFile }) {
  if (!previewFile) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="preview-modal">
        <div className="preview-header">
          <h3>{previewFile.title}</h3>
          <div className="preview-actions">
            <button onClick={() => downloadInvoiceFile(previewFile.row)}>下载</button>
            <button className="ghost" onClick={() => setPreviewFile(null)}>关闭</button>
          </div>
        </div>
        <div className="preview-body">
          {previewFile.isPdf ? (
            <iframe title="发票原件预览" src={previewFile.url} />
          ) : (
            <img src={previewFile.url} alt="发票原件预览" />
          )}
        </div>
      </div>
    </div>
  );
}
