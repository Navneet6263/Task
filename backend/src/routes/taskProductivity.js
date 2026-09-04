const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireTeamAccess } = require('../utils/teamAccess');

const router = express.Router();
const MAX_SNOOZE_DAYS = 365;

const parseUntil = (value) => {
  if (value === null || value === '') return null;
  const until = new Date(value);
  if (Number.isNaN(until.getTime())) return undefined;
  const now = Date.now();
  if (until.getTime() <= now || until.getTime() > now + MAX_SNOOZE_DAYS * 86400000) return undefined;
  return until;
};

router.patch('/:taskId/snooze', authenticate, async (req, res) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(422).json({ error: 'Invalid task', code: 'VALIDATION_ERROR' });
    }

    const [[task]] = await db.execute(
      'SELECT id, team_id, title, assigned_to, assigned_by FROM tasks WHERE id = ? AND is_deleted = FALSE',
      [taskId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });
    if (!await requireTeamAccess(req, res, task.team_id)) return;
    const canSnooze = ['admin', 'company_admin'].includes(req.userRole) ||
      Number(task.assigned_to) === Number(req.userId) || Number(task.assigned_by) === Number(req.userId);
    if (!canSnooze) {
      return res.status(403).json({ error: 'Only the assignee or task creator can snooze this task', code: 'FORBIDDEN' });
    }

    const until = parseUntil(req.body?.until);
    if (until === undefined) {
      return res.status(422).json({ error: 'Choose a future snooze time', code: 'VALIDATION_ERROR' });
    }

    await db.execute(
      'UPDATE tasks SET snoozed_until = ?, updated_at = GETDATE(), version = version + 1 WHERE id = ?',
      [until, taskId]
    );
    req.app.get('ws')?.broadcast(task.team_id, 'task_updated', {
      id: taskId,
      snoozed_until: until ? until.toISOString() : null,
    });
    return res.json({
      message: until ? 'Task snoozed' : 'Task returned to My Day',
      snoozed_until: until ? until.toISOString() : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
