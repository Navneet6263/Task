const express = require('express');
const db = require('../config/database');
const { authenticate, adminOnly } = require('../middleware/auth');
const { pickedLeads, applyLeadsForRole, leadsFor } = require('../services/teamLeads');
const { resetUserPassword } = require('../services/passwordReset');

const router = express.Router();

router.use(authenticate, adminOnly);

// Organization admin routes are scoped to the current org only.
router.get('/organizations', async (req, res) => {
  try {
    const [orgs] = await db.execute(
      `SELECT o.*,
        (SELECT COUNT(*) FROM users WHERE org_id = o.id AND is_deleted = FALSE) as user_count,
        (SELECT COUNT(*) FROM teams WHERE org_id = o.id AND is_deleted = FALSE) as team_count
       FROM organizations o
       WHERE o.id = ?
       ORDER BY o.created_at DESC`,
      [req.orgId]
    );
    res.json(orgs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/organizations', async (req, res) => {
  return res.status(403).json({ error: 'Workspace creation is managed by company admin' });
});

// An admin renames the organization they are in, and sets the letters in front of task numbers.
// The company code never changes here: people already use it to join.
const PREFIX_RE = /^[A-Z][A-Z0-9]{1,5}$/;
router.patch('/organization', async (req, res) => {
  try {
    if (!req.orgId) return res.status(422).json({ error: 'Workspace context missing' });
    const sets = [];
    const params = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name ?? '').trim().replace(/\s+/g, ' ');
      if (name.length < 2) return res.status(422).json({ error: 'Type the workspace name', fields: { name: 'Name is required' } });
      if (name.length > 120) return res.status(422).json({ error: 'Workspace name must be at most 120 characters', fields: { name: 'Too long' } });
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.task_prefix !== undefined) {
      const prefix = String(req.body.task_prefix ?? '').trim().toUpperCase();
      if (prefix && !PREFIX_RE.test(prefix)) return res.status(422).json({ error: 'Task code must be 2 to 6 letters or numbers, starting with a letter', fields: { task_prefix: '2 to 6 letters or numbers' } });
      sets.push('task_prefix = ?'); params.push(prefix || null);
    }
    if (!sets.length) return res.status(422).json({ error: 'Nothing to change' });
    await db.execute(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, [...params, req.orgId]);
    const [[org]] = await db.execute('SELECT id, name, company_code, task_prefix FROM organizations WHERE id = ?', [req.orgId]);
    res.json(org);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// A new password for someone in this organization: typed here or made for them, shown once.
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    if (Number(req.params.id) === Number(req.userId)) return res.status(400).json({ error: 'Change your own password from your profile.' });
    const [[target]] = await db.execute('SELECT id, email, org_id FROM users WHERE id = ? AND org_id = ? AND is_deleted = FALSE', [req.params.id, req.orgId]);
    if (!target) return res.status(404).json({ error: 'User not found in your workspace' });
    res.json(await resetUserPassword(target, { password: req.body?.password, mustChange: req.body?.must_change !== false }));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, ...(error.fields ? { fields: error.fields } : {}) });
  }
});

router.delete('/organizations/:id', async (req, res) => {
  return res.status(403).json({ error: 'Workspace deletion is managed by company admin' });
});

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    // Optional search (name, email, employee ID) and role filter.
    const q = String(req.query.q || '').trim().slice(0, 80);
    const role = ['admin', 'manager', 'person'].includes(req.query.role) ? req.query.role : '';
    const where = `u.is_deleted = FALSE AND u.org_id = ?${q ? ' AND (u.name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)' : ''}${role ? ' AND u.role = ?' : ''}`;
    const params = [req.orgId, ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []), ...(role ? [role] : [])];
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) as total FROM users u WHERE ${where}`, params);

    const [users] = await db.execute(
      `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.org_id, u.created_at, u.last_active,
        o.name as org_name, o.company_code
       FROM users u
       LEFT JOIN organizations o ON u.org_id = o.id
       WHERE ${where}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const leads = await leadsFor(users.map((u) => u.id));
    res.json({
      data: users.map((u) => ({ ...u, leads: leads[u.id] || [] })),
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'manager', 'person'].includes(role)) return res.status(422).json({ error: 'Role must be admin, manager or person' });
    if (Number(req.params.id) === Number(req.userId)) return res.status(400).json({ error: 'You cannot change your own role. Ask another admin.' });
    const [[target]] = await db.execute(
      'SELECT id FROM users WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [req.params.id, req.orgId]
    );
    if (!target) return res.status(404).json({ error: 'User not found in your workspace' });
    // A new manager can be put in charge of teams in the same step.
    const leadIds = await pickedLeads(req.orgId, role, req.body);

    await db.execute('UPDATE users SET role = ? WHERE id = ? AND org_id = ?', [role, req.params.id, req.orgId]);
    await applyLeadsForRole(Number(req.params.id), role, leadIds);
    res.json({ message: 'Role updated' });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (Number(req.params.id) === Number(req.userId)) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const [[target]] = await db.execute(
      'SELECT id FROM users WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [req.params.id, req.orgId]
    );
    if (!target) return res.status(404).json({ error: 'User not found in your workspace' });

    await db.execute(
      'UPDATE users SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ? AND org_id = ?',
      [req.params.id, req.orgId]
    );
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [[{ users }]] = await db.execute(
      'SELECT COUNT(*) as users FROM users WHERE is_deleted = FALSE AND org_id = ?',
      [req.orgId]
    );
    const [[{ teams }]] = await db.execute(
      'SELECT COUNT(*) as teams FROM teams WHERE is_deleted = FALSE AND org_id = ?',
      [req.orgId]
    );
    const [[{ tasks }]] = await db.execute(
      'SELECT COUNT(*) as tasks FROM tasks WHERE is_deleted = FALSE AND org_id = ?',
      [req.orgId]
    );
    const [[{ logs }]] = await db.execute(
      `SELECT COUNT(*) as logs
       FROM audit_logs al
       JOIN teams t ON t.id = al.team_id
       WHERE t.org_id = ?`,
      [req.orgId]
    );
    const [[{ orgs }]] = await db.execute(
      'SELECT COUNT(*) as orgs FROM organizations WHERE id = ?',
      [req.orgId]
    );
    res.json({ users, teams, tasks, logs, orgs });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
