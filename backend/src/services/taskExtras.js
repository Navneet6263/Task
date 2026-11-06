const db = require('../config/database');

// Labels, subtasks and links for tasks, always checked against what the person may see.
const fail = (status, message) => Object.assign(new Error(message), { status });
const LINK_TYPES = ['blocks', 'relates', 'duplicates'];
const COLORS = ['green', 'blue', 'violet', 'pink', 'red', 'orange', 'amber', 'teal', 'slate'];
const ids = (list, max = 200) => [...new Set((Array.isArray(list) ? list : String(list || '').split(','))
  .map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, max);
const marks = (list) => list.map(() => '?').join(',');

// ACC-142: the organization's prefix, else the middle of its company code (ORG-ACCO-7XK → ACCO).
const prefixOf = (org) => String(org?.task_prefix || String(org?.company_code || '').split('-')[1] || 'TASK').toUpperCase();
// "ACC-142", "#142" or "142" → 142.
const idFromKey = (text) => { const m = String(text || '').trim().match(/^(?:[A-Za-z]{1,10}-|#)?(\d{1,9})$/); return m ? Number(m[1]) : null; };

// Which of these tasks the person may see: same rule as the rest of the app (admins see their
// organization(s), everyone else the teams they belong to).
function visibleScope(req) {
  if (req.userRole === 'company_admin') return { scope: 't.org_id IN (SELECT id FROM organizations WHERE company_admin_id = ?)', params: [req.companyAdminId] };
  if (req.userRole === 'admin') return { scope: 't.org_id = ?', params: [req.orgId] };
  return {
    scope: 'EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.team_id AND tm.user_id = ?) AND (? IS NULL OR t.org_id = ?)',
    params: [req.userId, req.orgId, req.orgId],
  };
}

async function visibleTasks(req, taskIds) {
  const list = ids(taskIds);
  if (!list.length) return [];
  const { scope, params } = visibleScope(req);
  const [rows] = await db.execute(
    `SELECT t.id, t.title, t.status, t.team_id, t.org_id, t.parent_task_id FROM tasks t
     WHERE t.is_deleted = FALSE AND t.id IN (${marks(list)}) AND ${scope}`,
    [...list, ...params]
  );
  return rows;
}

async function visibleTask(req, taskId) {
  const [task] = await visibleTasks(req, [taskId]);
  if (!task) throw fail(404, 'Task not found');
  return task;
}

async function orgPrefix(orgId) {
  const [[org]] = await db.execute('SELECT task_prefix, company_code FROM organizations WHERE id = ?', [orgId]);
  return prefixOf(org);
}

async function labelsOf(orgId) {
  const [rows] = await db.execute('SELECT id, name, color FROM task_labels WHERE org_id = ? ORDER BY name ASC', [orgId]);
  return rows;
}

// A new label, or the one that already has this name.
async function createLabel(orgId, userId, body) {
  const name = String(body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw fail(422, 'Give the label a name');
  const color = COLORS.includes(body?.color) ? body.color : COLORS[name.length % COLORS.length];
  await db.execute(
    `IF NOT EXISTS (SELECT 1 FROM task_labels WHERE org_id = ? AND name = ?)
       INSERT INTO task_labels (org_id, name, color, created_by) SELECT ?, ?, ?, ?`,
    [orgId, name, orgId, name, color, userId]
  );
  const [[label]] = await db.execute('SELECT id, name, color FROM task_labels WHERE org_id = ? AND name = ?', [orgId, name]);
  return label;
}

// Replace a task's labels with labels of its own organization.
async function setLabels(task, labelIds) {
  const wanted = ids(labelIds, 20);
  const [valid] = wanted.length
    ? await db.execute(`SELECT id FROM task_labels WHERE org_id = ? AND id IN (${marks(wanted)})`, [task.org_id, ...wanted])
    : [[]];
  await db.execute('DELETE FROM task_label_links WHERE task_id = ?', [task.id]);
  for (const { id } of valid) await db.execute('INSERT INTO task_label_links (task_id, label_id) VALUES (?, ?)', [task.id, id]);
  return valid.map((row) => row.id);
}

// Small facts for many cards at once: labels, subtask progress, parent, and open blockers.
async function summaries(req, taskIds) {
  const tasks = await visibleTasks(req, taskIds);
  const list = tasks.map((t) => t.id);
  const out = Object.fromEntries(tasks.map((t) => [t.id, { labels: [], subtasks: null, parent: null, blocked_by: 0 }]));
  if (!list.length) return out;
  const [labels] = await db.execute(
    `SELECT ll.task_id, l.id, l.name, l.color FROM task_label_links ll JOIN task_labels l ON l.id = ll.label_id
     WHERE ll.task_id IN (${marks(list)}) ORDER BY l.name`, list
  );
  labels.forEach((l) => out[l.task_id].labels.push({ id: l.id, name: l.name, color: l.color }));
  const [subs] = await db.execute(
    `SELECT parent_task_id AS id, COUNT(*) AS total, SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done
     FROM tasks WHERE is_deleted = FALSE AND parent_task_id IN (${marks(list)}) GROUP BY parent_task_id`, list
  );
  subs.forEach((s) => { out[s.id].subtasks = { total: Number(s.total), done: Number(s.done) }; });
  const parentIds = [...new Set(tasks.map((t) => t.parent_task_id).filter(Boolean))];
  if (parentIds.length) {
    const [parents] = await db.execute(`SELECT id, title FROM tasks WHERE id IN (${marks(parentIds)})`, parentIds);
    const byId = Object.fromEntries(parents.map((p) => [p.id, p]));
    tasks.forEach((t) => { if (t.parent_task_id && byId[t.parent_task_id]) out[t.id].parent = byId[t.parent_task_id]; });
  }
  const [blocks] = await db.execute(
    `SELECT k.to_task_id AS id, COUNT(*) AS open_blockers FROM task_links k JOIN tasks b ON b.id = k.from_task_id
     WHERE k.link_type = 'blocks' AND k.to_task_id IN (${marks(list)}) AND b.is_deleted = FALSE AND b.status <> 'DONE'
     GROUP BY k.to_task_id`, list
  );
  blocks.forEach((b) => { out[b.id].blocked_by = Number(b.open_blockers); });
  return out;
}

// Everything the task screen shows: labels, parent, subtasks and linked work.
async function detail(req, taskId) {
  const task = await visibleTask(req, taskId);
  const [labels] = await db.execute(
    'SELECT l.id, l.name, l.color FROM task_label_links ll JOIN task_labels l ON l.id = ll.label_id WHERE ll.task_id = ? ORDER BY l.name', [task.id]
  );
  const [subtasks] = await db.execute(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.version, t.assigned_to, u.name AS assigned_to_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.parent_task_id = ? AND t.is_deleted = FALSE ORDER BY t.id`, [task.id]
  );
  const parent = task.parent_task_id ? (await visibleTasks(req, [task.parent_task_id]))[0] || null : null;
  const [links] = await db.execute(
    `SELECT k.id, k.link_type, k.from_task_id, k.to_task_id, o.id AS other_id, o.title AS other_title, o.status AS other_status
     FROM task_links k JOIN tasks o ON o.id = CASE WHEN k.from_task_id = ? THEN k.to_task_id ELSE k.from_task_id END AND o.is_deleted = FALSE
     WHERE k.from_task_id = ? OR k.to_task_id = ? ORDER BY k.id`, [task.id, task.id, task.id]
  );
  const seeable = new Set((await visibleTasks(req, links.map((l) => l.other_id))).map((t) => t.id));
  return {
    id: task.id, prefix: await orgPrefix(task.org_id), labels, parent: parent && { id: parent.id, title: parent.title, status: parent.status },
    subtasks: subtasks.map((s) => ({ ...s })),
    links: links.filter((l) => seeable.has(l.other_id)).map((l) => ({
      id: l.id, type: l.link_type, outward: Number(l.from_task_id) === Number(task.id),
      task: { id: l.other_id, title: l.other_title, status: l.other_status },
    })),
  };
}

// A subtask is a real task in the parent's team, one level deep only.
async function addSubtask(req, parentId, body) {
  const parent = await visibleTask(req, parentId);
  if (parent.parent_task_id) throw fail(422, 'A subtask cannot have its own subtasks');
  const title = String(body?.title || '').trim().slice(0, 255);
  if (!title) throw fail(422, 'Give the subtask a title');
  const assignee = body?.assigned_to ? Number(body.assigned_to) : null;
  if (assignee) {
    const [[member]] = await db.execute('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [parent.team_id, assignee]);
    if (!member) throw fail(422, 'The assignee must be in this team');
  }
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.due_date || '')) ? body.due_date : null;
  const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(body?.priority) ? body.priority : 'MEDIUM';
  const [created] = await db.execute(
    `INSERT INTO tasks (title, priority, status, assigned_to, assigned_by, team_id, org_id, issue_type, assigned_date, due_date, parent_task_id)
     VALUES (?, ?, 'TODO', ?, ?, ?, ?, 'task', CAST(GETDATE() AS DATE), ?, ?)`,
    [title, priority, assignee, req.userId, parent.team_id, parent.org_id, due, parent.id]
  );
  return created.insertId;
}

// Make an existing task a subtask of another one (or detach it with parentId = null).
async function setParent(req, taskId, parentId) {
  const task = await visibleTask(req, taskId);
  if (!parentId) { await db.execute('UPDATE tasks SET parent_task_id = NULL WHERE id = ?', [task.id]); return; }
  const parent = await visibleTask(req, parentId);
  if (parent.id === task.id) throw fail(422, 'A task cannot be its own parent');
  if (parent.parent_task_id) throw fail(422, 'Pick a main task, not a subtask');
  if (parent.team_id !== task.team_id) throw fail(422, 'The parent must be in the same team');
  const [[child]] = await db.execute('SELECT TOP 1 id FROM tasks WHERE parent_task_id = ? AND is_deleted = FALSE', [task.id]);
  if (child) throw fail(422, 'This task has its own subtasks, so it cannot become one');
  await db.execute('UPDATE tasks SET parent_task_id = ? WHERE id = ?', [parent.id, task.id]);
}

// "This task blocks / relates to / duplicates that one". Both tasks must be visible and in one organization.
async function addLink(req, taskId, body) {
  const type = LINK_TYPES.includes(body?.type) ? body.type : null;
  if (!type) throw fail(422, 'Pick how the tasks are linked');
  const task = await visibleTask(req, taskId);
  const otherId = idFromKey(body?.task) || Number(body?.task_id);
  if (!otherId) throw fail(422, 'Pick the other task');
  const other = await visibleTask(req, otherId);
  if (other.id === task.id) throw fail(422, 'Pick another task');
  if (other.org_id !== task.org_id) throw fail(422, 'Both tasks must be in the same organization');
  // "Is blocked by" is stored as the other task blocking this one.
  const [from, to] = body?.inward ? [other.id, task.id] : [task.id, other.id];
  await db.execute(
    `IF NOT EXISTS (SELECT 1 FROM task_links WHERE from_task_id = ? AND to_task_id = ? AND link_type = ?)
       INSERT INTO task_links (org_id, from_task_id, to_task_id, link_type, created_by) SELECT ?, ?, ?, ?, ?`,
    [from, to, type, task.org_id, from, to, type, req.userId]
  );
}

async function removeLink(req, taskId, linkId) {
  const task = await visibleTask(req, taskId);
  await db.execute('DELETE FROM task_links WHERE id = ? AND (from_task_id = ? OR to_task_id = ?)', [Number(linkId), task.id, task.id]);
}

// Tasks to pick for a link or a parent: by key, number or words in the title.
async function search(req, query, teamId) {
  const text = String(query || '').trim().slice(0, 80);
  const byId = idFromKey(text);
  const filters = ['t.is_deleted = FALSE'];
  const params = [];
  if (teamId) { filters.push('t.team_id = ?'); params.push(Number(teamId)); }
  if (byId) { filters.push('(t.id = ? OR t.title LIKE ?)'); params.push(byId, `%${text}%`); }
  else if (text) { filters.push('t.title LIKE ?'); params.push(`%${text}%`); }
  const { scope, params: scopeParams } = visibleScope(req);
  const [rows] = await db.execute(
    `SELECT TOP 10 t.id, t.title, t.status, t.parent_task_id FROM tasks t WHERE ${filters.join(' AND ')} AND ${scope} ORDER BY t.id DESC`,
    [...params, ...scopeParams]
  );
  return rows.map(({ id, title, status, parent_task_id: parent }) => ({ id, title, status, is_subtask: Boolean(parent) }));
}

module.exports = {
  LINK_TYPES, COLORS, prefixOf, idFromKey, visibleTasks, visibleTask, orgPrefix, labelsOf, createLabel, setLabels, summaries, detail,
  addSubtask, setParent, addLink, removeLink, search,
};
