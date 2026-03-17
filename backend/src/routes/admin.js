const express = require('express');
const db = require('../config/database');
const { authenticate, adminOnly } = require('../middleware/auth');

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
  return res.status(403).json({ error: 'Organization creation is managed by company admin' });
});

router.delete('/organizations/:id', async (req, res) => {
  return res.status(403).json({ error: 'Organization deletion is managed by company admin' });
});

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.execute(
      'SELECT COUNT(*) as total FROM users WHERE is_deleted = FALSE AND org_id = ?',
      [req.orgId]
    );

    const [users] = await db.execute(
      `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.org_id, u.created_at,
        o.name as org_name, o.company_code
       FROM users u
       LEFT JOIN organizations o ON u.org_id = o.id
       WHERE u.is_deleted = FALSE AND u.org_id = ?
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.orgId, limit, offset]
    );

    res.json({
      data: users,
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const [[target]] = await db.execute(
      'SELECT id FROM users WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [req.params.id, req.orgId]
    );
    if (!target) return res.status(404).json({ error: 'User not found in your organization' });

    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const [[target]] = await db.execute(
      'SELECT id FROM users WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [req.params.id, req.orgId]
    );
    if (!target) return res.status(404).json({ error: 'User not found in your organization' });

    await db.execute(
      'UPDATE users SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?',
      [req.params.id]
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
