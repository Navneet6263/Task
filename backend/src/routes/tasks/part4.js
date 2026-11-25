const { express, db, authenticate, canAccessTeam, requireTeamAccess, getTaskDetail, listTeamTasks, ws, TASK_STATUSES, TASK_ISSUE_TYPES, normalizeText, normalizeDate, normalizeIssueType, normalizeReferenceImage, normalizeUserId, normalizeTaskPayload, canManageTaskForm, formatTaskFormOptions, ensureDefaultTaskFormOptions, TASK_OPTION_GROUPS, logActivity } = require('./taskSupport');
const router = express.Router();

router.patch('/:id/priority-lock', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT * FROM tasks WHERE id = ? AND assigned_to = ? AND is_deleted = FALSE',
      [req.params.id, req.userId]
    );
    if (task.length === 0) return res.status(403).json({ error: 'Not your task', code: 'FORBIDDEN' });

    const newLock = !task[0].priority_locked;
    if (!await requireTeamAccess(req, res, task[0].team_id)) return;
    await db.execute('UPDATE tasks SET priority_locked = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newLock, req.params.id]);
    await logActivity(req.userId, task[0].team_id, req.params.id, 'Priority Lock',
      task[0].title, `Priority lock ${newLock ? 'activated' : 'deactivated'}`, 'User (Local)');
    res.json({ priority_locked: newLock });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Soft delete task (or request deletion if not creator)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT id, team_id, assigned_by FROM tasks WHERE id = ? AND is_deleted = FALSE', [req.params.id]
    );
    if (task.length === 0) return res.status(404).json({ error: 'Task not found', code: 'NOT_FOUND' });

    const teamId = task[0].team_id;
    // Only people who can see the task's team may delete it or ask for it to be deleted.
    if (!await requireTeamAccess(req, res, teamId)) return;
    
    // If the user requesting deletion is NOT the creator (assigned_by), send a delete request instead
    if (task[0].assigned_by && Number(task[0].assigned_by) !== Number(req.userId)) {
      await db.execute(
        'UPDATE tasks SET delete_requested_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [req.userId, req.params.id]
      );
      if (teamId) ws.broadcast(teamId, 'task_updated', { id: req.params.id });
      return res.json({ message: 'Delete request sent to the task creator' });
    }

    // Otherwise, delete immediately
    await db.execute(
      'UPDATE tasks SET is_deleted = TRUE, deleted_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]
    );
    if (teamId) ws.broadcast(teamId, 'task_deleted', { id: req.params.id });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Approve delete request
router.patch('/:id/approve-delete', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT id, team_id, assigned_by FROM tasks WHERE id = ? AND is_deleted = FALSE', [req.params.id]
    );
    if (task.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (!await requireTeamAccess(req, res, task[0].team_id)) return;
    if (Number(task[0].assigned_by) !== Number(req.userId)) return res.status(403).json({ error: 'Only the task creator can approve deletion' });

    const teamId = task[0].team_id;
    await db.execute(
      'UPDATE tasks SET delete_requested_by = NULL, is_deleted = TRUE, deleted_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
      [req.params.id]
    );
    if (teamId) ws.broadcast(teamId, 'task_deleted', { id: req.params.id });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reject delete request
router.patch('/:id/reject-delete', authenticate, async (req, res) => {
  try {
    const [task] = await db.execute(
      'SELECT id, team_id, assigned_by FROM tasks WHERE id = ? AND is_deleted = FALSE', [req.params.id]
    );
    if (task.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (!await requireTeamAccess(req, res, task[0].team_id)) return;
    if (Number(task[0].assigned_by) !== Number(req.userId)) return res.status(403).json({ error: 'Only the task creator can reject deletion' });

    const teamId = task[0].team_id;
    await db.execute(
      'UPDATE tasks SET delete_requested_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
      [req.params.id]
    );
    if (teamId) ws.broadcast(teamId, 'task_updated', { id: req.params.id });
    res.json({ message: 'Delete request rejected' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Bulk Delete ──────────────────────────────────────────────────
router.delete('/bulk/delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    const normalizedIds = [...new Set(ids.map(Number))];
    if (normalizedIds.length > 100 || normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return res.status(422).json({ error: 'Provide up to 100 valid task IDs', code: 'VALIDATION_ERROR' });
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [taskRows] = await db.execute(
      `SELECT id, team_id, assigned_by FROM tasks WHERE id IN (${placeholders}) AND is_deleted = FALSE`,
      normalizedIds
    );
    if (taskRows.length === 0) return res.status(404).json({ error: 'No valid tasks found' });

    const teamIds = [...new Set(taskRows.map((task) => task.team_id))];
    const accessChecks = await Promise.all(teamIds.map((teamId) => canAccessTeam(req, teamId)));
    if (accessChecks.some((allowed) => !allowed)) {
      return res.status(403).json({ error: 'Team access denied', code: 'FORBIDDEN' });
    }

    // Same rule as deleting one task: your own tasks (or ones nobody created) go at once;
    // someone else's task gets a delete request to its creator instead.
    const mine = (task) => !task.assigned_by || Number(task.assigned_by) === Number(req.userId);
    const validIds = taskRows.filter(mine).map((task) => task.id);
    const requestedIds = taskRows.filter((task) => !mine(task)).map((task) => task.id);
    if (validIds.length) {
      await db.execute(
        `UPDATE tasks SET is_deleted = TRUE, deleted_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id IN (${validIds.map(() => '?').join(',')})`,
        validIds
      );
    }
    if (requestedIds.length) {
      await db.execute(
        `UPDATE tasks SET delete_requested_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${requestedIds.map(() => '?').join(',')})`,
        [req.userId, ...requestedIds]
      );
    }

    const teamSet = new Set(taskRows.map((task) => task.team_id).filter(Boolean));
    teamSet.forEach((teamId) => {
      if (validIds.length) ws.broadcast(teamId, 'task_bulk_deleted', { ids: validIds });
      requestedIds.forEach((id) => ws.broadcast(teamId, 'task_updated', { id }));
    });

    const parts = [];
    if (validIds.length) parts.push(`${validIds.length} ${validIds.length === 1 ? 'task' : 'tasks'} deleted`);
    if (requestedIds.length) parts.push(`${requestedIds.length} sent to ${requestedIds.length === 1 ? 'its creator' : 'their creators'} for approval`);
    res.json({ message: `${parts.join('. ')}.`, deleted: validIds, requested: requestedIds });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});
module.exports = router;
