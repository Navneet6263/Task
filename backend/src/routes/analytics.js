const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Workload AI - suggest best assignee for a task
router.get('/suggest-assignee', authenticate, async (req, res) => {
  try {
    const { teamId, priority } = req.query;
    if (!teamId) return res.status(422).json({ error: 'teamId required', code: 'VALIDATION_ERROR' });

    const [members] = await db.execute(
      `SELECT u.id, u.name,
        COUNT(CASE WHEN t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as active_tasks,
        COUNT(CASE WHEN t.priority = 'HIGH' AND t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as high_priority,
        COUNT(CASE WHEN t.due_date < NOW() AND t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as overdue,
        AVG(CASE WHEN t.status = 'DONE' THEN TIMESTAMPDIFF(HOUR, t.created_at, t.updated_at) END) as avg_completion_hours
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       LEFT JOIN tasks t ON t.assigned_to = u.id AND t.team_id = ?
       WHERE tm.team_id = ? AND u.is_deleted = FALSE
       GROUP BY u.id, u.name`,
      [teamId, teamId]
    );

    const scored = members.map(m => {
      const score =
        (m.active_tasks * 10) +
        (m.high_priority * 20) +
        (m.overdue * 30) -
        ((m.avg_completion_hours ? Math.max(0, 100 - m.avg_completion_hours) : 0) * 0.5);

      const energy = Math.max(0, 100 - (m.high_priority * 25) - (m.active_tasks * 10) - (m.overdue * 20));

      return {
        id: m.id,
        name: m.name,
        active_tasks: m.active_tasks,
        high_priority: m.high_priority,
        overdue: m.overdue,
        workload_score: Math.round(score),
        energy_score: Math.round(energy),
        energy_level: energy >= 80 ? 'Available' : energy >= 50 ? 'Moderate' : energy >= 25 ? 'High Load' : 'Burnout Alert',
        available: energy > 0
      };
    });

    scored.sort((a, b) => a.workload_score - b.workload_score);
    const suggested = scored.find(m => m.available) || scored[0];

    res.json({ suggested, all: scored });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Energy Score for a team
router.get('/energy/:teamId', authenticate, async (req, res) => {
  try {
    const [members] = await db.execute(
      `SELECT u.id, u.name,
        COUNT(CASE WHEN t.priority = 'HIGH' AND t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as high,
        COUNT(CASE WHEN t.priority = 'MEDIUM' AND t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as medium,
        COUNT(CASE WHEN t.priority = 'LOW' AND t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as low_p,
        COUNT(CASE WHEN t.due_date < NOW() AND t.status != 'DONE' AND t.is_deleted = FALSE THEN 1 END) as overdue
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       LEFT JOIN tasks t ON t.assigned_to = u.id AND t.team_id = ?
       WHERE tm.team_id = ? AND u.is_deleted = FALSE
       GROUP BY u.id, u.name`,
      [req.params.teamId, req.params.teamId]
    );

    const result = members.map(m => {
      const score = Math.max(0, 100 - (m.high * 25) - (m.medium * 10) - (m.low_p * 5) - (m.overdue * 20));
      return {
        id: m.id,
        name: m.name,
        energy_score: score,
        level: score >= 80 ? 'Available' : score >= 50 ? 'Moderate' : score >= 25 ? 'High Load' : 'Burnout Alert',
        color: score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : score >= 25 ? '#f97316' : '#ef4444'
      };
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Performance Index for a user
router.get('/performance/:userId', authenticate, async (req, res) => {
  try {
    const [[stats]] = await db.execute(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'DONE' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'DONE' AND updated_at <= due_date THEN 1 END) as on_time,
        COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as total_high,
        COUNT(CASE WHEN priority = 'HIGH' AND status = 'DONE' THEN 1 END) as completed_high,
        COUNT(CASE WHEN due_date < NOW() AND status != 'DONE' AND is_deleted = FALSE THEN 1 END) as overdue
       FROM tasks
       WHERE assigned_to = ? AND is_deleted = FALSE`,
      [req.params.userId]
    );

    const onTimeRate = stats.completed > 0 ? (stats.on_time / stats.completed) : 0;
    const highPriorityRate = stats.total_high > 0 ? (stats.completed_high / stats.total_high) : 0;
    const overdueWeight = stats.total > 0 ? (stats.overdue / stats.total) : 0;

    const index = Math.round(
      (onTimeRate * 50) + (highPriorityRate * 30) - (overdueWeight * 20)
    );

    const score = Math.max(0, Math.min(100, index));
    const grade = score >= 90 ? 'Exceptional' : score >= 75 ? 'Good' : score >= 60 ? 'Average' : 'Needs Improvement';

    res.json({ ...stats, performance_index: score, grade });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// Behavioral Insights for a team
router.get('/behavioral/:teamId', authenticate, async (req, res) => {
  try {
    // Accept delay: avg hours between task assigned and IN_PROGRESS
    const [acceptDelay] = await db.execute(
      `SELECT u.id, u.name,
        AVG(TIMESTAMPDIFF(HOUR,
          (SELECT created_at FROM audit_logs WHERE task_id = t.id AND activity = 'Task Assigned' LIMIT 1),
          (SELECT created_at FROM audit_logs WHERE task_id = t.id AND activity = 'Task Updated' LIMIT 1)
        )) as avg_accept_delay_hours
       FROM tasks t
       JOIN users u ON t.assigned_to = u.id
       JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
       WHERE t.team_id = ? AND t.is_deleted = FALSE
       GROUP BY u.id, u.name`,
      [req.params.teamId, req.params.teamId]
    );

    // After hours activity count
    const [afterHours] = await db.execute(
      `SELECT u.id, u.name,
        COUNT(CASE WHEN HOUR(al.created_at) >= 20 OR HOUR(al.created_at) < 8 THEN 1 END) as after_hours_count
       FROM audit_logs al
       JOIN users u ON al.user_id = u.id
       JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
       WHERE al.team_id = ?
       GROUP BY u.id, u.name`,
      [req.params.teamId, req.params.teamId]
    );

    // Bottleneck: tasks stuck in IN_PROGRESS > 3 days
    const [bottlenecks] = await db.execute(
      `SELECT u.id, u.name, COUNT(*) as stuck_tasks
       FROM tasks t
       JOIN users u ON t.assigned_to = u.id
       WHERE t.team_id = ? AND t.status = 'IN_PROGRESS'
         AND t.updated_at < DATE_SUB(NOW(), INTERVAL 3 DAY)
         AND t.is_deleted = FALSE
       GROUP BY u.id, u.name`,
      [req.params.teamId]
    );

    // Fast delivery: completed before deadline
    const [fastDelivery] = await db.execute(
      `SELECT u.id, u.name,
        COUNT(CASE WHEN t.status = 'DONE' THEN 1 END) as total_done,
        COUNT(CASE WHEN t.status = 'DONE' AND t.updated_at <= t.due_date THEN 1 END) as before_deadline
       FROM tasks t
       JOIN users u ON t.assigned_to = u.id
       JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = ?
       WHERE t.team_id = ? AND t.is_deleted = FALSE
       GROUP BY u.id, u.name`,
      [req.params.teamId, req.params.teamId]
    );

    res.json({ accept_delay: acceptDelay, after_hours: afterHours, bottlenecks, fast_delivery: fastDelivery });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

// System health for admin
router.get('/health', authenticate, async (req, res) => {
  try {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only', code: 'FORBIDDEN' });

    const [[{ total_users }]] = await db.execute('SELECT COUNT(*) as total_users FROM users WHERE is_deleted = FALSE');
    const [[{ total_teams }]] = await db.execute('SELECT COUNT(*) as total_teams FROM teams WHERE is_deleted = FALSE');
    const [[{ total_tasks }]] = await db.execute('SELECT COUNT(*) as total_tasks FROM tasks WHERE is_deleted = FALSE');
    const [[{ total_logs }]] = await db.execute('SELECT COUNT(*) as total_logs FROM audit_logs');
    const [[{ failed_logins }]] = await db.execute(
      'SELECT COUNT(*) as failed_logins FROM login_attempts WHERE success = FALSE AND attempted_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );

    // Task growth last 7 days
    const [taskGrowth] = await db.execute(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM tasks WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at) ORDER BY date ASC`
    );

    // Active users last 30 min
    const [[{ active_users }]] = await db.execute(
      'SELECT COUNT(*) as active_users FROM users WHERE last_active > DATE_SUB(NOW(), INTERVAL 30 MINUTE)'
    );

    res.json({ total_users, total_teams, total_tasks, total_logs, failed_logins, active_users, task_growth: taskGrowth });
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
});

module.exports = router;
