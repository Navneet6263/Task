const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireTaskAccess } = require('../utils/taskAccess');
const { getTaskDetail } = require('../services/taskQueryService');
const { notifyTaskFollowers } = require('../services/taskNotifications');
const router = express.Router();
router.use(authenticate);
router.use('/:taskId', async (req, res, next) => {
  try { req.task = await requireTaskAccess(req, res, req.params.taskId); if (req.task) next(); }
  catch (error) { res.status(500).json({ error: 'Unable to access task' }); }
});
router.get('/:taskId', async (req, res) => {
  try {
    const [[checklist], [followers]] = await Promise.all([
      db.execute('SELECT * FROM task_checklist WHERE task_id = ? ORDER BY id', [req.task.id]),
      db.execute('SELECT user_id FROM task_followers WHERE task_id = ? AND user_id = ?', [req.task.id, req.userId]),
    ]);
    res.json({ checklist, following: followers.length > 0, recurrence_worker_enabled: process.env.ENABLE_RECURRING_TASKS === 'true' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.patch('/:taskId', async (req, res) => {
  try {
    const task = req.task;
    if (Number(req.body.version) !== Number(task.version)) return res.status(409).json({ error: 'Task changed. Reload before updating the workflow.' });
    const reason = req.body.blocked_reason === undefined ? task.blocked_reason : String(req.body.blocked_reason || '').trim().slice(0, 1000) || null;
    const waitingOn = req.body.waiting_on === undefined ? task.waiting_on : Number(req.body.waiting_on) || null;
    if (waitingOn) {
      const [[member]] = await db.execute('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [task.team_id, waitingOn]);
      if (!member) return res.status(422).json({ error: 'Choose someone in this team' });
    }
    const review = req.body.review_status || task.review_status;
    if (!['NONE', 'READY', 'APPROVED', 'CHANGES_REQUESTED'].includes(review)) return res.status(422).json({ error: 'Invalid review state' });
    if (review !== task.review_status && ['APPROVED', 'CHANGES_REQUESTED'].includes(review)) {
      if (task.review_status !== 'READY') return res.status(409).json({ error: 'Task must be ready for review first' });
      if (!['admin', 'company_admin'].includes(req.userRole) && Number(task.assigned_by) !== Number(req.userId)) return res.status(403).json({ error: 'Only the creator or administrator can review this task' });
    }
    const note = String(req.body.review_note ?? task.review_note ?? '').trim().slice(0, 1000) || null;
    if (review === 'CHANGES_REQUESTED' && !note) return res.status(422).json({ error: 'Explain the changes needed' });
    const status = review !== task.review_status && review === 'APPROVED' ? 'DONE' : review !== task.review_status && review === 'CHANGES_REQUESTED' ? 'IN_PROGRESS' : task.status;
    const [result] = await db.execute(`UPDATE tasks SET blocked_reason = ?, waiting_on = ?, review_status = ?, review_note = ?,
      status = ?, completed_at = CASE WHEN ? = 'DONE' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
      version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND is_deleted = FALSE`,
    [reason, waitingOn, review, note, status, status, task.id, task.version]);
    if (!result.affectedRows) return res.status(409).json({ error: 'Task changed. Reload and try again.' });
    await db.execute('INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.userId, task.team_id, task.id, status === 'DONE' && task.status !== 'DONE' ? 'Task Completed' : 'Workflow Updated', task.title,
        JSON.stringify({ blocked_reason: { before: task.blocked_reason, after: reason }, review: { before: task.review_status, after: review }, note }), 'User (Local)']);
    await notifyTaskFollowers(task, req.userId, `${task.title}: ${reason ? 'blocked — ' + reason : review !== task.review_status ? review.replaceAll('_', ' ') : 'blocker updated'}`, waitingOn ? [waitingOn] : []).catch(error => console.error('Workflow saved; notification delivery failed:', error.message));
    res.json(await getTaskDetail(task.id, req.userId));
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.put('/:taskId/follow', async (req, res) => {
  try {
    if (req.body.following === true) await db.execute(`MERGE task_followers WITH (HOLDLOCK) AS target
      USING (SELECT ? AS task_id, ? AS user_id) AS source ON target.task_id = source.task_id AND target.user_id = source.user_id
      WHEN NOT MATCHED THEN INSERT (task_id, user_id) VALUES (source.task_id, source.user_id);`, [req.task.id, req.userId]);
    else await db.execute('DELETE FROM task_followers WHERE task_id = ? AND user_id = ?', [req.task.id, req.userId]);
    res.json({ following: req.body.following === true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.post('/:taskId/checklist', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 255) return res.status(422).json({ error: 'Enter a checklist item under 255 characters' });
    const [result] = await db.execute('INSERT INTO task_checklist (task_id, title, created_by) VALUES (?, ?, ?)', [req.task.id, title, req.userId]);
    res.status(201).json({ id: result.insertId, title, is_done: false });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.patch('/:taskId/checklist/:id', async (req, res) => {
  try {
    if (typeof req.body.is_done !== 'boolean') return res.status(422).json({ error: 'is_done must be true or false' });
    const [result] = await db.execute('UPDATE task_checklist SET is_done = ? WHERE id = ? AND task_id = ?', [req.body.is_done, req.params.id, req.task.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Checklist item not found' });
    res.json({ updated: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.delete('/:taskId/checklist/:id', async (req, res) => {
  try {
    await db.execute('DELETE FROM task_checklist WHERE id = ? AND task_id = ?', [req.params.id, req.task.id]);
    res.json({ deleted: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
module.exports = router;
