const db = require('../config/database');
const ws = require('../websocket');
const { taskPayload } = require('./webhooks');
const extras = require('./taskExtras');
const { isPlaceholderEmail } = require('./employeeAccounts');

// Creating and changing tasks for other software (API keys and incoming connections). Everything
// is limited to one company; the actor is the admin who set the connection up. In test mode every
// check runs but nothing is saved and no one is told.

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const STATUSES = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const text = (value, max, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw fail(422, 'invalid_field', `"${field}" must be text`);
  return String(value).trim().slice(0, max);
};

async function shape(taskId, orgId) {
  const t = await taskPayload(taskId);
  if (!t) return null;
  const { org_id: _org, ...rest } = t;
  return { key: `${await extras.orgPrefix(orgId)}-${t.id}`, ...rest, assigned_to_email: isPlaceholderEmail(t.assigned_to_email) ? null : t.assigned_to_email };
}

// "team": an id or an exact team name; with one team in the company it may be left out.
async function resolveTeam(orgId, value) {
  const [teams] = await db.execute('SELECT id, name FROM teams WHERE org_id = ? AND is_deleted = FALSE', [orgId]);
  if (value === undefined || value === null || value === '') {
    if (teams.length === 1) return teams[0].id;
    throw fail(422, 'team_required', 'Say which team: "team": <id or name>');
  }
  const hit = teams.find((t) => String(t.id) === String(value) || t.name.toLowerCase() === String(value).trim().toLowerCase());
  if (!hit) throw fail(422, 'unknown_team', `No team "${value}" in this company`);
  return hit.id;
}

// "assignee": { "id" } or { "email" } or { "employee_code" }, or a plain email / code. Null clears it.
async function resolvePerson(orgId, value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const ref = typeof value === 'object' ? value : (String(value).includes('@') ? { email: value } : { employee_code: value });
  const [column, param] = ref.id ? ['u.id', Number(ref.id)] : ref.email ? ['u.email', String(ref.email).trim().toLowerCase()]
    : ref.employee_code ? ['u.login_code', String(ref.employee_code).trim().toUpperCase()] : [null, null];
  if (!column) throw fail(422, 'invalid_assignee', 'Give the assignee as { "email" }, { "employee_code" } or { "id" }');
  const [[person]] = await db.execute(`SELECT u.id FROM users u WHERE ${column} = ? AND u.org_id = ? AND u.is_deleted = FALSE`, [param, orgId]);
  if (!person) throw fail(422, 'unknown_assignee', 'No one with that email, employee code or id in this company');
  return person.id;
}

// Only these columns can ever be written, whatever the caller sends.
async function readFields(orgId, body, { creating }) {
  const out = {};
  const title = text(body.title, 255, 'title');
  if (creating && !title) throw fail(422, 'title_required', '"title" is required');
  if (title !== undefined) { if (!title) throw fail(422, 'title_required', '"title" cannot be empty'); out.title = title; }
  ['description', 'client_name'].forEach((key) => { const v = text(body[key], key === 'description' ? 5000 : 255, key); if (v !== undefined) out[key] = v; });
  if (body.status !== undefined) { if (!STATUSES.includes(body.status)) throw fail(422, 'invalid_status', `"status" must be one of ${STATUSES.join(', ')}`); out.status = body.status; }
  if (body.priority !== undefined) { if (!PRIORITIES.includes(body.priority)) throw fail(422, 'invalid_priority', `"priority" must be one of ${PRIORITIES.join(', ')}`); out.priority = body.priority; }
  ['due_date', 'start_date'].forEach((key) => {
    if (body[key] === undefined) return;
    if (body[key] !== null && !isDate(body[key])) throw fail(422, 'invalid_date', `"${key}" must look like 2026-11-30`);
    out[key] = body[key] || null;
  });
  const assignee = await resolvePerson(orgId, body.assignee);
  if (assignee !== undefined) out.assigned_to = assignee;
  if (body.labels !== undefined && !Array.isArray(body.labels)) throw fail(422, 'invalid_labels', '"labels" must be a list of names');
  return out;
}

async function assigneeInTeam(teamId, userId) {
  if (!userId) return;
  const [[member]] = await db.execute('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
  if (!member) throw fail(422, 'assignee_not_in_team', 'The assignee is not in that team');
}

async function applyLabels(orgId, taskId, names) {
  if (!Array.isArray(names)) return;
  const ids = [];
  for (const name of names.slice(0, 10)) if (String(name || '').trim()) ids.push((await extras.createLabel(orgId, null, { name: String(name) })).id);
  await extras.setLabels({ id: taskId, org_id: orgId }, ids);
}

async function update(taskId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((key) => `${key} = ?`);
  if (fields.status !== undefined) sets.push("completed_at = CASE WHEN ? = 'DONE' THEN COALESCE(completed_at, SYSDATETIME()) ELSE NULL END");
  await db.execute(`UPDATE tasks SET ${sets.join(', ')}, version = version + 1, updated_at = SYSDATETIME() WHERE id = ?`,
    [...keys.map((key) => fields[key]), ...(fields.status !== undefined ? [fields.status] : []), taskId]);
}

async function ownTask(orgId, idOrKey) {
  const id = extras.idFromKey(idOrKey);
  const [[task]] = id ? await db.execute('SELECT id, team_id, status FROM tasks WHERE id = ? AND org_id = ? AND is_deleted = FALSE', [id, orgId]) : [[]];
  if (!task) throw fail(404, 'not_found', 'Task not found');
  return task;
}

// Create a task, or update it when this source already sent the same external id.
// Returns { created, data } (data is a preview in test mode).
async function upsertTask({ orgId, actorId, actorLabel, body, test = false }) {
  const externalId = text(body.external_id, 100, 'external_id') || null;
  const source = (text(body.source, 40, 'source') || 'api').toLowerCase();
  if (externalId) {
    const [[existing]] = await db.execute(
      'SELECT id, team_id FROM tasks WHERE org_id = ? AND external_source = ? AND external_id = ? AND is_deleted = FALSE', [orgId, source, externalId]
    );
    if (existing) {
      const fields = await readFields(orgId, body, { creating: false });
      await assigneeInTeam(existing.team_id, fields.assigned_to);
      if (test) return { created: false, test: true, data: { id: existing.id, ...fields, external_id: externalId, source } };
      await update(existing.id, fields);
      await applyLabels(orgId, existing.id, body.labels);
      ws.broadcast(existing.team_id, 'task_updated', { id: existing.id, status: fields.status });
      return { created: false, data: await shape(existing.id, orgId) };
    }
  }
  const fields = await readFields(orgId, body, { creating: true });
  const teamId = await resolveTeam(orgId, body.team);
  await assigneeInTeam(teamId, fields.assigned_to);
  if (test) return { created: true, test: true, data: { id: null, team_id: teamId, status: 'TODO', priority: 'MEDIUM', ...fields, external_id: externalId, source } };
  const [created] = await db.execute(
    `INSERT INTO tasks (title, description, priority, status, assigned_to, assigned_by, team_id, org_id, issue_type, assigned_date,
       start_date, due_date, client_name, external_source, external_id, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'task', CAST(GETDATE() AS DATE), ?, ?, ?, ?, ?, ${fields.status === 'DONE' ? 'SYSDATETIME()' : 'NULL'})`,
    [fields.title, fields.description || null, fields.priority || 'MEDIUM', fields.status || 'TODO', fields.assigned_to || null, actorId, teamId, orgId,
      fields.start_date || null, fields.due_date || null, fields.client_name || null, source, externalId]
  ).catch((error) => {
    if ([2601, 2627].includes(error?.number) || [2601, 2627].includes(error?.originalError?.info?.number)) {
      throw fail(409, 'duplicate_external_id', 'A task with this external_id was created a moment ago. Send the request again to update it.');
    }
    throw error;
  });
  await applyLabels(orgId, created.insertId, body.labels);
  try {
    await db.execute(`INSERT INTO audit_logs (team_id, task_id, user_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, 'Task Created', ?, ?, 'api')`,
      [teamId, created.insertId, actorId, fields.title, `Created by ${actorLabel}`]);
  } catch (_) { /* the task matters more than its log line */ }
  ws.broadcast(teamId, 'task_created', { id: created.insertId, title: fields.title, status: fields.status || 'TODO', team_id: teamId });
  return { created: true, data: await shape(created.insertId, orgId) };
}

async function patchTask({ orgId, idOrKey, body, test = false }) {
  const task = await ownTask(orgId, idOrKey);
  const fields = await readFields(orgId, body, { creating: false });
  await assigneeInTeam(task.team_id, fields.assigned_to);
  if (test) return { test: true, data: { id: task.id, ...fields } };
  await update(task.id, fields);
  await applyLabels(orgId, task.id, body.labels);
  ws.broadcast(task.team_id, 'task_updated', { id: task.id, status: fields.status });
  return { data: await shape(task.id, orgId) };
}

module.exports = { fail, STATUSES, PRIORITIES, shape, resolveTeam, resolvePerson, readFields, ownTask, upsertTask, patchTask };
