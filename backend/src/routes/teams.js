const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    let query, params;

    if (req.userRole === 'company_admin') {
      // Company admin sees all teams across their organizations
      const orgIds = req.orgIds;
      if (!orgIds || orgIds.length === 0) return res.json([]);
      const placeholders = orgIds.map(() => '?').join(',');
      query = `SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t LEFT JOIN users u ON t.created_by = u.id
       WHERE t.is_deleted = FALSE AND t.org_id IN (${placeholders})
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      params = [...orgIds, limit, offset];
    } else if (req.userRole === 'admin') {
      query = `SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t LEFT JOIN users u ON t.created_by = u.id
       WHERE t.is_deleted = FALSE AND t.org_id = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      params = [req.orgId, limit, offset];
    } else {
      query = `SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE tm.user_id = ? AND t.is_deleted = FALSE AND t.org_id = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
      params = [req.userId, req.orgId, limit, offset];
    }
    const [teams] = await db.execute(query, params);
    res.json(teams);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type } = req.body;
    const code = 'TM' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const [result] = await db.execute(
      'INSERT INTO teams (name, type, team_code, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
      [name, type, code, req.userId, req.orgId]
    );
    await db.execute(
      'INSERT INTO team_members (team_id, user_id, role, is_reporting_manager) VALUES (?, ?, ?, ?)',
      [result.insertId, req.userId, 'Reporting Manager', true]
    );
    res.json({ id: result.insertId, name, type, team_code: code });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:teamId/members', authenticate, async (req, res) => {
  try {
    const [members] = await db.execute(
      `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.avatar,
        tm.role as team_role, tm.is_reporting_manager,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND team_id = ? AND status != 'DONE') as current_tasks
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ?`,
      [req.params.teamId, req.params.teamId]
    );
    res.json(members);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId/members', authenticate, async (req, res) => {
  try {
    const { email, role } = req.body;
    const [users] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    await db.execute(
      'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
      [req.params.teamId, users[0].id, role || 'Member']
    );
    res.json({ message: 'Member added' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:teamId/members/:userId', authenticate, async (req, res) => {
  try {
    await db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [req.params.teamId, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
