import { randomUUID } from 'node:crypto';

const crypto = { randomUUID };

export default function registerQualityRoutes(app, db) {
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

app.get('/api/quality-inspection/initial-data', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requirePermission(db, req, res, 'qualityInspection.inspectionInitialData')) return;
  res.json(db.qualityInspection.initialData);
});

app.post('/api/quality-inspection/initial-data/import', upload.single('file'), async (req, res) => {
  const db = await initDb(dataDir);
  if (!req.file) return res.status(400).json({ error: 'missing file' });
  if (!requirePermission(db, req, res, 'qualityInspection.inspectionInitialData')) {
    await removeUploadedFile(req.file.filename);
    return;
  }

  try {
    const result = parseGenericWorkbook(req.file.path);
    db.qualityInspection.initialData = {
      sheetName: result.sheetName,
      columns: result.columns,
      rows: result.rows,
      updatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
    };
    await db.save();
    res.json({
      ...db.qualityInspection.initialData,
      importedCount: result.importedCount
    });
  } finally {
    await removeUploadedFile(req.file.filename);
  }
});

app.get('/api/quality-inspection/notices', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requirePermission(db, req, res, 'qualityInspection.inspectionNotice')) return;
  res.json(db.qualityInspection.notices);
});

app.post('/api/quality-inspection/notices', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requirePermission(db, req, res, 'qualityInspection.inspectionNotice');
  if (!requestUser) return;
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  db.qualityInspection.notices = {
    rows: rows.map((row, index) => ({
      id: row.id || crypto.randomUUID(),
      rowNumber: index + 1,
      ...row
    })),
    submittedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    submittedBy: requestUser.name
  };
  pushLog(db, '验货通知提交', requestUser.name, `${requestUser.name} 提交验货通知 ${rows.length} 条。`);
  await db.save();
  res.json(db.qualityInspection.notices);
});
}
