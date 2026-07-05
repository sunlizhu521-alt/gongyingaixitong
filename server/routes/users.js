import { randomUUID } from 'node:crypto';

const crypto = { randomUUID };

export default function registerUserRoutes(app, db) {
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

app.get('/api/users', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requireSystemOwner(db, req, res)) return;
  res.json(db.users.map(publicUser));
});

app.get('/api/user-login-logs', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requireSystemOwner(db, req, res)) return;
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
  const rows = [...(db.loginLogs || [])]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
  res.json(rows);
});

app.post('/api/users', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requireSystemOwner(db, req, res)) return;
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'missing name' });
  if (db.users.some((item) => item.name === name)) return res.status(409).json({ error: 'user exists' });
  const user = normalizeUser({
    id: crypto.randomUUID(),
    name,
    password: req.body.password || '123456',
    role: req.body.role || ROLE_USER,
    permissions: Array.isArray(req.body.permissions) ? req.body.permissions : DEFAULT_PERMISSIONS,
    status: USER_STATUS_APPROVED
  });
  db.users.push(user);
  await db.save();
  res.json(publicUser(user));
});

app.patch('/api/users/:id', async (req, res) => {
  const db = await initDb(dataDir);
  const requestUser = requireSystemOwner(db, req, res);
  if (!requestUser) return;
  const target = db.users.find((item) => item.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'not found' });

  if (target.name !== SYSTEM_OWNER_NAME) {
    if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      target.role = req.body.role === ROLE_FINANCE ? ROLE_FINANCE : ROLE_USER;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'permissions')) {
      target.permissions = sanitizePermissions(req.body.permissions);
    }
    if (String(req.body.password || '').trim()) {
      target.password = String(req.body.password).trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      target.status = req.body.status === USER_STATUS_PENDING ? USER_STATUS_PENDING : USER_STATUS_APPROVED;
    }
  }

  const normalized = normalizeUser(target);
  Object.assign(target, normalized);
  await db.save();
  res.json(publicUser(target));
});

app.delete('/api/users/:id', async (req, res) => {
  const db = await initDb(dataDir);
  if (!requireSystemOwner(db, req, res)) return;
  const target = db.users.find((item) => item.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'not found' });
  if (target.name === SYSTEM_OWNER_NAME) return res.status(400).json({ error: 'cannot delete system owner' });

  db.users.remove((item) => item.id === target.id);
  const userSessions = db.sessions.filter((session) => session.userId === target.id);
  for (const session of userSessions) db.sessions.remove((item) => item.id === session.id);
  pushLog(db, '删除账号', SYSTEM_OWNER_NAME, `${target.name} 账号已删除。`, '系统管理', '权限管理');
  await db.save();
  res.json({ ok: true, id: target.id });
});
}
