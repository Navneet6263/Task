const db = require('../config/database');
const ws = require('../websocket');
const { canAccessTeam } = require('../utils/teamAccess');
const { isModuleEnabled } = require('./orgModules');

// Bug tracking (module bug_tracking). A bug moves New → Ready to pick → Fixing → Ready for QA → Done.
// Bugs still use the 4 task statuses underneath, so lists, reports, the API and webhooks keep working.
const STAGES = ['new', 'ready', 'fixing', 'qa', 'done'];
const STAGE_NAMES = { new: 'New', ready: 'Ready to pick', fixing: 'Fixing', qa: 'Ready for QA', done: 'Done' };
const STATUS_OF = { new: 'TODO', ready: 'TODO', fixing: 'IN_PROGRESS', qa: 'PENDING', done: 'DONE' };
const ROLES = ['developer', 'qa', 'both'];
const ACTIONS = ['ready', 'pick', 'release', 'fixed', 'pass', 'fail'];
const NEEDS_NOTE = ['fixed', 'fail'];
const WIP_LIMIT = 3; // bugs one developer may have in Fixing at once, so nobody hoards the queue

const fail = (status, message) => Object.assign(new Error(message), { status });
const isTrue = (value) => value === true || value === 1;
const isDev = (role) => role === 'developer' || role === 'both';
const isQa = (role) => role === 'qa' || role === 'both';
const same = (a, b) => a != null && b != null && Number(a) === Number(b);

// Bugs made before the module was on have no stage: read it from their status.
function stageOf(task) {
  if (STAGES.includes(task.bug_stage)) return task.bug_stage;
  if (task.status === 'DONE') return 'done';
  if (task.status === 'PENDING' && task.fixed_at) return 'qa';
  return task.assigned_to ? 'fixing' : 'ready';
}

// The stage a lead's direct status change means.
const stageFromStatus = (status, assignedTo) => (
  { DONE: 'done', PENDING: 'qa', IN_PROGRESS: 'fixing' }[status] || (assignedTo ? 'fixing' : 'ready'));

// What this person may do with this bug now.
// who = { id, role ('developer' | 'qa' | 'both' | null), isLead, teamHasRoles }
// Until a team marks anyone as Developer or QA, everyone in it may do each step,
// except passing their own fix. Leads (admins, managers, the team leader) may do every step.
function actionsFor(task, who) {
  const stage = stageOf(task);
  const open = !who.teamHasRoles;
  const dev = open || who.isLead || isDev(who.role);
  const qa = open || who.isLead || isQa(who.role);
  const mine = same(task.assigned_to, who.id);
  const out = [];
  if (stage === 'new' && qa) out.push('ready');
  if (stage === 'ready' && dev && who.id) out.push('pick');
  if (stage === 'fixing' && mine) out.push('release');
  if (stage === 'fixing' && (mine || who.isLead)) out.push('fixed');
  if ((stage === 'qa' || stage === 'done') && qa && (!mine || who.isLead)) out.push(stage === 'qa' ? 'pass' : null, 'fail');
  return out.filter(Boolean);
}

// Why an action is refused, in words the person can act on.
function whyNot(task, who, action) {
  const stage = stageOf(task);
  const fits = { ready: ['new'], pick: ['ready'], release: ['fixing'], fixed: ['fixing'], pass: ['qa'], fail: ['qa', 'done'] }[action] || [];
  if (!fits.includes(stage)) return `This bug is in ${STAGE_NAMES[stage]} now. Reload it to see the latest.`;
  if (action === 'ready') return 'Only QA or the team leader can move a bug to Ready to pick.';
  if (action === 'pick') return 'Only developers in this team can pick bugs. Ask the team leader to mark you as Developer.';
  if (action === 'release' || action === 'fixed') return 'Only the developer working on this bug can do that.';
  if (same(task.assigned_to, who.id)) return 'You fixed this bug, so someone else has to check it.';
  return 'Only QA in this team can pass or fail a fix.';
}

async function isOn(orgId) {
  return Boolean(orgId) && isModuleEnabled(orgId, 'bug_tracking');
}

async function teamRoles(teamId) {
  const [rows] = await db.execute('SELECT user_id, work_role FROM team_work_roles WHERE team_id = ?', [teamId]);
  return new Map(rows.map((row) => [Number(row.user_id), row.work_role]));
}

// Admins, managers and the team's leader run the team's bugs.
async function isTeamLead(req, teamId) {
  if (['admin', 'company_admin', 'manager'].includes(req.userRole)) return true;
  const [[row]] = await db.execute('SELECT TOP 1 is_reporting_manager FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, req.userId]);
  return isTrue(row?.is_reporting_manager);
}

async function whoIs(req, task, roles) {
  const map = roles || await teamRoles(task.team_id);
  // A company admin has no user account inside the team, so they never pick or fix themselves.
  const id = req.userRole === 'company_admin' ? null : Number(req.userId) || null;
  return { id, role: id ? map.get(id) || null : null, isLead: await isTeamLead(req, task.team_id), teamHasRoles: map.size > 0 };
}

async function loadBug(req, taskId) {
  const id = Number(taskId);
  if (!Number.isInteger(id) || id <= 0) throw fail(404, 'Bug not found');
  const [[task]] = await db.execute('SELECT * FROM tasks WHERE id = ? AND is_deleted = FALSE', [id]);
  if (!task || task.issue_type !== 'bug') throw fail(404, 'Bug not found');
  if (!await canAccessTeam(req, task.team_id)) throw fail(403, 'Team access denied');
  if (!await isOn(task.org_id)) throw fail(403, 'Bug tracking is not turned on for this workspace');
  return task;
}

async function nameOf(userId) {
  if (!userId) return null;
  const [[row]] = await db.execute('SELECT name FROM users WHERE id = ?', [userId]);
  return row?.name || null;
}

// Who checks a fix: the QA already on the bug, else the reporter when they are QA,
// else the team's QA with the fewest fixes waiting, else whoever reported it.
async function chooseQa(task, roles) {
  if (task.qa_user_id && !same(task.qa_user_id, task.assigned_to)) return Number(task.qa_user_id);
  if (task.reported_by && isQa(roles.get(Number(task.reported_by))) && !same(task.reported_by, task.assigned_to)) return Number(task.reported_by);
  const qas = [...roles].filter(([userId, role]) => isQa(role) && !same(userId, task.assigned_to)).map(([userId]) => userId);
  if (qas.length) {
    const [rows] = await db.execute(
      `SELECT qa_user_id, COUNT(*) AS waiting FROM tasks WHERE team_id = ? AND bug_stage = 'qa' AND is_deleted = FALSE
         AND qa_user_id IN (${qas.map(() => '?').join(',')}) GROUP BY qa_user_id`, [task.team_id, ...qas]);
    const load = new Map(rows.map((row) => [Number(row.qa_user_id), Number(row.waiting)]));
    return qas.sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0) || a - b)[0];
  }
  return task.reported_by ? Number(task.reported_by) : null;
}

async function notify(userId, actorId, taskId, message) {
  if (!userId || same(userId, actorId)) return;
  await db.execute('INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)', [userId, 'task_updated', message.slice(0, 255), taskId]);
  ws.sendToUser(Number(userId), 'task_updated', { id: taskId });
}

// What the task window shows: the stage, who checks it, and the buttons this person gets.
async function view(req, taskId) {
  const task = await loadBug(req, taskId);
  const roles = await teamRoles(task.team_id);
  const who = await whoIs(req, task, roles);
  return {
    stage: stageOf(task), stages: STAGES.map((key) => ({ key, name: STAGE_NAMES[key] })),
    actions: actionsFor(task, who), my_role: who.role, team_has_roles: who.teamHasRoles, is_lead: who.isLead,
    qa_user_id: task.qa_user_id || null, qa_name: await nameOf(task.qa_user_id),
    reopen_count: Number(task.reopen_count || 0), wip_limit: WIP_LIMIT, version: task.version,
  };
}

// Pick, Give back, Mark fixed, Pass, Fail, or move to Ready to pick.
async function act(req, taskId, action, rawNote) {
  if (!ACTIONS.includes(action)) throw fail(404, 'Unknown action');
  const task = await loadBug(req, taskId);
  const roles = await teamRoles(task.team_id);
  const who = await whoIs(req, task, roles);
  if (!actionsFor(task, who).includes(action)) throw fail(409, whyNot(task, who, action));
  const note = String(rawNote || '').trim().slice(0, 2000);
  if (NEEDS_NOTE.includes(action) && !note) throw fail(422, action === 'fixed' ? 'Write a line about what you fixed.' : 'Write what is still wrong.');

  if (action === 'pick') {
    const [[{ busy }]] = await db.execute(
      `SELECT COUNT(*) AS busy FROM tasks WHERE team_id = ? AND assigned_to = ? AND issue_type = 'bug' AND bug_stage = 'fixing' AND is_deleted = FALSE`,
      [task.team_id, who.id]);
    if (Number(busy) >= WIP_LIMIT) throw fail(409, `You already have ${WIP_LIMIT} bugs in Fixing. Finish or give back one first.`);
  }

  const actor = await nameOf(req.userId) || 'Someone';
  let stage, sets = [], params = [], log, message, notifyId;
  if (action === 'ready') {
    stage = 'ready'; log = 'Bug Ready'; message = `${actor} moved it to Ready to pick`;
  } else if (action === 'pick') {
    stage = 'fixing'; sets = ['assigned_to = ?', 'picked_by = ?', 'picked_at = CURRENT_TIMESTAMP']; params = [who.id, who.id];
    log = 'Bug Picked'; message = `${actor} picked your bug: ${task.title}`; notifyId = task.reported_by;
  } else if (action === 'release') {
    stage = 'ready'; sets = ['assigned_to = NULL', 'picked_by = NULL']; log = 'Bug Given Back'; message = `${actor} gave it back to the queue`;
  } else if (action === 'fixed') {
    const qa = await chooseQa(task, roles);
    stage = 'qa'; sets = ['fixed_at = CURRENT_TIMESTAMP', 'qa_user_id = ?']; params = [qa];
    log = 'Bug Fixed'; message = `${actor} fixed a bug for you to check: ${task.title}`; notifyId = qa;
  } else if (action === 'pass') {
    stage = 'done'; sets = ['resolved_at = CURRENT_TIMESTAMP', 'completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)'];
    log = 'Bug Passed'; message = `${actor} checked your fix and closed it: ${task.title}`; notifyId = task.assigned_to;
  } else {
    stage = 'fixing'; sets = ['reopen_count = reopen_count + 1', 'completed_at = NULL', 'resolved_at = NULL'];
    log = 'Bug Failed Check'; message = `${actor} sent the bug back to you: ${task.title}`; notifyId = task.assigned_to;
  }

  const status = STATUS_OF[stage];
  const [result] = await db.execute(
    `UPDATE tasks SET bug_stage = ?, status = ?, ${sets.length ? `${sets.join(', ')}, ` : ''}version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND version = ? AND is_deleted = FALSE`,
    [stage, status, ...params, task.id, task.version]);
  if (!result.affectedRows) throw fail(409, 'Someone changed this bug just now. Reload it and try again.');

  // The note goes in the comments, where the developer and QA already talk about the bug.
  if (note && who.id) {
    await db.execute('INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)',
      [task.id, who.id, `${action === 'fixed' ? 'Fixed' : 'Check failed'}: ${note}`]);
  }
  await db.execute('INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.userId, task.team_id, task.id, log, task.title, JSON.stringify({ stage: { before: STAGE_NAMES[stageOf(task)], after: STAGE_NAMES[stage] } }), 'User (Local)']).catch(() => {});
  if (notifyId) await notify(notifyId, req.userId, task.id, message).catch(() => {});
  ws.broadcast(task.team_id, 'task_updated', { id: task.id, status, bug_stage: stage, title: task.title });
  return { stage, status, version: Number(task.version) + 1 };
}

// A new bug: QA and leads have already looked at it, so theirs go straight to Ready to pick.
async function onBugCreated(req, task) {
  if (task.issue_type !== 'bug' || !await isOn(task.org_id)) return;
  const roles = await teamRoles(task.team_id);
  const role = roles.get(Number(req.userId)) || null;
  const checked = !roles.size || isQa(role) || await isTeamLead(req, task.team_id);
  const stage = task.assigned_to ? 'fixing' : checked ? 'ready' : 'new';
  const qa = !roles.size || isQa(role) ? Number(req.userId) || null : null;
  await db.execute('UPDATE tasks SET bug_stage = ?, qa_user_id = ? WHERE id = ?', [stage, same(qa, task.assigned_to) ? null : qa, task.id]);
}

// A plain task edit on a bug. Status moves by the buttons; only leads may set it directly.
// Changing who works on it moves it between Ready to pick and Fixing.
// Returns null, or { stage, status } to save with the edit.
async function planEdit(req, current, next) {
  if (current.issue_type !== 'bug' || !await isOn(current.org_id)) return null;
  const stage = stageOf(current);
  if (next.status !== current.status) {
    if (!await isTeamLead(req, current.team_id)) {
      throw fail(409, 'Bugs move with the buttons at the top of the bug: Pick, Mark fixed, then Pass or Fail.');
    }
    return { stage: stageFromStatus(next.status, next.assigned_to), status: next.status };
  }
  if (!same(next.assigned_to, current.assigned_to)) {
    if (next.assigned_to && (stage === 'new' || stage === 'ready')) return { stage: 'fixing', status: STATUS_OF.fixing };
    if (!next.assigned_to && stage === 'fixing') return { stage: 'ready', status: STATUS_OF.ready };
  }
  return current.bug_stage ? null : { stage, status: current.status };
}

const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PER_COLUMN = 100;
const DONE_DAYS = 14; // Done shows the last two weeks; older bugs stay in List and Reports

// The team's Bugs board: every open bug by stage, plus what was closed lately.
// Most severe first; inside a severity the oldest first, so the queue is fair. Done: newest first.
async function board(req, teamId) {
  if (!await canAccessTeam(req, teamId)) throw fail(403, 'Team access denied');
  const [[team]] = await db.execute('SELECT org_id FROM teams WHERE id = ? AND is_deleted = FALSE', [teamId]);
  if (!await isOn(team?.org_id)) throw fail(403, 'Bug tracking is not turned on for this workspace');
  const [rows] = await db.execute(
    `SELECT TOP 600 t.id, t.title, t.status, t.bug_stage, t.assigned_to, t.severity, t.priority, t.reopen_count, t.qa_user_id,
       t.affected_module, t.environment, t.due_date, t.created_at, t.fixed_at, t.resolved_at, t.completed_at, t.version,
       u.name AS assigned_to_name, u.avatar AS assigned_to_avatar, q.name AS qa_user_name, r.name AS reported_by_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN users q ON q.id = t.qa_user_id
     LEFT JOIN users r ON r.id = t.reported_by
     WHERE t.team_id = ? AND t.issue_type = 'bug' AND t.is_deleted = FALSE
       AND (t.status <> 'DONE' OR COALESCE(t.resolved_at, t.completed_at, t.updated_at) >= DATEADD(DAY, -${DONE_DAYS}, SYSDATETIME()))
     ORDER BY t.created_at ASC, t.id ASC`,
    [teamId]);
  const columns = Object.fromEntries(STAGES.map((key) => [key, []]));
  rows.forEach((row) => columns[stageOf(row)].push({ ...row, bug_stage: stageOf(row), reopen_count: Number(row.reopen_count || 0) }));
  const rank = (row) => SEVERITY_RANK[String(row.severity || '').toUpperCase()] ?? 2;
  STAGES.forEach((key) => columns[key].sort(key === 'done'
    ? (a, b) => new Date(b.resolved_at || b.completed_at || 0) - new Date(a.resolved_at || a.completed_at || 0)
    : (a, b) => rank(a) - rank(b)));
  const counts = Object.fromEntries(STAGES.map((key) => [key, columns[key].length]));
  STAGES.forEach((key) => { columns[key] = columns[key].slice(0, PER_COLUMN); });

  const roles = await teamRoles(teamId);
  const who = await whoIs(req, { team_id: teamId }, roles);
  const open = rows.filter((row) => stageOf(row) !== 'done');
  return {
    stages: STAGES.map((key) => ({ key, name: STAGE_NAMES[key] })), columns, counts, done_days: DONE_DAYS,
    summary: {
      open: open.length,
      critical: open.filter((row) => rank(row) === 0).length,
      reopened: open.filter((row) => Number(row.reopen_count) > 0).length,
    },
    me: {
      id: who.id, role: who.role, is_lead: who.isLead, team_has_roles: who.teamHasRoles, wip_limit: WIP_LIMIT,
      fixing: columns.fixing.filter((row) => same(row.assigned_to, who.id)).length,
      can_pick: Boolean(who.id) && (!who.teamHasRoles || who.isLead || isDev(who.role)),
    },
  };
}

async function rolesOfTeam(req, teamId) {
  if (!await canAccessTeam(req, teamId)) throw fail(403, 'Team access denied');
  const [[team]] = await db.execute('SELECT org_id FROM teams WHERE id = ?', [teamId]);
  if (!await isOn(team?.org_id)) throw fail(403, 'Bug tracking is not turned on for this workspace');
  const [rows] = await db.execute('SELECT user_id, work_role FROM team_work_roles WHERE team_id = ?', [teamId]);
  return { roles: rows.map((row) => ({ user_id: Number(row.user_id), work_role: row.work_role })), can_edit: await isTeamLead(req, teamId) };
}

// Admins, managers and the team leader mark people as Developer, QA or both. null clears it.
async function setRole(req, teamId, userId, workRole) {
  const role = workRole === null || workRole === '' ? null : String(workRole);
  if (role !== null && !ROLES.includes(role)) throw fail(422, 'Choose Developer, QA or both');
  const { can_edit: canEdit } = await rolesOfTeam(req, teamId);
  if (!canEdit) throw fail(403, 'Only admins, managers and the team leader can set Developer and QA');
  const [[member]] = await db.execute(
    'SELECT TOP 1 tm.user_id FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? AND tm.user_id = ? AND u.is_deleted = FALSE',
    [teamId, userId]);
  if (!member) throw fail(404, 'This person is not in the team');
  await db.execute('DELETE FROM team_work_roles WHERE team_id = ? AND user_id = ?', [teamId, userId]);
  if (role) {
    await db.execute('INSERT INTO team_work_roles (team_id, user_id, work_role, set_by) VALUES (?, ?, ?, ?)',
      [teamId, userId, role, req.userRole === 'company_admin' ? null : req.userId]);
  }
  return rolesOfTeam(req, teamId);
}

module.exports = {
  STAGES, STAGE_NAMES, STATUS_OF, ROLES, ACTIONS, WIP_LIMIT,
  stageOf, stageFromStatus, actionsFor, whyNot, isOn, view, act, onBugCreated, planEdit, board, rolesOfTeam, setRole,
};
