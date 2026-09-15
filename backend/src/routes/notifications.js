const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.userId]);
    res.json(row);
  } catch (error) { res.status(500).json({ error: 'Unable to load unread count' }); }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM notifications WHERE user_id = ? ${req.query.unread === 'true' ? 'AND is_read = FALSE' : ''} ORDER BY created_at DESC, id DESC LIMIT 30`,
      [req.userId]
    );
    res.json(rows);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.userId]);
    res.json({ message: 'All marked read' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id/read', authenticate, async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Marked read' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
