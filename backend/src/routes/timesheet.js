const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { isModuleEnabled } = require('../services/orgModules');
const { OPTION_GROUPS, fail, todayLocal, permissionsFor } = require('../services/timesheetRules');
const {
  db, isDuplicateKey, route, positive, resolveRole, requireTimesheet, requirePermission, getSettings,
  ensureDefaultOptions, getOptions, orgMembers,
} = require('./timesheetSupport');

router.use(authenticate);

// Lightweight check for the sidebar. Never fails the shell: errors simply mean "not enabled".
router.get('/status', async (req, res) => {
  try {
    const role = await resolveRole(req);
    const enabled = Boolean(role) && await isModuleEnabled(req.orgId, 'timesheet');
    res.json({ enabled, role: enabled ? role : null });
  } catch (error) {
    res.json({ enabled: false, role: null });
  }
});

router.use(requireTimesheet);

const canManageClients = (role) => permissionsFor(role).manage_clients;
const canSetup = (role) => permissionsFor(role).setup;

router.get('/config', route(async (req, res) => {
  await ensureDefaultOptions(req.orgId, req.userId);
  const [settings, options, members, clientRows] = await Promise.all([
    getSettings(req.orgId),
    getOptions(req.orgId),
    orgMembers(req.orgId),
    db.execute('SELECT id, name FROM timesheet_clients WHERE org_id = ? AND is_active = 1 ORDER BY name ASC', [req.orgId]),
  ]);
  let pendingUnlocks = 0;
  if (permissionsFor(req.tsRole).approve_unlocks) {
    const [[row]] = await db.execute("SELECT COUNT(*) AS total FROM timesheet_unlock_requests WHERE org_id = ? AND status = 'PENDING'", [req.orgId]);
    pendingUnlocks = Number(row.total);
  }
  res.json({
    role: req.tsRole,
    user_id: req.userId,
    today: todayLocal(),
    permissions: permissionsFor(req.tsRole),
    settings,
    options,
    clients: clientRows[0],
    users: members.map(({ id, name }) => ({ id, name })),
    pending_unlocks: pendingUnlocks,
  });
}));

/* Clients: managers and admins only. Employees only see active clients through /config. */
router.get('/clients', requirePermission(canManageClients, 'Only managers and admins can manage clients'), route(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT c.id, c.name, c.is_active,
       (SELECT COUNT(*) FROM timesheet_entries e WHERE e.client_id = c.id AND e.org_id = c.org_id AND e.is_deleted = 0) AS entry_count,
       (SELECT COALESCE(SUM(l.hours), 0) FROM timesheet_time_logs l JOIN timesheet_entries e ON e.id = l.entry_id
          WHERE e.client_id = c.id AND e.org_id = c.org_id AND e.is_deleted = 0 AND l.is_deleted = 0) AS total_hours
     FROM timesheet_clients c WHERE c.org_id = ? ORDER BY c.is_active DESC, c.name ASC`,
    [req.orgId]
  );
  res.json(rows);
}));

function clientName(value) {
  if (typeof value !== 'string' || !value.trim()) throw fail(422, 'Client name is required');
  if (value.trim().length > 255) throw fail(422, 'Client name must be at most 255 characters');
  return value.trim();
}

router.post('/clients', requirePermission(canManageClients, 'Only managers and admins can add clients'), route(async (req, res) => {
  const name = clientName(req.body.name);
  try {
    const [result] = await db.execute('INSERT INTO timesheet_clients (org_id, name, created_by) VALUES (?, ?, ?)', [req.orgId, name, req.userId]);
    res.status(201).json({ id: result.insertId, name, is_active: true });
  } catch (error) {
    if (isDuplicateKey(error)) throw fail(409, 'A client with this name already exists');
    throw error;
  }
}));

router.put('/clients/:id', requirePermission(canManageClients, 'Only managers and admins can change clients'), route(async (req, res) => {
  const id = positive(req.params.id, 'client');
  const updates = [], params = [];
  if (req.body.name !== undefined) { updates.push('name = ?'); params.push(clientName(req.body.name)); }
  if (req.body.is_active !== undefined) {
    if (typeof req.body.is_active !== 'boolean') throw fail(422, 'is_active must be true or false');
    updates.push('is_active = ?'); params.push(req.body.is_active);
  }
  if (!updates.length) throw fail(422, 'Nothing to update');
  try {
    const [result] = await db.execute(
      `UPDATE timesheet_clients SET ${updates.join(', ')}, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?`,
      [...params, id, req.orgId]
    );
    if (!result.affectedRows) throw fail(404, 'Client not found');
    res.json({ id });
  } catch (error) {
    if (isDuplicateKey(error)) throw fail(409, 'A client with this name already exists');
    throw error;
  }
}));

/* Setup: dropdown options and the edit-lock window. Admins only. */
router.get('/options', requirePermission(canSetup, 'Only admins can change timesheet setup'), route(async (req, res) => {
  res.json(await getOptions(req.orgId, true));
}));

router.post('/options', requirePermission(canSetup, 'Only admins can change timesheet setup'), route(async (req, res) => {
  const group = String(req.body.option_group || '');
  if (!OPTION_GROUPS.includes(group)) throw fail(422, 'Unknown option group');
  const label = typeof req.body.label === 'string' ? req.body.label.trim() : '';
  if (!label || label.length > 120) throw fail(422, 'Option must be 1 to 120 characters');
  // Re-adding a removed option brings the old one back instead of creating a duplicate.
  const [reactivated] = await db.execute(
    'UPDATE timesheet_options SET is_active = 1 WHERE org_id = ? AND option_group = ? AND label = ?',
    [req.orgId, group, label]
  );
  if (reactivated.affectedRows) return res.json({ message: 'Option restored' });
  try {
    await db.execute(
      `INSERT INTO timesheet_options (org_id, option_group, label, sort_order, created_by)
       SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, ? FROM timesheet_options WHERE org_id = ? AND option_group = ?`,
      [req.orgId, group, label, req.userId, req.orgId, group]
    );
  } catch (error) {
    if (isDuplicateKey(error)) throw fail(409, 'This option already exists');
    throw error;
  }
  res.status(201).json({ message: 'Option added' });
}));

// Options are switched off, never deleted, so old entries keep their saved value.
router.patch('/options/:id', requirePermission(canSetup, 'Only admins can change timesheet setup'), route(async (req, res) => {
  const id = positive(req.params.id, 'option');
  if (typeof req.body.is_active !== 'boolean') throw fail(422, 'is_active must be true or false');
  const [result] = await db.execute('UPDATE timesheet_options SET is_active = ? WHERE id = ? AND org_id = ?', [req.body.is_active, id, req.orgId]);
  if (!result.affectedRows) throw fail(404, 'Option not found');
  res.json({ id });
}));

router.put('/settings', requirePermission(canSetup, 'Only admins can change timesheet setup'), route(async (req, res) => {
  const lockDays = Number(req.body.lock_days), unlockDays = Number(req.body.unlock_days);
  if (!Number.isInteger(lockDays) || lockDays < 1 || lockDays > 365) throw fail(422, 'Edit window must be 1 to 365 days', { lock_days: 'Enter a whole number from 1 to 365.' });
  if (!Number.isInteger(unlockDays) || unlockDays < 1 || unlockDays > 90) throw fail(422, 'Unlock length must be 1 to 90 days', { unlock_days: 'Enter a whole number from 1 to 90.' });
  await db.execute(
    `MERGE timesheet_settings WITH (HOLDLOCK) AS target
     USING (SELECT ? AS org_id) AS source ON target.org_id = source.org_id
     WHEN MATCHED THEN UPDATE SET lock_days = ?, unlock_days = ?, updated_by = ?, updated_at = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (org_id, lock_days, unlock_days, updated_by) VALUES (source.org_id, ?, ?, ?);`,
    [req.orgId, lockDays, unlockDays, req.userId, lockDays, unlockDays, req.userId]
  );
  res.json({ lock_days: lockDays, unlock_days: unlockDays });
}));

router.use('/', require('./timesheetEntries'));

module.exports = router;
