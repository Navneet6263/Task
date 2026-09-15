const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireTaskAccess } = require('../utils/taskAccess');
const { notifyTaskFollowers } = require('../services/taskNotifications');
const router = express.Router();

// GET /api/comments/task/:taskId — fetch all non-deleted comments for a task
router.get('/task/:taskId', authenticate, async (req, res) => {
  try {
    if (!await requireTaskAccess(req, res, req.params.taskId)) return;
    const [rows] = await db.execute(
      `SELECT
         tc.id,
         tc.task_id,
         tc.user_id,
         tc.comment,
         tc.parent_comment_id,
         tc.created_at,
         tc.updated_at,
         u.name AS user_name
       FROM task_comments tc
       JOIN users u ON u.id = tc.user_id
       WHERE tc.task_id = ? AND tc.is_deleted = FALSE
       ORDER BY tc.created_at ASC`,
      [req.params.taskId]
    );
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/comments — create a new comment
router.post('/', authenticate, async (req, res) => {
  try {
    const { task_id, comment } = req.body;
    if (!task_id || !comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'task_id and comment are required' });
    }
    if (String(comment).length > 5000) return res.status(422).json({ error: 'Comment must be under 5000 characters' });
    const task = await requireTaskAccess(req, res, task_id);
    if (!task) return;

    const [result] = await db.execute(
      'INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)',
      [task_id, req.userId, String(comment).trim()]
    );

    const [rows] = await db.execute(
      `SELECT
         tc.id,
         tc.task_id,
         tc.user_id,
         tc.comment,
         tc.parent_comment_id,
         tc.created_at,
         tc.updated_at,
         u.name AS user_name
       FROM task_comments tc
       JOIN users u ON u.id = tc.user_id
       WHERE tc.id = ?`,
      [result.insertId]
    );

    const mentioned = Array.isArray(req.body.mentioned_user_ids) ? req.body.mentioned_user_ids.slice(0, 20) : [];
    await notifyTaskFollowers(task, req.userId, `New comment on ${task.title}`, mentioned).catch(error => console.error('Comment saved; notification delivery failed:', error.message));
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/comments/:id — edit own comment
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'comment is required' });
    }

    // Verify ownership
    const [existing] = await db.execute(
      'SELECT id, task_id, user_id FROM task_comments WHERE id = ? AND is_deleted = FALSE',
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Comment not found' });
    if (!await requireTaskAccess(req, res, existing[0].task_id)) return;
    if (existing[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    await db.execute(
      'UPDATE task_comments SET comment = ?, updated_at = SYSDATETIME() WHERE id = ?',
      [String(comment).trim(), req.params.id]
    );

    const [rows] = await db.execute(
      `SELECT
         tc.id,
         tc.task_id,
         tc.user_id,
         tc.comment,
         tc.parent_comment_id,
         tc.created_at,
         tc.updated_at,
         u.name AS user_name
       FROM task_comments tc
       JOIN users u ON u.id = tc.user_id
       WHERE tc.id = ?`,
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/comments/:id — soft delete own comment
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [existing] = await db.execute(
      'SELECT id, task_id, user_id FROM task_comments WHERE id = ? AND is_deleted = FALSE',
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Comment not found' });
    if (!await requireTaskAccess(req, res, existing[0].task_id)) return;
    if (existing[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    await db.execute(
      'UPDATE task_comments SET is_deleted = TRUE WHERE id = ?',
      [req.params.id]
    );

    res.json({ message: 'Comment deleted' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
