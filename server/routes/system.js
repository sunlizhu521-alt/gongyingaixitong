import { randomUUID } from 'node:crypto';

const crypto = { randomUUID };

export default function registerSystemRoutes(app, db) {
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

app.get('/api/settings', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = resolveRequestUser(db, req.query);
  res.json(publicSettingsForUser(db.settings, requestUser));
});

app.patch('/api/settings', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) return;
  db.settings.senderEmail = String(req.body.senderEmail || '').trim();
  if (Object.prototype.hasOwnProperty.call(req.body, 'smtpPassword')) {
    const smtpPassword = String(req.body.smtpPassword || '').trim();
    if (smtpPassword) db.settings.smtpPassword = smtpPassword;
  }
  await db.save();
  res.json(publicSettingsForUser(db.settings, requestUser));
});

app.get('/api/system-file-library', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) return;
  const packages = await Promise.all(SYSTEM_FILE_PACKAGES.map(async (item) => ({
    ...item,
    ...(await packageStats(item.id, db))
  })));
  res.json(packages);
});

app.get('/api/system-file-library/:id/download', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) return;
  const packageInfo = SYSTEM_FILE_PACKAGES.find((item) => item.id === req.params.id);
  if (!packageInfo) return res.status(404).json({ error: 'package not found' });
  const files = await buildSystemPackageFiles(packageInfo.id, db, true);
  const buffer = makeZip(files);
  const asciiFallback = packageInfo.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(packageInfo.fileName)}`
  );
  res.send(buffer);
});
}
