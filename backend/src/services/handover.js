const db = require('../config/database');
const ws = require('../websocket');
const { canAccessTeam } = require('../utils/teamAccess');
const { companyOrgIds } = require('./companyPeople');

// Hand over: a manager or team leader moves a task to another team of the same company (any of its workspaces),
// to that team's leader. Each step is a row in task_handovers, so a task can travel IT → Sales → Finance and
// "Send back" walks it one step back (services/sendBack.js). The person who handed it over keeps a read-only view
// of where it is and its status (My Tasks → Handed over); they cannot open or change it there.

const MAX_NOTE = 500;
const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });
const isTrue = (v) => v === true || v === 1 || v === '1';

async function ensureHandoverSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.task_handovers', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.task_handovers (
        id INT IDENTITY PRIMARY KEY,
        task_id INT NOT NULL,
        from_team_id INT NOT NULL,
        to_team_id INT NOT NULL,
        from_user_id INT NOT NULL,
        to_user_id INT NOT NULL,
        note NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        returned_at DATETIME2 NULL);
      CREATE INDEX ix_task_handovers_task ON dbo.task_handovers(task_id, returned_at);
      CREATE INDEX ix_task_handovers_from ON dbo.task_handovers(from_user_id, created_at);
    END
  `);
}

// Managers, admins and the team's leader may hand a task over.
async function isLead(req, teamId) {
  if (['admin', 'company_admin', 'manager'].includes(req.userRole)) return true;
  const [[row]] = await db.execute('SELECT TOP 1 is_reporting_manager FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, req.userId]);
  return isTrue(row?.is_reporting_manager);
}

async function loadTask(req, taskId) {
  const id = Number(taskId);
  if (!Number.isInteger(id) || id < 1) throw fail(404, 'Task not found');
  const [[task]] = await db.execute(
    `SELECT t.id, t.title, t.team_id, t.org_id, t.status, t.issue_type, t.assigned_to, t.parent_task_id, t.version, te.name AS team_name
     FROM tasks t LEFT JOIN teams te ON te.id = t.team_id WHERE t.id = ? AND t.is_deleted = 0`, [id]);
  if (!task || !await canAccessTeam(req, task.team_id)) throw fail(404, 'Task not found');
  return task;
}

// Why this task cannot be handed over now, or ''.
async function whyNot(req, task) {
  if (!await isLead(req, task.team_id)) return 'Only managers and team leaders can hand a task over.';
  if (task.status === 'DONE') return 'This task is already done.';
  if (task.parent_task_id) return 'This is a subtask. Hand over its main task instead.';
  const [[open]] = await db.execute("SELECT COUNT(*) AS n FROM tasks WHERE parent_task_id = ? AND is_deleted = 0 AND status <> 'DONE'", [task.id]);
  if (Number(open?.n)) return 'This task has open subtasks. Finish or move them first.';
  if (task.issue_type === 'bug' && await require('./bugFlow').isOn(task.org_id)) return 'Bugs move with the bug buttons, not by hand over.';
  return '';
}

// The other teams of the company, each with its leader (the person who receives the task).
async function targetTeams(task) {
  const orgIds = await companyOrgIds(task.org_id);
  const [rows] = await db.execute(
    `SELECT t.id, t.name, t.org_id, o.name AS workspace, lead.id AS leader_id, lead.name AS leader_name
     FROM teams t JOIN organizations o ON o.id = t.org_id
     OUTER APPLY (SELECT TOP 1 u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.user_id AND u.is_deleted = 0
                  WHERE tm.team_id = t.id AND tm.is_reporting_manager = 1 ORDER BY tm.id) lead
     WHERE t.is_deleted = 0 AND t.id <> ? AND t.org_id IN (${orgIds.map(() => '?').join(',')})
     ORDER BY CASE WHEN t.org_id = ? THEN 0 ELSE 1 END, o.name, t.name`,
    [task.team_id, ...orgIds, task.org_id]);
  return rows.map((r) => ({
    id: r.id, name: r.name, org_id: r.org_id, workspace: r.workspace,
    leader: r.leader_id ? { id: r.leader_id, name: r.leader_name } : null,
  }));
}

async function handoverOptions(req, taskId) {
  const task = await loadTask(req, taskId);
  const why = await whyNot(req, task);
  if (why) return { allowed: false, reason: why, teams: [] };
  return { allowed: true, teams: await targetTeams(task) };
}

// Moves a task to another team (and maybe workspace). Only while it is still where it was (and, for a send back,
// still with the person sending it), so a parallel change is never overwritten. What belongs to a workspace (labels,
// agent, form answers, bug workers) is cleared when the workspace changes. People who follow the task but are not in
// the new team stop following it, so its updates no longer reach them. Returns whether the workspace changed.
async function moveTask(task, { teamId, orgId, assignee, expectTeamId, expectAssignee = null }) {
  const orgChanges = Number(orgId) !== Number(task.org_id);
  const flag = orgChanges ? 1 : 0;
  const [result] = await db.execute(
    `UPDATE tasks SET team_id = ?, org_id = ?, assigned_to = ?, returned_to = NULL,
       status = CASE WHEN status = 'IN_PROGRESS' THEN 'TODO' ELSE status END,
       agent_firm_id = CASE WHEN ? = 1 THEN NULL ELSE agent_firm_id END,
       custom_fields = CASE WHEN ? = 1 THEN NULL ELSE custom_fields END,
       picked_by = CASE WHEN ? = 1 THEN NULL ELSE picked_by END,
       qa_user_id = CASE WHEN ? = 1 THEN NULL ELSE qa_user_id END,
       version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND team_id = ? AND is_deleted = 0 AND status <> 'DONE' AND (? IS NULL OR assigned_to = ?)`,
    [teamId, orgId, assignee, flag, flag, flag, flag, task.id, expectTeamId, expectAssignee, expectAssignee]);
  if (!Number(result?.affectedRows)) throw fail(409, 'Someone changed this task just now. Reload it and try again.');
  if (orgChanges) await db.execute('DELETE FROM task_label_links WHERE task_id = ?', [task.id]).catch(() => {});
  await db.execute('DELETE FROM task_followers WHERE task_id = ? AND user_id NOT IN (SELECT user_id FROM team_members WHERE team_id = ?)', [task.id, teamId]).catch(() => {});
  return orgChanges;
}

const CLEARED = ' Labels, agent and form answers of the other workspace were cleared.';
async function isLeaderOf(userId, teamId) {
  const [[row]] = await db.execute('SELECT TOP 1 is_reporting_manager FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
  return isTrue(row?.is_reporting_manager);
}
// The leader of a team (the person a hand over or a send back to that team reaches), or null.
async function leaderOf(teamId, exceptUserId = null) {
  const [[lead]] = await db.execute(
    `SELECT TOP 1 u.id, u.name FROM team_members tm JOIN users u ON u.id = tm.user_id AND u.is_deleted = 0
     WHERE tm.team_id = ? AND tm.is_reporting_manager = 1 AND (? IS NULL OR u.id <> ?) ORDER BY tm.id`,
    [teamId, exceptUserId, exceptUserId]);
  return lead || null;
}

async function record(req, task, kind, { fromTeam, toTeam, toUser, note, orgChanged = false }) {
  const [[me]] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
  const sender = me?.name || 'Someone';
  const words = kind === 'handover'
    ? `Handed over from ${fromTeam.name} to ${toTeam.name} (${toUser.name})${note ? `: ${note}` : ''}`
    : `Sent back from ${fromTeam.name} to ${toTeam.name} (${toUser.name})${note ? `: ${note}` : ''}`;
  await db.execute('INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)', [task.id, req.userId, `${words}${orgChanged ? CLEARED : ''}`.slice(0, 4000)]);
  await db.execute(
    'INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.userId, toTeam.id, task.id, kind === 'handover' ? 'Task Handed Over' : 'Task Sent Back', task.title,
      JSON.stringify({ team: { before: fromTeam.name, after: toTeam.name }, assigned_to: { before: Number(task.assigned_to) || null, after: Number(toUser.id) } }), 'User (Local)']).catch(() => {});
  const message = kind === 'handover'
    ? `${sender} handed over "${task.title}" to ${toTeam.name}${note ? `: ${note}` : ''}`
    : `${sender} sent back "${task.title}"${note ? `: ${note}` : ''}`;
  await db.execute('INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)', [toUser.id, 'task_assigned', message.slice(0, 255), task.id]).catch(() => {});
  ws.sendToUser(Number(toUser.id), 'task_updated', { id: task.id });
  ws.broadcast(fromTeam.id, 'task_updated', { id: task.id, team_id: toTeam.id });
  ws.broadcast(toTeam.id, 'task_updated', { id: task.id, assigned_to: toUser.id, title: task.title });
}

async function handOver(req, taskId, body = {}) {
  const task = await loadTask(req, taskId);
  const why = await whyNot(req, task);
  if (why) throw fail(403, why);
  const note = String(body.note ?? '').replace(/\s+/g, ' ').trim();
  if (note.length > MAX_NOTE) throw fail(422, `Keep the note under ${MAX_NOTE} characters.`, { note: `At most ${MAX_NOTE} characters` });
  if (body.version !== undefined && Number(body.version) !== Number(task.version)) throw fail(409, 'Someone changed this task just now. Reload it and try again.');
  const team = (await targetTeams(task)).find((t) => Number(t.id) === Number(body.team_id));
  if (!team) throw fail(422, 'Pick a team of your company from the list.', { team_id: 'Pick a team' });
  if (!team.leader) throw fail(422, `${team.name} has no team leader yet. Ask its admin to set one, then hand it over.`, { team_id: 'No leader' });

  const orgChanged = await moveTask(task, { teamId: team.id, orgId: team.org_id, assignee: team.leader.id, expectTeamId: task.team_id });
  await db.execute(
    'INSERT INTO task_handovers (task_id, from_team_id, to_team_id, from_user_id, to_user_id, note) VALUES (?, ?, ?, ?, ?, ?)',
    [task.id, task.team_id, team.id, req.userId, team.leader.id, note || null]);
  await record(req, task, 'handover', { fromTeam: { id: task.team_id, name: task.team_name }, toTeam: team, toUser: team.leader, note, orgChanged });
  return { team: { id: team.id, name: team.name, workspace: team.workspace }, to: team.leader };
}

// The latest step that brought the task into the team it is in now, if it is still open.
async function activeHandover(task) {
  const [[step]] = await db.execute(
    `SELECT TOP 1 h.id, h.from_team_id, h.from_user_id, h.to_user_id, ft.name AS from_team_name, ft.org_id AS from_org_id,
       fu.name AS from_user_name, fu.is_deleted AS from_user_deleted
     FROM task_handovers h JOIN teams ft ON ft.id = h.from_team_id LEFT JOIN users fu ON fu.id = h.from_user_id
     WHERE h.task_id = ? AND h.to_team_id = ? AND h.returned_at IS NULL AND ft.is_deleted = 0
     ORDER BY h.id DESC`, [task.id, task.team_id]);
  return step || null;
}

// Whether this person answers for the team that received the task: the leader it was handed to, or whoever leads
// that team now (a new leader can still send it back).
async function isReceiver(userId, task, step) {
  return Number(step.to_user_id) === Number(userId) || isLeaderOf(userId, task.team_id);
}

// Who takes it back one step: the person who handed it over if they are still in that team, else that team's leader.
async function acrossTarget(step) {
  if (!isTrue(step.from_user_deleted)) {
    const [[still]] = await db.execute('SELECT TOP 1 id FROM team_members WHERE team_id = ? AND user_id = ?', [step.from_team_id, step.from_user_id]);
    if (still) return { id: step.from_user_id, name: step.from_user_name };
  }
  return leaderOf(step.from_team_id);
}

// "Send back" by the leader who received it: one step back, to the team and the person it came from.
async function sendBackAcross(req, task, step, reason) {
  const target = await acrossTarget(step);
  if (!target) throw fail(409, `${step.from_team_name} has nobody to take it back (no leader). Ask your admin where it should go.`);
  step = { ...step, from_user_id: target.id, from_user_name: target.name };
  const orgChanged = await moveTask(task, { teamId: step.from_team_id, orgId: step.from_org_id, assignee: step.from_user_id, expectTeamId: task.team_id, expectAssignee: req.userId });
  await db.execute('UPDATE task_handovers SET returned_at = SYSDATETIME() WHERE id = ?', [step.id]);
  // The card shows "Sent back" for the person who receives it again.
  await db.execute('UPDATE tasks SET returned_by = ?, returned_to = ?, returned_reason = ?, returned_at = CURRENT_TIMESTAMP WHERE id = ?',
    [req.userId, step.from_user_id, reason, task.id]);
  await record(req, task, 'sendback', {
    fromTeam: { id: task.team_id, name: task.team_name }, toTeam: { id: step.from_team_id, name: step.from_team_name },
    toUser: { id: step.from_user_id, name: step.from_user_name }, note: reason, orgChanged,
  });
  return { to: { id: step.from_user_id, name: step.from_user_name }, team: { id: step.from_team_id, name: step.from_team_name } };
}

// My Tasks → Handed over: what I handed over, where it is now and its status (read-only).
async function handedOverBy(userId) {
  const [rows] = await db.execute(
    `SELECT TOP 50 * FROM (
       SELECT h.id, h.task_id, h.note, h.created_at, h.returned_at, ft.name AS from_team, tt.name AS to_team,
         t.title, t.status, t.priority, CONVERT(VARCHAR(10), t.due_date, 23) AS due_date, t.updated_at, t.is_deleted,
         cur.name AS current_team, og.name AS workspace, au.name AS assignee,
         ROW_NUMBER() OVER (PARTITION BY h.task_id ORDER BY h.id DESC) AS rn
       FROM task_handovers h
       JOIN tasks t ON t.id = h.task_id
       LEFT JOIN teams ft ON ft.id = h.from_team_id
       LEFT JOIN teams tt ON tt.id = h.to_team_id
       LEFT JOIN teams cur ON cur.id = t.team_id
       LEFT JOIN organizations og ON og.id = t.org_id
       LEFT JOIN users au ON au.id = t.assigned_to
       WHERE h.from_user_id = ?) x
     WHERE x.rn = 1 ORDER BY x.created_at DESC`, [userId]);
  return rows.map(({ rn, ...r }) => ({ ...r, is_deleted: isTrue(r.is_deleted), sent_back: Boolean(r.returned_at) }));
}

module.exports = { ensureHandoverSchema, handoverOptions, handOver, activeHandover, sendBackAcross, handedOverBy, isLead, isReceiver, acrossTarget, leaderOf, MAX_NOTE };
