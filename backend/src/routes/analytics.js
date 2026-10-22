const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireTeamAccess } = require('../utils/teamAccess');
const { teamReport } = require('../services/teamReport');
const { exportTeamTasks } = require('../services/taskQueryService');
const { buildPerformance, daysTaken, onTime } = require('../services/performance');
const { currentOrgRole } = require('../utils/orgMember');
const router = express.Router();

router.get('/report/:teamId', authenticate, async (req, res) => {
  try {
    if (!await requireTeamAccess(req, res, req.params.teamId)) return;
    res.json(await teamReport(req.params.teamId, req.query));
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

// Personal performance for the PMS Hub: the user's completed work compared with everyone
// in their teams. Peers are only ever returned as averages and percentiles, never by name.
router.get('/me/performance', authenticate, async (req, res) => {
  try {
    await currentOrgRole(req);
    const days = [30, 90, 180, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
    const dateCols = `CONVERT(VARCHAR(19), t.created_at, 126) AS created_at, CONVERT(VARCHAR(10), t.start_date, 23) AS start_date,
      CONVERT(VARCHAR(10), t.assigned_date, 23) AS assigned_date, CONVERT(VARCHAR(10), t.due_date, 23) AS due_date,
      CONVERT(VARCHAR(19), t.completed_at, 126) AS completed_at`;
    const [rows] = await db.execute(
      `SELECT t.assigned_to, t.priority, ${dateCols}
       FROM tasks t
       WHERE t.org_id = ? AND t.is_deleted = 0 AND t.status = 'DONE' AND t.completed_at IS NOT NULL
         AND t.completed_at >= DATEADD(DAY, -?, GETDATE())
         AND t.assigned_to IN (SELECT tm2.user_id FROM team_members tm1 JOIN team_members tm2 ON tm2.team_id = tm1.team_id WHERE tm1.user_id = ?)
       ORDER BY t.completed_at ASC OFFSET 0 ROWS FETCH NEXT 20000 ROWS ONLY`,
      [req.orgId, days, req.userId]
    );
    const [[open]] = await db.execute(
      `SELECT COUNT(*) AS open_tasks,
         COUNT(CASE WHEN t.due_date < CAST(GETDATE() AS DATE) THEN 1 END) AS overdue,
         COUNT(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 END) AS in_progress
       FROM tasks t WHERE t.org_id = ? AND t.assigned_to = ? AND t.is_deleted = 0 AND t.status <> 'DONE'`,
      [req.orgId, req.userId]
    );
    const [recent] = await db.execute(
      `SELECT TOP 50 t.id, t.title, t.priority, t.issue_type, te.name AS team_name, ${dateCols}
       FROM tasks t LEFT JOIN teams te ON te.id = t.team_id
       WHERE t.org_id = ? AND t.assigned_to = ? AND t.is_deleted = 0 AND t.status = 'DONE' AND t.completed_at >= DATEADD(DAY, -?, GETDATE())
       ORDER BY t.completed_at DESC`,
      [req.orgId, req.userId, days]
    );
    res.json({
      days,
      ...buildPerformance(rows, req.userId),
      now: { open: Number(open.open_tasks), overdue: Number(open.overdue), inProgress: Number(open.in_progress) },
      recent: recent.map((task) => ({ ...task, days_taken: daysTaken(task), on_time: onTime(task) })),
    });
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not calculate performance.' }); }
});

// Detailed task rows for the report builder and Excel export (team access checked first).
router.get('/report/:teamId/tasks', authenticate, async (req, res) => {
  try {
    if (!await requireTeamAccess(req, res, req.params.teamId)) return;
    res.json(await exportTeamTasks(req.params.teamId, req.query));
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not build the report.' }); }
});

// Compatibility endpoints; counts are capacity hints, never a diagnosis or employee rating.
const workload = member => ({ ...member, active_tasks: member.active, workload_score: member.active,
  energy_score: Math.max(0, 100 - member.active * 10), energy_level: 'Task-count estimate', available: true });
router.get('/suggest-assignee', authenticate, async (req, res) => {
  try {
    if (!await requireTeamAccess(req, res, req.query.teamId)) return;
    const report = await teamReport(req.query.teamId);
    const all = report.members.map(workload).sort((a, b) => a.active - b.active);
    res.json({ all, suggested: all[0] || null, explanation: 'Lowest active task count; check task complexity and availability before assigning.' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/energy/:teamId', authenticate, async (req, res) => {
  try {
    if (!await requireTeamAccess(req, res, req.params.teamId)) return;
    const report = await teamReport(req.params.teamId);
    res.json(report.members.map(member => ({ ...workload(member), level: 'Task-count estimate', color: '#2563eb' })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/behavioral/:teamId', authenticate, async (req, res) => {
  try {
    if (!await requireTeamAccess(req, res, req.params.teamId)) return;
    const report = await teamReport(req.params.teamId);
    res.json({ accept_delay: [], after_hours: [], bottlenecks: report.members.map(member => ({ ...member, stuck_tasks: member.blocked })),
      fast_delivery: report.members.map(member => ({ ...member, total_done: member.completed, before_deadline: member.on_time })) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/performance/:userId', authenticate, async (req, res) => {
  try {
    if (Number(req.params.userId) !== Number(req.userId)) return res.status(403).json({ error: 'Use the authorized team report for member statistics' });
    const [[row]] = await db.execute("SELECT COUNT(*) AS total, COUNT(CASE WHEN status = 'DONE' THEN 1 END) AS completed FROM tasks WHERE assigned_to = ? AND org_id = ? AND is_deleted = FALSE", [req.userId, req.orgId]);
    res.json({ ...row, performance_index: row.total ? Math.round(100 * row.completed / row.total) : 0, grade: 'Completion rate, not an employee rating' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
router.get('/health', authenticate, async (req, res) => {
  try {
    if (req.userRole !== 'admin' || !req.orgId) return res.status(403).json({ error: 'Organization admin access required' });
    const [[users], [teams], [tasks], [logs]] = await Promise.all([
      db.execute('SELECT COUNT(*) AS total_users, COUNT(CASE WHEN last_active > DATEADD(MINUTE, -30, GETDATE()) THEN 1 END) AS active_users FROM users WHERE org_id = ? AND is_deleted = FALSE', [req.orgId]),
      db.execute('SELECT COUNT(*) AS total_teams FROM teams WHERE org_id = ? AND is_deleted = FALSE', [req.orgId]),
      db.execute('SELECT COUNT(*) AS total_tasks FROM tasks WHERE org_id = ? AND is_deleted = FALSE', [req.orgId]),
      db.execute('SELECT COUNT(*) AS total_logs FROM audit_logs al JOIN teams t ON t.id = al.team_id WHERE t.org_id = ?', [req.orgId]),
    ]);
    res.json({ ...users[0], ...teams[0], ...tasks[0], ...logs[0], failed_logins: null, task_growth: [] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
module.exports = router;
