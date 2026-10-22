const router = require('express').Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { currentOrgRole } = require('../utils/orgMember');
const { isManagerRole, fail, isDuplicateKey, cleanName, syncFromTasks, pickOnly } = require('../services/orgClients');

// Settings → Clients. Everyone can read the active list (task forms need it);
// only managers and admins add, rename, switch clients on/off or change the pick-only rule.
router.use(authenticate);
const route = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (!error.status) console.error('[clients]', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not complete the request. Try again.', ...(error.fields ? { fields: error.fields } : {}) });
  }
};
const requireManager = async (req) => {
  const role = await currentOrgRole(req);
  if (!isManagerRole(role)) throw fail(403, 'Only managers and admins can change clients');
  return role;
};
const positiveId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw fail(404, 'Client not found');
  return id;
};

router.get('/', route(async (req, res) => {
  const role = await currentOrgRole(req);
  const manager = isManagerRole(role);
  await syncFromTasks(req.orgId, req.userId);
  const [rows] = manager
    ? await db.execute(
      `SELECT c.id, c.name, c.is_active, c.source, c.created_at,
         (SELECT COUNT(*) FROM tasks t WHERE t.org_id = c.org_id AND t.client_name = c.name AND t.is_deleted = 0) AS task_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.org_id = c.org_id AND t.client_name = c.name AND t.is_deleted = 0 AND t.status <> 'DONE') AS open_tasks,
         (SELECT MAX(t.created_at) FROM tasks t WHERE t.org_id = c.org_id AND t.client_name = c.name AND t.is_deleted = 0) AS last_used,
         (SELECT COALESCE(SUM(l.hours), 0) FROM task_time_logs l JOIN tasks t ON t.id = l.task_id
            WHERE t.org_id = c.org_id AND t.client_name = c.name AND t.is_deleted = 0 AND l.is_deleted = 0) AS hours
       FROM org_clients c WHERE c.org_id = ? ORDER BY c.is_active DESC, c.name ASC`,
      [req.orgId])
    : await db.execute('SELECT id, name, is_active FROM org_clients WHERE org_id = ? AND is_active = 1 ORDER BY name ASC', [req.orgId]);
  res.json({
    pick_only: await pickOnly(req.orgId),
    can_manage: manager,
    clients: rows.map((r) => ({ ...r, is_active: Boolean(Number(r.is_active)), ...(manager ? { task_count: Number(r.task_count), open_tasks: Number(r.open_tasks), hours: Number(r.hours) } : {}) })),
  });
}));

router.post('/', route(async (req, res) => {
  await requireManager(req);
  const name = cleanName(req.body?.name);
  try {
    const [result] = await db.execute('INSERT INTO org_clients (org_id, name, created_by) VALUES (?, ?, ?)', [req.orgId, name, req.userId || null]);
    res.status(201).json({ id: result.insertId, name, is_active: true });
  } catch (error) {
    if (isDuplicateKey(error)) throw fail(409, `${name} is already in your client list`, { name: 'Already in the list' });
    throw error;
  }
}));

// Renaming also updates the client name on this organization's tasks, so history stays together.
router.patch('/:id', route(async (req, res) => {
  await requireManager(req);
  const id = positiveId(req.params.id);
  const [[client]] = await db.execute('SELECT id, name, is_active FROM org_clients WHERE id = ? AND org_id = ?', [id, req.orgId]);
  if (!client) throw fail(404, 'Client not found');
  let renamedTasks = 0;
  if (req.body?.name !== undefined) {
    const name = cleanName(req.body.name);
    if (name !== client.name) {
      try { await db.execute('UPDATE org_clients SET name = ?, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?', [name, id, req.orgId]); }
      catch (error) { if (isDuplicateKey(error)) throw fail(409, `${name} is already in your client list`, { name: 'Already in the list' }); throw error; }
      const [result] = await db.execute('UPDATE tasks SET client_name = ? WHERE org_id = ? AND client_name = ? AND is_deleted = 0', [name, req.orgId, client.name]);
      renamedTasks = Number(result?.affectedRows || 0);
    }
  }
  if (req.body?.is_active !== undefined) {
    if (typeof req.body.is_active !== 'boolean') throw fail(422, 'is_active must be true or false');
    await db.execute('UPDATE org_clients SET is_active = ?, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?', [req.body.is_active, id, req.orgId]);
  }
  res.json({ id, renamed_tasks: renamedTasks });
}));

router.put('/settings', route(async (req, res) => {
  await requireManager(req);
  if (typeof req.body?.pick_only !== 'boolean') throw fail(422, 'pick_only must be true or false');
  const [result] = await db.execute('UPDATE org_client_settings SET pick_only = ?, updated_by = ?, updated_at = SYSDATETIME() WHERE org_id = ?', [req.body.pick_only, req.userId || null, req.orgId]);
  if (!Number(result?.affectedRows)) {
    await db.execute('INSERT INTO org_client_settings (org_id, pick_only, updated_by) VALUES (?, ?, ?)', [req.orgId, req.body.pick_only, req.userId || null]);
  }
  res.json({ pick_only: req.body.pick_only });
}));

module.exports = router;
