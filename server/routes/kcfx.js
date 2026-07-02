import { randomUUID } from 'node:crypto';
import { getCachedSalesRows } from '../../src/components/kcfxUtils.js';

const crypto = { randomUUID };
const SALES_ROW_RECORD_IDS = ['sales-data', 'dim-product', 'dim-store-name', 'dim-customer-material'];
let salesRowsPayloadCache = { key: '', payload: null };

const KCFX_FEEDBACK_TYPES = {
  receipt: {
    submitPermission: 'salesInventory.receiptSummary',
    viewPermission: 'salesInventory.receiptFeedback',
    label: '关账库存反馈'
  },
  sales: {
    submitPermission: 'salesInventory.salesAnalysis',
    viewPermission: 'salesInventory.salesFeedback',
    label: '月度销售数据反馈'
  }
};

function feedbackTypeConfig(type) {
  const key = String(type || '').trim();
  return KCFX_FEEDBACK_TYPES[key] ? { key, ...KCFX_FEEDBACK_TYPES[key] } : null;
}

function normalizeFeedbackRow(type, body = {}, requestUser, formatDate) {
  const createdAt = formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss');
  const rowData = body.rowData && typeof body.rowData === 'object' ? body.rowData : {};
  return {
    id: body.id || crypto.randomUUID(),
    type,
    createdAt,
    userName: requestUser?.name || String(body.userName || ''),
    feedback: String(body.feedback || '').trim(),
    rowKey: String(body.rowKey || ''),
    rowSummary: String(body.rowSummary || ''),
    rowData
  };
}

function resolveFeedbackSubmitUser(db, req, helpers) {
  const { findValidSession, resolveRequestUser, isUserApproved } = helpers;
  const source = {
    ...req.query,
    ...req.body,
    userId: req.body?.userId || req.get('x-user-id'),
    sessionToken: req.body?.sessionToken || req.get('x-session-token'),
    deviceId: req.body?.deviceId || req.get('x-device-id')
  };
  const sessionResult = findValidSession(db, source, req);
  if (sessionResult?.user) return sessionResult.user;
  const requestUser = resolveRequestUser(db, source);
  return isUserApproved(requestUser) ? requestUser : null;
}

export default function registerKcfxRoutes(app, db) {
  const {
    initDb,
    dataDir,
    upload,
    format,
    SYSTEM_OWNER_NAME,
    ROLE_ADMIN,
    ROLE_FINANCE,
    ROLE_USER,
    USER_STATUS_APPROVED,
    USER_STATUS_PENDING,
    DEFAULT_PERMISSIONS,
    SYSTEM_FILE_PACKAGES,
    KC_LIBRARY_SLOT_IDS,
    sanitizePermissions,
    normalizeUser,
    publicUser,
    publicSessionUser,
    createUserSession,
    findValidSession,
    isUserApproved,
    pushLog,
    requireSystemOwner,
    resolveRequestUser,
    visibleRows,
    canAccessRow,
    requirePermission,
    deriveInvoiceStatus,
    removeUploadedFile,
    recognizeInvoice,
    reprocessDraft,
    calculateDueDate,
    parseSupplierTermWorkbook,
    parseOwnerWorkbook,
    parseGenericWorkbook,
    weeklyPaymentApplications,
    groupInvoicesByOwner,
    canSeeAllRole,
    publicSettingsForUser,
    packageStats,
    buildSystemPackageFiles,
    makeZip,
    externalizeKcfxLibraryInlineRows,
    publicKcfxLibrary,
    normalizeKcfxIds,
    kcfxPreloadCache,
    kcfxPreloadPromise,
    kcfxPreloadCacheHasIds,
    filterKcfxPreloadCacheByIds,
    kcfxTargetIdsArePriority,
    scheduleKcfxPreloadRefresh,
    kcfxPreloadLoadingResponse,
    buildPreloadedKcfxLibrary,
    getKcfxReceiptSummaryResponse,
    getKcfxTrendSummaryResponse,
    recoverKcfxRecordFromRowsFile,
    ensureKcfxRecordRows,
    externalizeKcfxRecordRows,
    attachKcfxRecordRows,
    sanitizeKcfxLibraryRecord,
    removeKcfxStoredFile,
    removeKcfxRecordRows,
    normalizeUploadedFileName,
    parseKcfxSlotPayload,
    saveKcfxOriginalFile,
    parseKcfxClientRecordPayload,
    buildKcfxClientParsedFileRecord,
    preserveKcfxRowsMetadata,
    buildQueuedKcfxFileRecord,
    scheduleKcfxFileParse,
    scheduleKcfxReceiptSummaryRefresh,
    scheduleKcfxTrendSummaryRefresh
  } = app.locals.gongying;

app.get('/api/kcfx-feedback/:type', async (req, res) => {
  const config = feedbackTypeConfig(req.params.type);
  if (!config) return res.status(400).json({ error: 'invalid feedback type' });
  const db = await initDb(dataDir);
  const requestUser = requirePermission(db, req, res, config.viewPermission);
  if (!requestUser) return;
  const rows = db.kcfxFeedbacks
    .filter((item) => item.type === config.key)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json({ ok: true, type: config.key, rows });
});

app.post('/api/kcfx-feedback/:type', async (req, res) => {
  const config = feedbackTypeConfig(req.params.type);
  if (!config) return res.status(400).json({ error: 'invalid feedback type' });
  const db = await initDb(dataDir);
  const requestUser = resolveFeedbackSubmitUser(db, req, { findValidSession, resolveRequestUser, isUserApproved });
  if (!requestUser) return res.status(403).json({ error: 'permission denied' });
  const row = normalizeFeedbackRow(config.key, req.body, requestUser, format);
  if (!row.feedback) return res.status(400).json({ error: 'missing feedback' });
  db.kcfxFeedbacks.push(row);
  pushLog(db, `${config.label}提交`, requestUser.name, `${requestUser.name} 提交${config.label}：${row.rowSummary || row.rowKey || row.id}`);
  await db.save();
  res.json({ ok: true, row });
});

async function buildSalesRowsPayload(db, { force = false } = {}) {
  const records = {};
  for (const id of SALES_ROW_RECORD_IDS) {
    const source = db.kcfxLibrary.records[id] || await recoverKcfxRecordFromRowsFile(id);
    if (!source) {
      records[id] = { id, rows: [] };
      continue;
    }
    const record = await ensureKcfxRecordRows(db, id, source);
    records[id] = await attachKcfxRecordRows(record);
  }

  const key = [
    db.kcfxLibrary?.savedAt || '',
    ...SALES_ROW_RECORD_IDS.map((id) => {
      const record = records[id] || {};
      return `${id}:${record.rowsSavedAt || record.serverSavedAt || record.savedAt || record.appliedAt || ''}:${record.rowCount || record.rows?.length || 0}`;
    })
  ].join('|');

  if (!force && salesRowsPayloadCache.key === key && salesRowsPayloadCache.payload) {
    return salesRowsPayloadCache.payload;
  }

  const rows = getCachedSalesRows(records).map((row) => ({
    salesMonth: row.salesMonth || '',
    salesYear: row.salesYear || '',
    salesMonthNumber: row.salesMonthNumber || '',
    salesOrg: row.salesOrg || '',
    customer: row.customer || '',
    storeShortName: row.storeShortName || '',
    salesDepartmentKey: row.salesDepartmentKey || '',
    materialCode: row.materialCode || '',
    materialName: row.materialName || '',
    productLine: row.productLine || '',
    productCategory: row.productCategory || '',
    productSeries: row.productSeries || '',
    model: row.model || '',
    qty: Number(row.qty) || 0,
    storeMatchStatus: row.storeMatchStatus || ''
  }));

  const payload = {
    ok: true,
    status: 'ready',
    source: 'server-sales-rows',
    savedAt: db.kcfxLibrary?.savedAt || '',
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows,
    records: Object.fromEntries(SALES_ROW_RECORD_IDS.map((id) => {
      const { rows: _rows, ...record } = records[id] || { id };
      return [id, record];
    }))
  };
  salesRowsPayloadCache = { key, payload };
  return payload;
}

app.get('/api/kcfx-library', async (req, res) => {
  const db = await initDb(dataDir);
  await externalizeKcfxLibraryInlineRows(db);
  const library = publicKcfxLibrary(db);
  return res.json({
    ...library,
    records: Object.values(library.records || {})
  });
});

app.get('/api/kcfx-library/preloaded', async (req, res) => {
  try {
    const targetIds = normalizeKcfxIds(req.query.ids);
    res.setHeader('Cache-Control', 'no-store');
    if (targetIds) {
      if (kcfxPreloadCacheHasIds(app.locals.gongying.kcfxPreloadCache, targetIds)) {
        return res.json(filterKcfxPreloadCacheByIds(app.locals.gongying.kcfxPreloadCache, [...targetIds].join(',')));
      }
      if (kcfxTargetIdsArePriority(targetIds)) {
        if (!app.locals.gongying.kcfxPreloadPromise) scheduleKcfxPreloadRefresh();
        if (app.locals.gongying.kcfxPreloadPromise) {
          const cachedPayload = await Promise.race([
            app.locals.gongying.kcfxPreloadPromise.then(() => (
              kcfxPreloadCacheHasIds(app.locals.gongying.kcfxPreloadCache, targetIds)
                ? filterKcfxPreloadCacheByIds(app.locals.gongying.kcfxPreloadCache, [...targetIds].join(','))
                : null
            )),
            new Promise((resolve) => setTimeout(() => resolve(null), 1500))
          ]);
          if (cachedPayload) return res.json(cachedPayload);
        }
        return res.json(kcfxPreloadLoadingResponse(targetIds));
      }
      const payload = await buildPreloadedKcfxLibrary(null, { targetIds });
      return res.json(payload);
    }
    if (req.query.refresh === '1' || app.locals.gongying.kcfxPreloadCache.status === 'idle' || app.locals.gongying.kcfxPreloadCache.status === 'failed') {
      scheduleKcfxPreloadRefresh();
    }
    res.json(filterKcfxPreloadCacheByIds(app.locals.gongying.kcfxPreloadCache, req.query.ids));
  } catch (error) {
    res.status(500).json({
      ...app.locals.gongying.kcfxPreloadCache,
      ok: false,
      status: 'failed',
      error: error?.message || String(error)
    });
  }
});

app.get('/api/kcfx-library/receipt-summary', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getKcfxReceiptSummaryResponse());
  } catch (error) {
    res.status(500).json({
      ok: false,
      status: 'failed',
      source: 'server-receipt-summary',
      error: error?.message || String(error)
    });
  }
});

app.get('/api/kcfx-library/trend-summary', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getKcfxTrendSummaryResponse());
  } catch (error) {
    res.status(500).json({
      ok: false,
      status: 'failed',
      error: error?.message || String(error)
    });
  }
});

app.get('/api/kcfx-library/sales-rows', async (req, res) => {
  try {
    const db = await initDb(dataDir);
    res.setHeader('Cache-Control', 'no-store');
    res.json(await buildSalesRowsPayload(db, { force: req.query.refresh === '1' }));
  } catch (error) {
    res.status(500).json({
      ok: false,
      status: 'failed',
      source: 'server-sales-rows',
      error: error?.message || String(error)
    });
  }
});

app.get('/api/kcfx-library/records/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const id = String(req.params.id || '').trim();
  let record = db.kcfxLibrary.records[id] || await recoverKcfxRecordFromRowsFile(id);
  if (!record) return res.status(404).json({ error: 'record not found' });
  record = await ensureKcfxRecordRows(db, id, record);
  if (Array.isArray(record.rows)) {
    record = await externalizeKcfxRecordRows(record, id);
    db.kcfxLibrary.records[id] = record;
    db.kcfxLibrary.savedAt = new Date().toISOString();
    await db.save();
  }
  res.json({ ok: true, record: await attachKcfxRecordRows(record) });
});

app.post('/api/kcfx-library/records/:id/upload', upload.single('file'), async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) {
    if (req.file) await removeUploadedFile(req.file.filename);
    return;
  }
  const id = String(req.params.id || '').trim();
  if (!KC_LIBRARY_SLOT_IDS.has(id)) {
    if (req.file) await removeUploadedFile(req.file.filename);
    return res.status(400).json({ error: 'invalid slot' });
  }
  if (!req.file) return res.status(400).json({ error: 'missing file' });
  req.file.originalname = normalizeUploadedFileName(req.file.originalname);
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(req.file.originalname || '')) {
    await removeUploadedFile(req.file.filename);
    return res.status(400).json({ error: 'unsupported file type' });
  }

  const previousRecord = db.kcfxLibrary.records[id];
  let storedFile = null;
  try {
    const slot = parseKcfxSlotPayload(id, req.body.slot);
    storedFile = await saveKcfxOriginalFile(id, req.file);
    const clientRecord = parseKcfxClientRecordPayload(req.body.record);
    if (clientRecord) {
      const record = await externalizeKcfxRecordRows(buildKcfxClientParsedFileRecord(req.file, storedFile, slot, clientRecord), id);
      db.kcfxLibrary.records[id] = {
        ...record,
        serverSavedAt: new Date().toISOString(),
        serverSavedBy: requestUser.name
      };
      db.kcfxLibrary.savedAt = new Date().toISOString();
      await removeKcfxStoredFile(previousRecord);
      pushLog(db, 'kcfx file library uploaded', requestUser.name, `${requestUser.name} uploaded browser-parsed ${record.title || id}`);
      await db.save();
      scheduleKcfxPreloadRefresh(db);
      scheduleKcfxReceiptSummaryRefresh(db);
      scheduleKcfxTrendSummaryRefresh();
      return res.json({ ok: true, parsedOnClient: true, library: publicKcfxLibrary(db), record: db.kcfxLibrary.records[id] });
    }
    const queuedRecord = buildQueuedKcfxFileRecord(req.file, storedFile, slot, previousRecord, requestUser.name);
    db.kcfxLibrary.records[id] = queuedRecord;
    db.kcfxLibrary.savedAt = new Date().toISOString();
    pushLog(db, 'kcfx file library uploaded', requestUser.name, `${requestUser.name} uploaded ${queuedRecord.title || id}, background parse queued`);
    await db.save();
    res.status(202).json({ ok: true, queued: true, library: publicKcfxLibrary(db), record: db.kcfxLibrary.records[id] });
    scheduleKcfxFileParse({
      id,
      slot,
      file: {
        originalname: req.file.originalname,
        size: req.file.size
      },
      storedFile,
      previousRecord,
      requestUserName: requestUser.name
    });
    return;
  } catch (error) {
    if (storedFile?.fullPath) {
      try {
        await unlink(storedFile.fullPath);
      } catch {}
    } else if (req.file) {
      await removeUploadedFile(req.file.filename);
    }
    res.status(400).json({ error: error?.message || 'parse failed' });
  }
});

app.put('/api/kcfx-library/records/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) return;
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing id' });
  const record = await externalizeKcfxRecordRows(sanitizeKcfxLibraryRecord(id, req.body.record || req.body), id);
  db.kcfxLibrary.records[id] = {
    ...record,
    serverSavedAt: new Date().toISOString(),
    serverSavedBy: requestUser.name
  };
  db.kcfxLibrary.savedAt = new Date().toISOString();
  pushLog(db, '文件库更新', requestUser.name, `${requestUser.name} 更新销售及库存看板文件库：${record.title || id}`);
  await db.save();
  scheduleKcfxPreloadRefresh(db);
  scheduleKcfxReceiptSummaryRefresh(db);
  scheduleKcfxTrendSummaryRefresh();
  res.json({ ok: true, library: publicKcfxLibrary(db), record: db.kcfxLibrary.records[id] });
});

app.delete('/api/kcfx-library/records/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) return;
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'missing id' });
  await removeKcfxStoredFile(db.kcfxLibrary.records[id]);
  await removeKcfxRecordRows(db.kcfxLibrary.records[id] || { id });
  delete db.kcfxLibrary.records[id];
  db.kcfxLibrary.savedAt = new Date().toISOString();
  pushLog(db, '文件库删除', requestUser.name, `${requestUser.name} 删除销售及库存看板文件库：${id}`);
  await db.save();
  scheduleKcfxPreloadRefresh(db);
  scheduleKcfxReceiptSummaryRefresh(db);
  scheduleKcfxTrendSummaryRefresh();
  res.status(204).end();
});
}
