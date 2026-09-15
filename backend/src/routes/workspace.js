const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.get('/search', authenticate, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 120);
    if (query.length < 2) return res.json([]);
    const privileged = ['admin', 'company_admin'].includes(req.userRole);
    const [rows] = await db.execute(`SELECT TOP 20 t.id, t.title, t.status, te.name AS team_name
      FROM tasks t JOIN teams te ON te.id = t.team_id AND te.is_deleted = FALSE
      WHERE t.is_deleted = FALSE AND t.org_id = ?
        AND (? = 1 OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.team_id AND tm.user_id = ?))
        AND (t.title LIKE ? OR t.client_name LIKE ? OR t.id = ?)
      ORDER BY t.updated_at DESC, t.id DESC`, [req.orgId || 0, privileged ? 1 : 0, req.userId, `%${query}%`, `%${query}%`, Number(query.replace(/^TASK-/i, '')) || 0]);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Unable to search tasks' }); }
});
module.exports = router;
