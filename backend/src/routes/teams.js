const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const canAccessTeam = async (req, teamId) => {
  if (req.userRole === 'company_admin') {
    const [[team]] = await db.execute(
      `SELECT t.id
       FROM teams t
       JOIN organizations o ON o.id = t.org_id
       WHERE t.id = ? AND t.is_deleted = FALSE AND o.company_admin_id = ?`,
      [teamId, req.companyAdminId]
    );
    return Boolean(team);
  }

  if (req.userRole === 'admin') {
    const [[team]] = await db.execute(
      'SELECT id FROM teams WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [teamId, req.orgId]
    );
    return Boolean(team);
  }

  const [membership] = await db.execute(
    'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, req.userId]
  );
  return membership.length > 0;
};

router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    let query, params;

    if (req.userRole === 'company_admin') {
      // Company admin sees all teams across their organizations
      const [orgRows] = await db.execute(
        'SELECT id FROM organizations WHERE company_admin_id = ?',
        [req.companyAdminId]
      );
      const orgIds = orgRows.map((org) => org.id);
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
    const { name, type, org_id } = req.body;
    if (!name) return res.status(422).json({ error: 'Team name required' });

    let resolvedOrgId = req.orgId;

    if (req.userRole === 'company_admin') {
      const targetOrgId = Number(org_id || req.orgIds?.[0] || 0);
      if (!targetOrgId) return res.status(422).json({ error: 'org_id required for company admin' });

      const [[org]] = await db.execute(
        'SELECT id FROM organizations WHERE id = ? AND company_admin_id = ?',
        [targetOrgId, req.companyAdminId]
      );
      if (!org) return res.status(403).json({ error: 'Organization access denied' });
      resolvedOrgId = targetOrgId;
    }

    if (!resolvedOrgId) return res.status(422).json({ error: 'Organization context missing' });

    const code = 'TM' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const [result] = await db.execute(
      'INSERT INTO teams (name, type, team_code, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
      [name, type, code, req.userId, resolvedOrgId]
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
    const allowed = await canAccessTeam(req, req.params.teamId);
    if (!allowed) return res.status(403).json({ error: 'Team access denied' });

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
    if (!['admin', 'manager', 'company_admin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only admin, manager, or company admin can add members' });
    }
    const allowed = await canAccessTeam(req, req.params.teamId);
    if (!allowed) return res.status(403).json({ error: 'Team access denied' });

    const { email, role } = req.body;
    const [users] = await db.execute(
      `SELECT u.id
       FROM users u
       JOIN teams t ON t.id = ?
       WHERE u.email = ? AND u.org_id = t.org_id AND u.is_deleted = FALSE`,
      [req.params.teamId, email]
    );
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
    if (!['admin', 'manager', 'company_admin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only admin, manager, or company admin can remove members' });
    }
    const allowed = await canAccessTeam(req, req.params.teamId);
    if (!allowed) return res.status(403).json({ error: 'Team access denied' });

    await db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [req.params.teamId, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
