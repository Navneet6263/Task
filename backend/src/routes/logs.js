const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/team/:teamId', authenticate, async (req, res) => {
  try {
    const [logs] = await db.execute(
      `SELECT al.*, u.name as user_name, u.avatar, te.name as team_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN teams te ON al.team_id = te.id
       WHERE al.team_id = ?
       ORDER BY al.created_at DESC
       LIMIT 100`,
      [req.params.teamId]
    );
    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/my', authenticate, async (req, res) => {
  try {
    const [logs] = await db.execute(
      `SELECT al.*, te.name as team_name
       FROM audit_logs al
       LEFT JOIN teams te ON al.team_id = te.id
       WHERE al.user_id = ?
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [req.userId]
    );
    res.json(logs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
