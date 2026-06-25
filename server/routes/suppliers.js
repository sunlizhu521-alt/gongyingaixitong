import { randomUUID } from 'node:crypto';

const crypto = { randomUUID };

export default function registerSupplierRoutes(app, db) {
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

app.get('/api/suppliers', async (req, res) => {
  const db = await initDb(dataDir);
  res.json(db.suppliers);
});

app.post('/api/suppliers', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requirePermission(db, req, res, 'maintenanceLibrary.supplierManagement')) return;
  const supplier = { id: crypto.randomUUID(), name: req.body.name, termDays: Number(req.body.termDays || 30) };
  db.suppliers.unshift(supplier);
  await db.save();
  res.json(supplier);
});

app.post('/api/suppliers/import-terms', upload.single('file'), async (req, res) => {
  const db = await initDb(dataDir);
  if (!req.file) return res.status(400).json({ error: 'missing file' });
  if (!requirePermission(db, req, res, 'maintenanceLibrary.supplierManagement')) {
    await removeUploadedFile(req.file.filename);
    return;
  }

  try {
    const result = parseSupplierTermWorkbook(req.file.path);
    const byName = new Map();

    result.imported.forEach((item) => {
      byName.set(item.supplier, {
        id: crypto.randomUUID(),
        name: item.supplier,
        shortName: item.shortName,
        termDays: item.termDays,
        hasAnnualFrame: item.hasAnnualFrame,
        remark: item.remark
      });
    });

    db.suppliers.splice(0, db.suppliers.length);
    for (const supplier of byName.values()) db.suppliers.push(supplier);
    await db.save();
    res.json({
      sheetName: result.sheetName,
      importedCount: result.imported.length,
      failedCount: result.failed.length,
      imported: result.imported,
      failed: result.failed,
      suppliers: db.suppliers
    });
  } finally {
    await removeUploadedFile(req.file.filename);
  }
});

app.get('/api/owners', async (req, res) => {
  const db = await initDb(dataDir);
  res.json(db.owners);
});

app.post('/api/owners', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requirePermission(db, req, res, 'maintenanceLibrary.supplierManagement')) return;
  const owner = { id: crypto.randomUUID(), owner: req.body.owner, supplier: req.body.supplier };
  db.owners.unshift(owner);
  await db.save();
  res.json(owner);
});

app.post('/api/owners/import', upload.single('file'), async (req, res) => {
  const db = await initDb(dataDir);
  if (!req.file) return res.status(400).json({ error: 'missing file' });
  if (!requirePermission(db, req, res, 'maintenanceLibrary.supplierManagement')) {
    await removeUploadedFile(req.file.filename);
    return;
  }

  try {
    const result = parseOwnerWorkbook(req.file.path);
    const bySupplier = new Map();

    result.imported.forEach((item) => {
      bySupplier.set(item.supplier, {
        id: crypto.randomUUID(),
        owner: item.owner,
        supplier: item.supplier,
        email: item.email
      });
    });

    db.owners.splice(0, db.owners.length);
    for (const owner of bySupplier.values()) db.owners.push(owner);
    await db.save();
    res.json({
      sheetName: result.sheetName,
      importedCount: result.imported.length,
      failedCount: result.failed.length,
      imported: result.imported,
      failed: result.failed,
      owners: db.owners
    });
  } finally {
    await removeUploadedFile(req.file.filename);
  }
});
}
