import React, { useMemo, useState } from 'react';
import { API } from '../constants.js';
import { KcfxPageShell, MetricCards, SimpleTable } from './KcfxCommon.jsx';
import { formatNumber, recordSourceText } from './kcfxUtils.js';
import { kcfxRecordsArrayToMap } from './kcfxRecordLoader.js';

const EMPTY_UPLOAD_STATE = { slotId: '', fileName: '', percent: 0, phase: '' };
const PARSE_POLL_INTERVAL_MS = 2000;
const PARSE_POLL_LIMIT = 300;

export default function KcfxLibraryPage({
  title,
  slots,
  kcfxData = null,
  library = {},
  user,
  loading = false,
  error = '',
  lastLoadedAt = '',
  onRefresh
}) {
  const [uploadState, setUploadState] = useState(EMPTY_UPLOAD_STATE);
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [message, setMessage] = useState('');
  const activeLibrary = kcfxData || library || {};
  const records = kcfxRecordsArrayToMap(activeLibrary.records);
  const rows = useMemo(() => slots.map((slot) => {
    const record = records[slot.id] || { id: slot.id };
    return {
      ...slot,
      fileName: record.fileName || record.originalName || '-',
      rowCount: record.rows?.length || record.rowCount || 0,
      sheetName: record.sheetName || record.selectedSheetName || '-',
      updatedAt: record.appliedAt || record.savedAt || '',
      parseStatus: record.parseStatus || '',
      parseError: record.parseError || '',
      source: recordSourceText(record)
    };
  }), [records, slots]);
  const canUpload = user?.name === '孙立柱';
  const status = loading
    ? '数据加载中...'
    : error || message || `已加载 ${formatNumber(rows.length)} 个文件槽位${lastLoadedAt ? `；读取时间：${lastLoadedAt}` : ''}`;

  async function uploadSlot(slotId, file) {
    if (!file) return;
    let phase = 'uploading';
    setUploadState({ slotId, fileName: file.name, percent: 0, phase });
    setUploadFeedback(null);
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('user', user?.name || '');
      const payload = await uploadWithProgress(
        `${API}/api/kcfx-library/records/${encodeURIComponent(slotId)}/upload`,
        form,
        (percent) => setUploadState({ slotId, fileName: file.name, percent, phase: 'uploading' })
      );
      let record = payload.record || {};
      if (payload.queued || ['queued', 'parsing'].includes(record.parseStatus)) {
        phase = 'processing';
        setUploadState({ slotId, fileName: file.name, percent: 100, phase });
        record = await waitForParseResult(slotId, (parseStatus) => {
          setUploadState({ slotId, fileName: file.name, percent: 100, phase: parseStatus || 'processing' });
        });
      } else if (record.parseStatus === 'failed') {
        phase = 'processing';
        throw new Error(record.parseError || '服务器未返回解析失败原因');
      }
      const rowCount = record.rowCount || record.rows?.length || 0;
      const successText = `${file.name} 上传成功，已解析 ${formatNumber(rowCount)} 行`;
      setUploadFeedback({ type: 'success', text: successText });
      setMessage(successText);
      phase = 'complete';
      await onRefresh?.();
    } catch (uploadError) {
      const prefix = phase === 'uploading'
        ? '上传失败'
        : phase === 'complete'
          ? '上传和解析成功，但页面刷新失败'
          : '文件已上传，但解析失败';
      const failureText = `${prefix}：${uploadError?.message || uploadError}`;
      setUploadFeedback({ type: 'error', text: failureText });
      setMessage(failureText);
      if (phase !== 'uploading') await onRefresh?.();
    } finally {
      setUploadState(EMPTY_UPLOAD_STATE);
    }
  }

  function uploadWithProgress(url, form, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', url);
      request.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      });
      request.addEventListener('load', () => {
        const payload = parseResponsePayload(request.responseText);
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve(payload);
          return;
        }
        reject(new Error(payload.error || `HTTP ${request.status}`));
      });
      request.addEventListener('error', () => reject(new Error('网络连接失败')));
      request.addEventListener('abort', () => reject(new Error('上传已取消')));
      request.send(form);
    });
  }

  async function waitForParseResult(slotId, onStatus) {
    for (let attempt = 0; attempt < PARSE_POLL_LIMIT; attempt += 1) {
      await wait(PARSE_POLL_INTERVAL_MS);
      const response = await fetch(`${API}/api/kcfx-library`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`读取解析状态失败：HTTP ${response.status}`);
      const payload = await response.json();
      const recordMap = kcfxRecordsArrayToMap(payload.records);
      const record = recordMap[slotId];
      if (!record) throw new Error('服务器未返回该文件槽位');
      onStatus(record.parseStatus);
      if (record.parseStatus === 'ready') return record;
      if (record.parseStatus === 'failed') throw new Error(record.parseError || '服务器未返回解析失败原因');
    }
    throw new Error('服务器解析超时，请稍后刷新页面查看结果');
  }

  return (
    <KcfxPageShell title={title} status={status} loading={loading} onRefresh={onRefresh}>
      <MetricCards metrics={[
        { label: '槽位数量', value: formatNumber(rows.length) },
        { label: '已应用文件', value: formatNumber(rows.filter((row) => row.rowCount > 0).length) },
        { label: '总行数', value: formatNumber(rows.reduce((total, row) => total + row.rowCount, 0)) },
        { label: '保存时间', value: activeLibrary.savedAt ? new Date(activeLibrary.savedAt).toLocaleString('zh-CN', { hour12: false }) : '-' }
      ]} />
      {uploadFeedback && (
        <div
          className={`kcfx-upload-feedback ${uploadFeedback.type}`}
          role={uploadFeedback.type === 'error' ? 'alert' : 'status'}
        >
          <strong>{uploadFeedback.type === 'success' ? '上传成功' : '处理失败'}</strong>
          <span>{uploadFeedback.text}</span>
        </div>
      )}
      <div className="kcfx-library-grid">
        {rows.map((row) => (
          <section className="kcfx-library-card" key={row.id}>
            <div>
              <h3>{row.label}</h3>
              <p>{row.description || row.id}</p>
            </div>
            <dl>
              <div><dt>文件</dt><dd>{row.fileName}</dd></div>
              <div><dt>Sheet</dt><dd>{row.sheetName}</dd></div>
              <div><dt>行数</dt><dd>{formatNumber(row.rowCount)}</dd></div>
            </dl>
            {row.parseStatus === 'failed' && (
              <p className="kcfx-library-parse-error">解析失败：{row.parseError || '未返回失败原因'}</p>
            )}
            {['queued', 'parsing'].includes(row.parseStatus) && uploadState.slotId !== row.id && (
              <p className="kcfx-library-parse-pending">{parseStatusText(row)}</p>
            )}
            {uploadState.slotId === row.id && (
              <div className="kcfx-upload-progress">
                <div className="kcfx-upload-progress-heading">
                  <span>{uploadPhaseText(uploadState.phase)}</span>
                  <strong>{uploadState.percent}%</strong>
                </div>
                <div
                  className="kcfx-upload-progress-track"
                  role="progressbar"
                  aria-label={`${row.label}上传进度`}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={uploadState.percent}
                >
                  <span style={{ width: `${uploadState.percent}%` }} />
                </div>
                <small title={uploadState.fileName}>{uploadState.fileName}</small>
              </div>
            )}
            {canUpload && (
              <label className="kcfx-upload-button">
                {uploadState.slotId === row.id ? `${uploadState.percent}%` : '上传替换'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={Boolean(uploadState.slotId)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    uploadSlot(row.id, file);
                  }}
                />
              </label>
            )}
          </section>
        ))}
      </div>
      <section className="kcfx-panel">
        <h3>文件槽位明细</h3>
        <SimpleTable
          rows={rows}
          columns={[
            { key: 'id', label: '槽位' },
            { key: 'label', label: '名称' },
            { key: 'fileName', label: '文件名' },
            { key: 'sheetName', label: 'Sheet' },
            { key: 'rowCount', label: '行数', render: (row) => formatNumber(row.rowCount) },
            { key: 'parseStatus', label: '解析状态', render: parseStatusText },
            { key: 'updatedAt', label: '更新时间', render: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '-' }
          ]}
        />
      </section>
    </KcfxPageShell>
  );
}

function parseResponsePayload(responseText) {
  try {
    return JSON.parse(responseText || '{}');
  } catch {
    return {};
  }
}

function wait(delay) {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function uploadPhaseText(phase) {
  if (phase === 'queued') return '上传完成，等待服务器解析';
  if (phase === 'parsing') return '上传完成，服务器解析中';
  if (phase === 'processing') return '上传完成，正在确认解析状态';
  return '正在上传';
}

function parseStatusText(row) {
  if (row.parseStatus === 'failed') return `失败：${row.parseError || '未返回失败原因'}`;
  if (row.parseStatus === 'queued') return '文件已上传，等待服务器解析';
  if (row.parseStatus === 'parsing') return '服务器解析中';
  if (row.parseStatus === 'ready' || row.rowCount > 0) return '解析成功';
  return '-';
}
