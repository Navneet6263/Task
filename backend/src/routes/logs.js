const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/team/:teamId', authenticate, async (req, res) => {
  try {
    let canAccess = false;
    if (req.userRole === 'company_admin') {
      const [[team]] = await db.execute(
        `SELECT t.id
         FROM teams t
         JOIN organizations o ON o.id = t.org_id
         WHERE t.id = ? AND o.company_admin_id = ?`,
        [req.params.teamId, req.companyAdminId]
      );
      canAccess = Boolean(team);
    } else if (req.userRole === 'admin') {
      const [[team]] = await db.execute(
        'SELECT id FROM teams WHERE id = ? AND org_id = ?',
        [req.params.teamId, req.orgId]
      );
      canAccess = Boolean(team);
    } else {
      const [membership] = await db.execute(
        'SELECT id FROM team_members WHERE team_id = ? AND user_id = ? LIMIT 1',
        [req.params.teamId, req.userId]
      );
      canAccess = membership.length > 0;
    }

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const userId = req.query.userId;
    const activity = req.query.activity;

    let whereClause = 'al.team_id = ?';
    let queryParams = [req.params.teamId];

    if (userId && userId !== 'all') {
      if (userId.startsWith('u-')) {
        whereClause += ' AND al.user_id = ?';
        queryParams.push(userId.replace('u-', ''));
      } else if (userId.startsWith('n-')) {
        whereClause += ' AND LOWER(u.name) = ?';
        queryParams.push(userId.replace('n-', '').toLowerCase());
      } else if (userId.startsWith('a-')) {
        whereClause += ' AND LOWER(al.automated_by) = ?';
        queryParams.push(userId.replace('a-', '').toLowerCase());
      } else {
        whereClause += ' AND al.user_id = ?';
        queryParams.push(userId);
      }
    }

    if (activity && activity !== 'all') {
      whereClause += ' AND al.activity = ?';
      queryParams.push(activity);
    }

    // Total count for current filter
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${whereClause}`,
      queryParams
    );

    // Paginated logs
    const [logs] = await db.execute(
      `SELECT al.*, u.name as user_name, u.avatar, te.name as team_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN teams te ON al.team_id = te.id
       WHERE ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // Overall team statistics summary
    const [statsRows] = await db.execute(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN activity = 'Task Assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN activity = 'Task Completed' THEN 1 END) as completed,
        COUNT(CASE WHEN activity = 'Overdue Alert' THEN 1 END) as alerts
       FROM audit_logs
       WHERE team_id = ?`,
      [req.params.teamId]
    );
    const stats = statsRows[0] || { total: 0, assigned: 0, completed: 0, alerts: 0 };

    // Distinct actors for team member filter
    const [actors] = await db.execute(
      `SELECT DISTINCT al.user_id, u.name as user_name, al.automated_by
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.team_id = ?`,
      [req.params.teamId]
    );

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1
      },
      stats,
      actors
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/my', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM audit_logs WHERE user_id = ?`,
      [req.userId]
    );

    const [logs] = await db.execute(
      `SELECT al.*, te.name as team_name
       FROM audit_logs al
       LEFT JOIN teams te ON al.team_id = te.id
       WHERE al.user_id = ?
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.userId, limit, offset]
    );

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


module.exports = router;
