import { randomUUID } from 'node:crypto';

const crypto = { randomUUID };

export default function registerInvoiceRoutes(app, db) {
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

app.get('/api/invoices', async (req, res) => {
  const db = await initDb(dataDir);
  res.json(visibleRows(db.invoices, db, req.query));
});

app.patch('/api/invoices/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = resolveRequestUser(db, req.body);
  const invoice = db.invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'not found' });
  if (!canAccessRow(invoice, requestUser)) return res.status(403).json({ error: 'forbidden' });
  if (Object.prototype.hasOwnProperty.call(req.body, 'oaProcessNo')) {
    invoice.oaProcessNo = String(req.body.oaProcessNo || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'isOaPrinted')) {
    invoice.isOaPrinted = req.body.isOaPrinted === '是' ? '是' : '否';
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'isPaid')) {
    invoice.isPaid = req.body.isPaid === '是' ? '是' : '';
  }
  if (!Object.prototype.hasOwnProperty.call(req.body, 'oaProcessNo') &&
      !Object.prototype.hasOwnProperty.call(req.body, 'isOaPrinted') &&
      !Object.prototype.hasOwnProperty.call(req.body, 'isPaid')) {
    invoice.status = req.body.status || invoice.status;
  } else {
    invoice.status = deriveInvoiceStatus(invoice);
  }
  db.reminders.unshift({
    id: crypto.randomUUID(),
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    type: '状态更新',
    target: invoice.owner,
    content: `${invoice.supplier} 发票 ${invoice.invoiceNo} 状态更新为：${invoice.status}`
  });
  await db.save();
  res.json(invoice);
});

app.delete('/api/invoices/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requirePermission(db, req, res, 'systemFileLibrary.invoiceInventory');
  if (!requestUser) return;
  const invoice = db.invoices.find((item) => item.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'not found' });
  db.invoices.remove((item) => item.id === req.params.id);
  await removeUploadedFile(invoice.fileName);
  db.reminders.unshift({
    id: crypto.randomUUID(),
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    type: '发票库存删除',
    target: requestUser.name,
    content: `${requestUser.name} 删除了 ${invoice.supplier} 发票 ${invoice.invoiceNo || invoice.id}。`
  });
  await db.save();
  res.status(204).end();
});

app.get('/api/drafts', async (req, res) => {
  const db = await initDb(dataDir);
  res.json(visibleRows(db.drafts, db, req.query));
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = resolveRequestUser(db, req.body);
  if (!requestUser) return res.status(401).json({ error: 'invalid user' });
  const user = requestUser.name;
  const recognized = await Promise.all(req.files.map((file) => recognizeInvoice(file, db, user)));
  const existingInvoiceNos = new Set(
    [...db.drafts, ...db.invoices]
      .map((item) => item.invoiceNo)
      .filter(Boolean)
  );
  const keptInvoiceNos = new Set();
  const drafts = [];
  const duplicates = [];

  for (const draft of recognized) {
    const invoiceNo = draft.invoiceNo;
    if (invoiceNo && (existingInvoiceNos.has(invoiceNo) || keptInvoiceNos.has(invoiceNo))) {
      duplicates.push({
        invoiceNo,
        supplier: draft.supplier,
        originalName: draft.originalName
      });
      await removeUploadedFile(draft.fileName);
      continue;
    }
    drafts.push(draft);
    if (invoiceNo) keptInvoiceNos.add(invoiceNo);
  }

  db.drafts.unshift(...drafts);
  drafts.forEach((draft) => db.reminders.unshift({
    id: crypto.randomUUID(),
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    type: 'OCR 核对提醒',
    target: draft.owner,
    content: `${draft.originalName} 已上传，请核对 OCR 识别结果。`
  }));
  await db.save();
  res.json({ created: drafts, duplicates });
});

app.post('/api/drafts/reprocess', async (req, res) => {
  const db = await initDb(dataDir);
  const results = [];
  for (const draft of db.drafts) {
    try {
      results.push(await reprocessDraft(draft, db));
    } catch {
      results.push(draft);
    }
  }
  await db.save();
  res.json(results);
});

app.post('/api/drafts/:id/confirm', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = resolveRequestUser(db, req.body);
  const index = db.drafts.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'not found' });
  if (!canAccessRow(db.drafts[index], requestUser)) return res.status(403).json({ error: 'forbidden' });
  const draft = db.drafts.splice(index, 1)[0];
  const invoice = {
    ...draft,
    status: '待提交付款申请',
    dueDate: calculateDueDate(db, draft.supplier, draft.issueDate)
  };
  db.invoices.unshift(invoice);
  db.reminders.unshift({
    id: crypto.randomUUID(),
    createdAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    type: '付款申请提醒',
    target: invoice.owner,
    content: `${invoice.supplier} 发票 ${invoice.invoiceNo} 请在 ${invoice.dueDate} 前提交 OA 付款申请。`
  });
  await db.save();
  res.json(invoice);
});

app.delete('/api/drafts/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = resolveRequestUser(db, req.query);
  const draft = db.drafts.find((item) => item.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'not found' });
  if (!canAccessRow(draft, requestUser)) return res.status(403).json({ error: 'forbidden' });
  db.drafts.remove((item) => item.id === req.params.id);
  await db.save();
  res.status(204).end();
});
}
