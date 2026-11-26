const db = require('../config/database');
const ws = require('../websocket');
const { canAccessTeam } = require('../utils/teamAccess');

// "Send back": the person a task is assigned to can return it, with a reason, when it is not their work.
// It goes back to whoever assigned it (or to the team leader when nobody did, e.g. a task from email or the API),
// the reason is posted as a comment and in the history, and that person is notified. The card shows "Sent back"
// until the task is assigned to someone again.

const MIN_REASON = 5;
const MAX_REASON = 500;
const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });

async function ensureSendBackSchema() {
  await db.query(`IF COL_LENGTH('dbo.tasks', 'returned_by') IS NULL ALTER TABLE dbo.tasks ADD returned_by INT NULL;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'returned_to') IS NULL ALTER TABLE dbo.tasks ADD returned_to INT NULL;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'returned_reason') IS NULL ALTER TABLE dbo.tasks ADD returned_reason NVARCHAR(500) NULL;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'returned_at') IS NULL ALTER TABLE dbo.tasks ADD returned_at DATETIME2 NULL;`);
}

const cleanReason = (value) => {
  const reason = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length < MIN_REASON) throw fail(422, 'Write why you are sending it back, so they know what to do with it.', { reason: `At least ${MIN_REASON} characters` });
  if (reason.length > MAX_REASON) throw fail(422, `Keep the reason under ${MAX_REASON} characters.`, { reason: `At most ${MAX_REASON} characters` });
  return reason;
};

// Who gets the task back: after a hand over, the leader who received it (or, for that leader, the team it came
// from); otherwise the person who assigned it, else the team leader. Never the sender themselves.
async function returnTarget(task, senderId, step = null) {
  if (step) {
    // Handed over into this team: back to whoever leads it now (or the leader it was handed to).
    const lead = await require('./handover').leaderOf(task.team_id, senderId);
    if (lead) return lead;
    const [[first]] = await db.execute('SELECT id, name FROM users WHERE id = ? AND is_deleted = FALSE', [step.to_user_id]);
    if (first && Number(first.id) !== Number(senderId)) return first;
  }
  if (task.assigned_by && Number(task.assigned_by) !== Number(senderId)) {
    const [[assigner]] = await db.execute('SELECT id, name FROM users WHERE id = ? AND is_deleted = FALSE', [task.assigned_by]);
    if (assigner) return assigner;
  }
  const [[leader]] = await db.execute(
    `SELECT u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ? AND tm.is_reporting_manager = 1 AND tm.user_id <> ? AND u.is_deleted = FALSE`,
    [task.team_id, senderId]);
  return leader || null;
}

// What the task window needs to show the button: allowed or not, and to whom it would go.
async function sendBackInfo(req, taskId) {
  const task = await loadTask(req, taskId);
  const why = whyNot(task, req.userId);
  if (why) return { allowed: false, reason: why };
  const handover = require('./handover');
  const step = await handover.activeHandover(task);
  if (step && await handover.isReceiver(req.userId, task, step)) {
    const target = await handover.acrossTarget(step);
    if (!target) return { allowed: false, reason: `${step.from_team_name} has nobody to take it back (no leader). Ask your admin where it should go.` };
    return { allowed: true, to: target, team: { id: step.from_team_id, name: step.from_team_name } };
  }
  const target = await returnTarget(task, req.userId, step);
  return target ? { allowed: true, to: { id: target.id, name: target.name } } : { allowed: false, reason: 'Nobody to send it back to: it has no assigner and the team has no leader.' };
}

async function loadTask(req, taskId) {
  const id = Number(taskId);
  if (!Number.isInteger(id) || id < 1) throw fail(404, 'Task not found');
  const [[task]] = await db.execute(
    `SELECT t.id, t.title, t.team_id, t.org_id, t.status, t.issue_type, t.assigned_to, t.assigned_by, t.version, te.name AS team_name
     FROM tasks t LEFT JOIN teams te ON te.id = t.team_id WHERE t.id = ? AND t.is_deleted = FALSE`, [id]);
  if (!task || !await canAccessTeam(req, task.team_id)) throw fail(404, 'Task not found');
  return task;
}

function whyNot(task, userId) {
  if (Number(task.assigned_to) !== Number(userId)) return 'Only the person this task is assigned to can send it back.';
  if (task.status === 'DONE') return 'This task is already done.';
  return '';
}

async function sendBack(req, taskId, body = {}) {
  const reason = cleanReason(body.reason);
  const task = await loadTask(req, taskId);
  const why = whyNot(task, req.userId);
  if (why) throw fail(403, why);
  // Bugs with bug tracking on have their own way back ("Give back" puts it back in Ready to pick).
  if (task.issue_type === 'bug' && await require('./bugFlow').isOn(task.org_id)) {
    throw fail(409, 'Bugs go back with "Give back" in the bug bar at the top of the bug.');
  }
  if (body.version !== undefined && Number(body.version) !== Number(task.version)) {
    throw fail(409, 'Someone changed this task just now. Reload it and try again.');
  }
  // Handed over from another team, and I am the leader who received it: one step back, to that team.
  const handover = require('./handover');
  const step = await handover.activeHandover(task);
  if (step && await handover.isReceiver(req.userId, task, step)) {
    const back = await handover.sendBackAcross(req, task, step, reason);
    return { to: back.to, team: back.team, version: Number(task.version) + 1 };
  }
  const target = await returnTarget(task, req.userId, step);
  if (!target) throw fail(409, 'Nobody to send it back to: it has no assigner and the team has no leader. Ask your manager.');

  // Only while it is still assigned to this person, so two clicks or a parallel reassign cannot both win.
  const [result] = await db.execute(
    `UPDATE tasks SET assigned_to = ?, returned_by = ?, returned_to = ?, returned_reason = ?, returned_at = CURRENT_TIMESTAMP,
       status = CASE WHEN status = 'IN_PROGRESS' THEN 'TODO' ELSE status END,
       version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND assigned_to = ? AND is_deleted = FALSE AND status <> 'DONE'`,
    [target.id, req.userId, target.id, reason, task.id, req.userId]);
  if (!Number(result?.affectedRows)) throw fail(409, 'Someone changed this task just now. Reload it and try again.');

  const [[me]] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
  const sender = me?.name || 'Someone';
  // The reason sits in the comments, where the conversation about the task already happens.
  await db.execute('INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)',
    [task.id, req.userId, `Sent back to ${target.name}: ${reason}`]);
  await db.execute(
    'INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.userId, task.team_id, task.id, 'Task Sent Back', task.title,
      JSON.stringify({ assigned_to: { before: Number(req.userId), after: Number(target.id) }, sent_back: { before: null, after: reason } }), 'User (Local)']).catch(() => {});
  await db.execute('INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
    [target.id, 'task_assigned', `${sender} sent back "${task.title}": ${reason}`.slice(0, 255), task.id]).catch(() => {});
  ws.sendToUser(Number(target.id), 'task_updated', { id: task.id });
  ws.broadcast(task.team_id, 'task_updated', { id: task.id, assigned_to: target.id, title: task.title });
  return { to: { id: target.id, name: target.name }, version: Number(task.version) + 1 };
}

// Assigning the task to anyone again ends the "Sent back" mark (the reason stays in comments and history).
async function clearSentBack(taskId) {
  await db.execute('UPDATE tasks SET returned_to = NULL WHERE id = ? AND returned_to IS NOT NULL', [taskId]);
}

module.exports = { ensureSendBackSchema, sendBack, sendBackInfo, clearSentBack, cleanReason, MIN_REASON, MAX_REASON };
