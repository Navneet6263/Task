const db = require('../config/database');

const STATUSES = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const ISSUE_TYPES = ['task', 'bug', 'story', 'feature', 'enhancement'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FOCUS_MODES = ['', 'MY_DAY', 'DUE_TODAY', 'OVERDUE'];

const validationError = (message) => Object.assign(new Error(message), {
  status: 422,
  code: 'VALIDATION_ERROR',
});

const parseList = (value, fieldName) => {
  if (value === undefined || value === null || value === '') return [];
  let values = value;
  if (typeof value === 'string') {
    try {
      values = value.trim().startsWith('[') ? JSON.parse(value) : value.split(',');
    } catch (_) {
      throw validationError(`${fieldName} must be a valid list`);
    }
  }
  if (!Array.isArray(values)) throw validationError(`${fieldName} must be a list`);
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))].slice(0, 50);
};

const parseEnumList = (value, fieldName, allowed) => {
  const values = parseList(value, fieldName);
  if (values.some((item) => !allowed.includes(item))) {
    throw validationError(`${fieldName} contains an unsupported value`);
  }
  return values;
};

const parseIdList = (value, fieldName) => parseList(value, fieldName).map((item) => {
  const id = Number(item);
  if (!Number.isInteger(id) || id <= 0) throw validationError(`${fieldName} contains an invalid user`);
  return id;
});

const parseDate = (value, fieldName) => {
  if (!value) return '';
  const normalized = String(value).trim().slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw validationError(`${fieldName} must be a valid date`);
  return normalized;
};

const parseTaskQuery = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const createdFrom = parseDate(query.created_from, 'created_from');
  const createdTo = parseDate(query.created_to, 'created_to');
  if (createdFrom && createdTo && createdFrom > createdTo) {
    throw validationError('created_from must be on or before created_to');
  }

  const focus = String(query.focus || '').trim().toUpperCase();
  if (!FOCUS_MODES.includes(focus)) throw validationError('focus contains an unsupported value');

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    statuses: parseEnumList(query.statuses || query.status, 'statuses', STATUSES),
    priorities: parseEnumList(query.priorities, 'priorities', PRIORITIES),
    issueTypes: parseEnumList(query.issue_types, 'issue_types', ISSUE_TYPES),
    assignees: parseIdList(query.assignees, 'assignees'),
    clients: parseList(query.clients, 'clients'),
    search: String(query.search || '').trim().slice(0, 120),
    createdFrom,
    createdTo,
    focus,
    sort: ['newest', 'oldest', 'due', 'priority', 'title'].includes(query.sort) ? query.sort : 'newest',
  };
};

const addInFilter = (clauses, params, column, values) => {
  if (values.length === 0) return;
  clauses.push(`${column} IN (${values.map(() => '?').join(',')})`);
  params.push(...values);
};

const buildWhere = (teamId, filters, userId, orgId) => {
  const clauses = ['t.is_deleted = FALSE'];
  const params = [];
  if (teamId) { clauses.push('t.team_id = ?'); params.push(Number(teamId)); }
  else {
    clauses.push('t.assigned_to = ?', 't.org_id = ?', 'EXISTS (SELECT 1 FROM team_members tm JOIN teams te ON te.id = tm.team_id WHERE tm.team_id = t.team_id AND tm.user_id = ? AND te.is_deleted = FALSE)');
    params.push(Number(userId), orgId || 0, Number(userId));
  }
  addInFilter(clauses, params, 't.status', filters.statuses);
  addInFilter(clauses, params, 't.priority', filters.priorities);
  addInFilter(clauses, params, 't.issue_type', filters.issueTypes);
  addInFilter(clauses, params, 't.assigned_to', filters.assignees);
  addInFilter(clauses, params, 't.client_name', filters.clients);

  if (filters.search) {
    clauses.push('(t.title LIKE ? OR t.description LIKE ?)');
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.createdFrom) {
    clauses.push('t.created_at >= CAST(? AS DATE)');
    params.push(filters.createdFrom);
  }
  if (filters.createdTo) {
    clauses.push('t.created_at < DATEADD(DAY, 1, CAST(? AS DATE))');
    params.push(filters.createdTo);
  }
  if (filters.focus === 'MY_DAY') {
    const normalizedUserId = Number(userId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) clauses.push('1 = 0');
    else {
      clauses.push('t.assigned_to = ?');
      params.push(normalizedUserId);
    }
    clauses.push("t.status != 'DONE'");
    clauses.push("(t.due_date <= CAST(GETDATE() AS DATE) OR t.due_date IS NULL OR t.status = 'IN_PROGRESS')");
    clauses.push('(t.snoozed_until IS NULL OR t.snoozed_until <= GETDATE())');
  }
  if (filters.focus === 'DUE_TODAY') {
    clauses.push('t.due_date = CAST(GETDATE() AS DATE)');
  }
  if (filters.focus === 'OVERDUE') {
    clauses.push("t.status != 'DONE'");
    clauses.push('t.due_date < CAST(GETDATE() AS DATE)');
  }
  return { where: clauses.join(' AND '), params };
};

const normalizeSummary = (row = {}) => ({
  total: Number(row.total || 0),
  done: Number(row.done || 0),
  in_progress: Number(row.in_progress || 0),
  pending: Number(row.pending || 0),
  todo: Number(row.todo || 0),
  overdue: Number(row.overdue || 0),
  high: Number(row.high || 0),
  medium: Number(row.medium || 0),
  low: Number(row.low || 0),
});

const listTeamTasks = async (teamId, rawQuery, userId, orgId) => {
  const filters = parseTaskQuery(rawQuery);
  const { where, params } = buildWhere(teamId, filters, userId, orgId);
  const unfiltered = buildWhere(teamId, parseTaskQuery({}), userId, orgId);
  const orders = { newest: 't.created_at DESC, t.id DESC', oldest: 't.created_at ASC, t.id ASC', due: 'CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.id DESC', priority: "CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, t.id DESC", title: 't.title ASC, t.id ASC' };
  const summarySql = `SELECT COUNT(*) AS total,
    SUM(CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END) AS done,
    SUM(CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
    SUM(CASE WHEN t.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN t.status = 'TODO' THEN 1 ELSE 0 END) AS todo,
    SUM(CASE WHEN t.due_date < CAST(GETDATE() AS DATE) AND t.status != 'DONE' THEN 1 ELSE 0 END) AS overdue,
    SUM(CASE WHEN t.priority = 'HIGH' THEN 1 ELSE 0 END) AS high,
    SUM(CASE WHEN t.priority = 'MEDIUM' THEN 1 ELSE 0 END) AS medium,
    SUM(CASE WHEN t.priority = 'LOW' THEN 1 ELSE 0 END) AS low
    FROM tasks t WHERE ${where}`;
  const taskSql = `SELECT t.id, t.title, LEFT(t.description, 220) AS description, t.priority, t.status, t.assigned_to,
      t.assigned_by, t.team_id, t.start_date, t.assigned_date, t.due_date, t.client_name,
      t.issue_type, t.manager_assigned, t.priority_locked, t.picked_by, t.delete_requested_by, t.snoozed_until, t.created_at, t.version,
      t.blocked_reason, t.review_status, te.name AS team_name,
      u1.name AS assigned_to_name, u2.name AS assigned_by_name, u2.name AS created_by_name,
      u5.name AS delete_requested_by_name, ag.name AS agent_name,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.is_deleted = FALSE) AS total_comments,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.user_id != ?
        AND tc.is_deleted = FALSE AND tc.id > COALESCE(tr.last_comment_id, 0)) AS unread_comments
    FROM tasks t
    LEFT JOIN teams te ON te.id = t.team_id
    LEFT JOIN task_reads tr ON tr.task_id = t.id AND tr.user_id = ?
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.assigned_by = u2.id
    LEFT JOIN users u5 ON t.delete_requested_by = u5.id
    LEFT JOIN org_agents ag ON ag.id = t.agent_firm_id
    WHERE ${where}
    ORDER BY ${orders[filters.sort]} LIMIT ? OFFSET ?`;

  const isBoard = rawQuery.board === 'true';
  const boardSql = `WITH ranked AS (${taskSql.slice(0, taskSql.lastIndexOf('ORDER BY'))
    .replace('SELECT t.id,', `SELECT ROW_NUMBER() OVER (PARTITION BY t.status ORDER BY ${orders[filters.sort]}) AS column_row, t.id,`)})
    SELECT * FROM ranked WHERE column_row <= ? ORDER BY status, column_row`;
  const summaryPromise = db.execute(summarySql, params);
  const [[summaryRow], [rows], [teamRows]] = await Promise.all([
    summaryPromise,
    db.execute(isBoard ? boardSql : taskSql, [userId, userId, ...params, filters.limit, ...(isBoard ? [] : [filters.offset])]),
    where === unfiltered.where ? summaryPromise : db.execute(summarySql.replace(`WHERE ${where}`, `WHERE ${unfiltered.where}`), unfiltered.params),
  ]);
  const summary = normalizeSummary(summaryRow?.[0]);
  return {
    data: rows,
    summary,
    team_summary: normalizeSummary(teamRows?.[0]),
    pagination: {
      total: summary.total,
      page: filters.page,
      limit: filters.limit,
      total_pages: Math.max(1, Math.ceil(summary.total / filters.limit)),
    },
  };
};

const getTaskDetail = async (taskId, userId = 0) => {
  const normalizedId = Number(taskId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
  const [[task]] = await db.execute(
    `SELECT t.*,
      u1.name AS assigned_to_name, u1.avatar AS assigned_to_avatar,
      u2.name AS assigned_by_name, u2.name AS created_by_name,
      u3.name AS reported_by_name, u4.name AS picked_by_name,
      u5.name AS delete_requested_by_name, ag.name AS agent_name,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.is_deleted = FALSE) AS total_comments,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.user_id != ?
        AND tc.is_deleted = FALSE AND tc.id > COALESCE(tr.last_comment_id, 0)) AS unread_comments
     FROM tasks t
     LEFT JOIN task_reads tr ON tr.task_id = t.id AND tr.user_id = ?
     LEFT JOIN users u1 ON t.assigned_to = u1.id
     LEFT JOIN users u2 ON t.assigned_by = u2.id
     LEFT JOIN users u3 ON t.reported_by = u3.id
     LEFT JOIN users u4 ON t.picked_by = u4.id
     LEFT JOIN users u5 ON t.delete_requested_by = u5.id
     LEFT JOIN org_agents ag ON ag.id = t.agent_firm_id
     WHERE t.id = ? AND t.is_deleted = FALSE`,
    [userId, userId, normalizedId]
  );
  return task || null;
};

const EXPORT_LIMIT = 5000;
const EXPORT_ORDERS = {
  newest: 't.created_at DESC, t.id DESC', oldest: 't.created_at ASC, t.id ASC',
  due: 'CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.id DESC',
  priority: "CASE t.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, t.id DESC", title: 't.title ASC, t.id ASC',
};

// Full rows for reports and Excel export: same filters as the task list, no paging, capped.
// hours_logged = the task's own time log plus submitted timesheet entries linked to it.
const exportTeamTasks = async (teamId, rawQuery) => {
  const filters = parseTaskQuery({ ...rawQuery, page: 1, limit: 1 });
  const { where, params } = buildWhere(teamId, filters);
  const [rows] = await db.execute(`SELECT t.id, t.title, LEFT(t.description, 1000) AS description, t.status, t.priority, t.issue_type,
      t.client_name, ag.name AS agent_name, te.name AS team_name, u1.name AS assigned_to_name, u2.name AS created_by_name,
      CONVERT(VARCHAR(19), t.created_at, 126) AS created_at, CONVERT(VARCHAR(10), t.start_date, 23) AS start_date,
      CONVERT(VARCHAR(10), t.assigned_date, 23) AS assigned_date, CONVERT(VARCHAR(10), t.due_date, 23) AS due_date,
      CONVERT(VARCHAR(19), t.completed_at, 126) AS completed_at, t.review_status, t.blocked_reason,
      t.task_type, t.product, t.category,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.is_deleted = FALSE) AS total_comments,
      (SELECT COALESCE(SUM(l.hours), 0) FROM task_time_logs l WHERE l.task_id = t.id AND l.is_deleted = 0)
      + (SELECT COALESCE(SUM(tl.hours), 0) FROM timesheet_time_logs tl JOIN timesheet_entries e ON e.id = tl.entry_id AND e.org_id = tl.org_id
          WHERE e.task_id = t.id AND e.is_deleted = 0 AND e.status = 'SUBMITTED' AND tl.is_deleted = 0) AS hours_logged
    FROM tasks t
    LEFT JOIN teams te ON te.id = t.team_id
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.assigned_by = u2.id
    LEFT JOIN org_agents ag ON ag.id = t.agent_firm_id
    WHERE ${where}
    ORDER BY ${EXPORT_ORDERS[filters.sort]}
    OFFSET 0 ROWS FETCH NEXT ${EXPORT_LIMIT + 1} ROWS ONLY`, params);
  return { rows: rows.slice(0, EXPORT_LIMIT), truncated: rows.length > EXPORT_LIMIT, limit: EXPORT_LIMIT };
};

module.exports = { parseTaskQuery, listTeamTasks, getTaskDetail, exportTeamTasks };
