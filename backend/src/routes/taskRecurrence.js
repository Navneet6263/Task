const router = require('express').Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireTaskAccess } = require('../utils/taskAccess');
router.put('/:taskId', authenticate, async (req, res) => {
  try {
    const task = await requireTaskAccess(req, res, req.params.taskId);
    if (!task) return;
    const interval = req.body.interval || null;
    if (interval && !['DAILY', 'WEEKLY', 'MONTHLY'].includes(interval)) return res.status(422).json({ error: 'Invalid repeat interval' });
    if (!['admin', 'company_admin'].includes(req.userRole) && Number(task.assigned_by) !== Number(req.userId)) return res.status(403).json({ error: 'Only the creator or administrator can set recurrence' });
    const [result] = await db.execute(`UPDATE tasks SET repeat_interval = ?, version = version + 1
      WHERE id = ? AND version = ? AND is_deleted = FALSE AND status != 'DONE' AND (? IS NULL OR due_date IS NOT NULL)`, [interval, task.id, req.body.version, interval]);
    if (!result.affectedRows) return res.status(409).json({ error: 'Reload the task, make sure it is open and has a due date, then retry.' });
    res.json({ interval, version: Number(task.version) + 1 });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
module.exports = router;
