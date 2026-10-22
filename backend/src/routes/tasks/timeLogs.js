const { express, db, authenticate, requireTeamAccess } = require('./taskSupport');
const { getOrgLayout } = require('../../services/taskFormStore');
const { isPastEditWindow } = require('../../services/taskFormLayout');

// Per-person time on a task: "who spent how long". Managers and admins may log for teammates.
const router = express.Router();
const canLogForOthers = (role) => ['admin', 'manager', 'company_admin'].includes(role);
const isAdmin = (role) => ['admin', 'company_admin'].includes(role);
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const LOCKED = { error: 'This task is past its edit window. Ask an admin to make changes.', code: 'LOCKED' };

async function loadTask(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(404).json({ error: 'Task not found' }); return null; }
  const [[task]] = await db.execute('SELECT id, team_id, org_id, created_at FROM tasks WHERE id = ? AND is_deleted = FALSE', [id]);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return null; }
  if (!await requireTeamAccess(req, res, task.team_id)) return null;
  return task;
}

async function summary(taskId) {
  const [logs] = await db.execute(
    `SELECT l.id, l.user_id, u.name AS user_name, l.hours, CONVERT(VARCHAR(10), l.work_date, 23) AS work_date, l.note, l.created_by, l.created_at
     FROM task_time_logs l JOIN users u ON u.id = l.user_id
     WHERE l.task_id = ? AND l.is_deleted = 0 ORDER BY l.work_date DESC, l.id DESC`,
    [taskId]
  );
  const people = new Map();
  logs.forEach((log) => {
    const row = people.get(log.user_id) || { user_id: log.user_id, name: log.user_name, hours: 0 };
    row.hours = Math.round((row.hours + Number(log.hours)) * 100) / 100;
    people.set(log.user_id, row);
  });
  const total = Math.round(logs.reduce((sum, log) => sum + Number(log.hours), 0) * 100) / 100;
  return { logs: logs.map((l) => ({ ...l, hours: Number(l.hours) })), total_hours: total, by_person: [...people.values()].sort((a, b) => b.hours - a.hours) };
}

router.get('/:id/time-logs', authenticate, async (req, res) => {
  try {
    const task = await loadTask(req, res);
    if (task) res.json(await summary(task.id));
  } catch (error) { console.error('[time-logs]', error.message); res.status(500).json({ error: 'Could not load time logs' }); }
});

router.post('/:id/time-logs', authenticate, async (req, res) => {
  try {
    const task = await loadTask(req, res);
    if (!task) return;
    if (!isAdmin(req.userRole) && isPastEditWindow(await getOrgLayout(task.org_id), task.created_at)) return res.status(423).json(LOCKED);
    const hours = Math.round(Number(req.body?.hours) * 100) / 100;
    if (!(hours > 0 && hours <= 24)) return res.status(422).json({ error: 'Hours must be more than 0 and at most 24' });
    const workDate = req.body?.work_date ? String(req.body.work_date) : today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || workDate > today()) return res.status(422).json({ error: 'Pick a valid date that is not in the future' });
    const userId = req.body?.user_id ? Number(req.body.user_id) : Number(req.userId);
    if (userId !== Number(req.userId) && !canLogForOthers(req.userRole)) return res.status(403).json({ error: 'You can only log your own time' });
    const [member] = await db.execute('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [task.team_id, userId]);
    if (!member.length && userId !== Number(req.userId)) return res.status(422).json({ error: 'That person is not in this team' });
    const note = String(req.body?.note || '').trim().slice(0, 500) || null;
    await db.execute(
      'INSERT INTO task_time_logs (org_id, task_id, user_id, hours, work_date, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [task.org_id, task.id, userId, hours, workDate, note, req.userId || null]
    );
    res.status(201).json(await summary(task.id));
  } catch (error) { console.error('[time-logs]', error.message); res.status(500).json({ error: 'Could not save the time' }); }
});

router.delete('/:id/time-logs/:logId', authenticate, async (req, res) => {
  try {
    const task = await loadTask(req, res);
    if (!task) return;
    const [[log]] = await db.execute('SELECT id, user_id, created_by FROM task_time_logs WHERE id = ? AND task_id = ? AND is_deleted = 0', [req.params.logId, task.id]);
    if (!log) return res.status(404).json({ error: 'Time entry not found' });
    const own = [log.user_id, log.created_by].map(Number).includes(Number(req.userId));
    if (!own && !canLogForOthers(req.userRole)) return res.status(403).json({ error: 'You can only remove your own time' });
    if (!isAdmin(req.userRole) && isPastEditWindow(await getOrgLayout(task.org_id), task.created_at)) return res.status(423).json(LOCKED);
    await db.execute('UPDATE task_time_logs SET is_deleted = 1 WHERE id = ?', [log.id]);
    res.json(await summary(task.id));
  } catch (error) { console.error('[time-logs]', error.message); res.status(500).json({ error: 'Could not remove the time' }); }
});

module.exports = { router, summary, today, canLogForOthers };
