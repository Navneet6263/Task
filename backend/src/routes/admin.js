const express = require('express');
const db = require('../config/database');
const { authenticate, adminOnly } = require('../middleware/auth');
const router = express.Router();

router.use(authenticate, adminOnly);

// Organizations
router.get('/organizations', async (req, res) => {
  try {
    const [orgs] = await db.execute(
      `SELECT o.*, 
        (SELECT COUNT(*) FROM users WHERE org_id = o.id AND is_deleted = FALSE) as user_count,
        (SELECT COUNT(*) FROM teams WHERE org_id = o.id AND is_deleted = FALSE) as team_count
       FROM organizations o ORDER BY o.created_at DESC`
    );
    res.json(orgs);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/organizations', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(422).json({ error: 'name required' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const code = 'ORG-' + name.substring(0, 4).toUpperCase().replace(/\s/g,'') + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
    const [result] = await db.execute(
      'INSERT INTO organizations (name, slug, company_code) VALUES (?, ?, ?)',
      [name, slug, code]
    );
    res.json({ id: result.insertId, name, company_code: code });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/organizations/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM organizations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Organization deleted' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Users — admin sees all orgs
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const orgFilter = req.query.org_id ? ' AND u.org_id = ?' : '';
    const params = req.query.org_id ? [req.query.org_id, limit, offset] : [limit, offset];

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM users u WHERE u.is_deleted = FALSE${orgFilter}`,
      req.query.org_id ? [req.query.org_id] : []
    );
    const [users] = await db.execute(
      `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.org_id, u.created_at,
        o.name as org_name, o.company_code
       FROM users u LEFT JOIN organizations o ON u.org_id = o.id
       WHERE u.is_deleted = FALSE${orgFilter}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      params
    );
    res.json({ data: users, pagination: { total, page, limit, total_pages: Math.ceil(total / limit) } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.execute('UPDATE users SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const [[{ users }]] = await db.execute('SELECT COUNT(*) as users FROM users WHERE is_deleted = FALSE');
    const [[{ teams }]] = await db.execute('SELECT COUNT(*) as teams FROM teams WHERE is_deleted = FALSE');
    const [[{ tasks }]] = await db.execute('SELECT COUNT(*) as tasks FROM tasks WHERE is_deleted = FALSE');
    const [[{ logs }]]  = await db.execute('SELECT COUNT(*) as logs FROM audit_logs');
    const [[{ orgs }]]  = await db.execute('SELECT COUNT(*) as orgs FROM organizations');
    res.json({ users, teams, tasks, logs, orgs });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
