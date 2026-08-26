const db = require('../config/database');

const STATUSES = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const ISSUE_TYPES = ['task', 'bug', 'story', 'feature', 'enhancement'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!DATE_PATTERN.test(normalized)) throw validationError(`${fieldName} must be a valid date`);
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
  };
};

const addInFilter = (clauses, params, column, values) => {
  if (values.length === 0) return;
  clauses.push(`${column} IN (${values.map(() => '?').join(',')})`);
  params.push(...values);
};

const buildWhere = (teamId, filters) => {
  const clauses = ['t.team_id = ?', 't.is_deleted = FALSE'];
  const params = [Number(teamId)];
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

const listTeamTasks = async (teamId, rawQuery) => {
  const filters = parseTaskQuery(rawQuery);
  const { where, params } = buildWhere(teamId, filters);
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
  const taskSql = `SELECT t.id, t.title, t.description, t.priority, t.status, t.assigned_to,
      t.assigned_by, t.team_id, t.start_date, t.assigned_date, t.due_date, t.client_name,
      t.issue_type, t.manager_assigned, t.picked_by, t.delete_requested_by, t.created_at, t.version,
      u1.name AS assigned_to_name, u2.name AS assigned_by_name, u2.name AS created_by_name,
      u5.name AS delete_requested_by_name,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.is_deleted = FALSE) AS total_comments,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.user_id != t.assigned_to
        AND tc.is_deleted = FALSE AND (t.assignee_last_viewed_at IS NULL OR tc.created_at > t.assignee_last_viewed_at)) AS unread_comments
    FROM tasks t
    LEFT JOIN users u1 ON t.assigned_to = u1.id
    LEFT JOIN users u2 ON t.assigned_by = u2.id
    LEFT JOIN users u5 ON t.delete_requested_by = u5.id
    WHERE ${where}
    ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;

  const [[summaryRow], [rows]] = await Promise.all([
    db.execute(summarySql, params),
    db.execute(taskSql, [...params, filters.limit, filters.offset]),
  ]);
  const summary = normalizeSummary(summaryRow?.[0]);
  return {
    data: rows,
    summary,
    pagination: {
      total: summary.total,
      page: filters.page,
      limit: filters.limit,
      total_pages: Math.max(1, Math.ceil(summary.total / filters.limit)),
    },
  };
};

const getTaskDetail = async (taskId) => {
  const normalizedId = Number(taskId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
  const [[task]] = await db.execute(
    `SELECT t.*,
      u1.name AS assigned_to_name, u1.avatar AS assigned_to_avatar,
      u2.name AS assigned_by_name, u2.name AS created_by_name,
      u3.name AS reported_by_name, u4.name AS picked_by_name,
      u5.name AS delete_requested_by_name,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.is_deleted = FALSE) AS total_comments,
      (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id AND tc.user_id != t.assigned_to
        AND tc.is_deleted = FALSE AND (t.assignee_last_viewed_at IS NULL OR tc.created_at > t.assignee_last_viewed_at)) AS unread_comments
     FROM tasks t
     LEFT JOIN users u1 ON t.assigned_to = u1.id
     LEFT JOIN users u2 ON t.assigned_by = u2.id
     LEFT JOIN users u3 ON t.reported_by = u3.id
     LEFT JOIN users u4 ON t.picked_by = u4.id
     LEFT JOIN users u5 ON t.delete_requested_by = u5.id
     WHERE t.id = ? AND t.is_deleted = FALSE`,
    [normalizedId]
  );
  return task || null;
};

module.exports = { parseTaskQuery, listTeamTasks, getTaskDetail };
