const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [projects] = await db.execute(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(projects);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    const [result] = await db.execute(
      'INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)',
      [name, description, req.userId]
    );
    res.json({ id: result.insertId, name, description });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db.execute('DELETE FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
