const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { isModuleEnabled } = require('../services/orgModules');
const { OPTION_GROUPS, fail, todayLocal, permissionsFor } = require('../services/timesheetRules');
const {
  db, isDuplicateKey, route, positive, resolveRole, requireTimesheet, requirePermission, getSettings,
  ensureDefaultOptions, getOptions, orgMembers, taskScope, effectiveLayout,
} = require('./timesheetSupport');
const { syncClientLists, timesheetClientId } = require('../services/orgClients');
const { normalizeTimesheetLayout } = require('../services/timesheetFormLayout');

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
  await Promise.all([ensureDefaultOptions(req.orgId, req.userId), syncClientLists(req.orgId, req.userId, { toTimesheet: true })]);
  const [settings, options, members, clientRows, form, agentRows] = await Promise.all([
    getSettings(req.orgId),
    getOptions(req.orgId),
    orgMembers(req.orgId),
    // Only clients that are on in Settings → Clients.
    db.execute(
      `SELECT tc.id, tc.name, oc.agent_id FROM timesheet_clients tc JOIN org_clients oc ON oc.org_id = tc.org_id AND oc.name = tc.name
       WHERE tc.org_id = ? AND oc.is_active = 1 ORDER BY tc.name ASC`, [req.orgId]),
    effectiveLayout(req.orgId),
    db.execute('SELECT id, name FROM org_agents WHERE org_id = ? AND is_active = 1 ORDER BY name ASC', [req.orgId]),
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
    agents: agentRows[0],
    users: members.map(({ id, name }) => ({ id, name })),
    pending_unlocks: pendingUnlocks,
    form,
  });
}));

/* Tasks people can log time against, open ones and their own first. */
router.get('/tasks', route(async (req, res) => {
  const { where, params } = taskScope(req);
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[[%_]/g, (c) => `[${c}]`)}%`;
    where.push('(t.title LIKE ? OR t.client_name LIKE ? OR CAST(t.id AS VARCHAR(12)) = ?)');
    params.push(like, like, q.replace(/^#/, ''));
  }
  if (req.query.id) { where.push('t.id = ?'); params.push(positive(req.query.id, 'task')); }
  const [rows] = await db.execute(
    `SELECT TOP 50 t.id, t.title, t.client_name, t.status, CONVERT(VARCHAR(10), t.due_date, 23) AS due_date,
       t.assigned_to, u.name AS assigned_to_name, te.name AS team_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN teams te ON te.id = t.team_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END, CASE WHEN t.assigned_to = ? THEN 0 ELSE 1 END, t.id DESC`,
    [...params, req.userId]
  );
  res.json(rows);
}));

function clientName(value) {
  if (typeof value !== 'string' || !value.trim()) throw fail(422, 'Client name is required');
  if (value.trim().length > 255) throw fail(422, 'Client name must be at most 255 characters');
  return value.trim().replace(/\s+/g, ' ');
}

// "+ New client" in the timesheet form adds to Settings → Clients (the one list) and returns the timesheet row.
router.post('/clients', requirePermission(canManageClients, 'Only managers and admins can add clients'), route(async (req, res) => {
  const name = clientName(req.body.name);
  let created = true;
  const agentId = req.body.agent_id ? positive(req.body.agent_id, 'agent') : null;
  if (agentId) {
    const [[agent]] = await db.execute('SELECT id FROM org_agents WHERE id = ? AND org_id = ? AND is_active = 1', [agentId, req.orgId]);
    if (!agent) throw fail(422, 'Pick an agent from the list');
  }
  try { await db.execute('INSERT INTO org_clients (org_id, name, created_by, agent_id) VALUES (?, ?, ?, ?)', [req.orgId, name, req.userId, agentId]); }
  catch (error) { if (!isDuplicateKey(error)) throw error; created = false; }
  const [[listed]] = await db.execute('SELECT name, is_active FROM org_clients WHERE org_id = ? AND name = ?', [req.orgId, name]);
  if (listed && !Number(listed.is_active)) throw fail(409, `${listed.name} is turned off in Settings → Clients. Turn it on there first.`);
  const row = await timesheetClientId(req.orgId, listed?.name || name, req.userId);
  res.status(created ? 201 : 200).json({ id: row.id, name: row.name, is_active: true });
}));

/* The customised Timesheet form (Settings → Form designer → Timesheet form). Managers and admins. */
router.get('/form', route(async (req, res) => {
  const layout = await effectiveLayout(req.orgId);
  res.json({ layout, version: layout.version || 0, saved: !layout.is_default, can_edit: canManageClients(req.tsRole) });
}));

router.put('/form', requirePermission(canManageClients, 'Only managers and admins can change the timesheet form'), route(async (req, res) => {
  const layout = normalizeTimesheetLayout(req.body?.layout);
  const definition = JSON.stringify(layout);
  const expected = Number(req.body?.version || 0);
  const [[existing]] = await db.execute('SELECT version FROM timesheet_form_layouts WHERE org_id = ?', [req.orgId]);
  const conflict = 'Someone else changed the form while you were editing. Reload to see their version.';
  if ((existing ? Number(existing.version) : 0) !== expected) throw fail(409, conflict);
  if (existing) {
    const [result] = await db.execute(
      'UPDATE timesheet_form_layouts SET definition = ?, version = version + 1, updated_by = ?, updated_at = SYSDATETIME() WHERE org_id = ? AND version = ?',
      [definition, req.userId, req.orgId, expected]);
    if (!result.affectedRows) throw fail(409, conflict);
  } else {
    // Keyed by org_id (no id column), so return that instead of the default INSERTED.id.
    await db.execute('INSERT INTO timesheet_form_layouts (org_id, definition, updated_by) OUTPUT INSERTED.org_id AS insertId VALUES (?, ?, ?)', [req.orgId, definition, req.userId]);
  }
  res.json({ layout: { ...layout, version: expected + 1 }, version: expected + 1, saved: true });
}));

router.delete('/form', requirePermission(canManageClients, 'Only managers and admins can change the timesheet form'), route(async (req, res) => {
  await db.execute('DELETE FROM timesheet_form_layouts WHERE org_id = ?', [req.orgId]);
  const layout = await effectiveLayout(req.orgId);
  res.json({ layout, version: 0, saved: false });
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
