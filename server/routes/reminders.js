import { randomUUID } from 'node:crypto';

const crypto = { randomUUID };

export default function registerReminderRoutes(app, db) {
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

app.get('/api/reminders', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = resolveRequestUser(db, req.query);
  if (canSeeAllRole(requestUser?.role)) return res.json(db.reminders);
  res.json(db.reminders.filter((item) => item.target === requestUser?.name));
});

app.get('/api/reminders/weekly-payment-preview', async (req, res) => {
  const db = await initDb(dataDir);
  const { start, end, rows } = weeklyPaymentApplications(db, new Date());
  res.json({
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    groups: groupInvoicesByOwner(db, rows).map((group) => ({
      owner: group.owner,
      email: group.email,
      count: group.invoices.length,
      invoices: group.invoices.map((invoice) => ({
        invoiceNo: invoice.invoiceNo,
        supplier: invoice.supplier,
        amount: invoice.amount,
        issueDate: invoice.issueDate,
        paymentDate: invoice.paymentDate,
        status: invoice.status
      }))
    }))
  });
});
}
