const db = require('../config/database');
const { requireTeamAccess } = require('./teamAccess');

const requireTaskAccess = async (req, res, taskId) => {
  if (!Number.isSafeInteger(Number(taskId)) || Number(taskId) <= 0) {
    res.status(422).json({ error: 'Invalid task ID' });
    return null;
  }
  const [[task]] = await db.execute(
    'SELECT id, team_id, org_id, title, assigned_to, assigned_by, version, status, blocked_reason, waiting_on, review_status, review_note FROM tasks WHERE id = ? AND is_deleted = FALSE', [Number(taskId)]
  );
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }
  return await requireTeamAccess(req, res, task.team_id) ? task : null;
};

module.exports = { requireTaskAccess };
