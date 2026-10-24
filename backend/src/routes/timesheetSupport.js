const db = require('../config/database');
const { isModuleEnabled } = require('../services/orgModules');
const { DEFAULT_SETTINGS, DEFAULT_OPTIONS, OPTION_GROUPS, fail, timesheetRole } = require('../services/timesheetRules');

const { memberClause, currentOrgRole, orgMembers } = require('../utils/orgMember');

const isDuplicateKey = (error) => [2601, 2627].includes(error?.number) || [2601, 2627].includes(error?.originalError?.info?.number);

const route = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) {
    if (!error.status) console.error('[timesheet]', error.message);
    res.status(error.status || 500).json({
      error: error.status ? error.message : 'Unable to complete request. Please retry.',
      ...(error.fields ? { fields: error.fields } : {}),
    });
  }
};

function positive(value, label = 'ID') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw fail(422, `Invalid ${label}`);
  return number;
}

// Live database check on every request: a stale JWT never keeps access after a user is
// removed, demoted or the organization loses the module.
const resolveRole = async (req) => timesheetRole(await currentOrgRole(req));

const requireTimesheet = route(async (req, res, next) => {
  const role = await resolveRole(req);
  if (!role) throw fail(403, 'Your role cannot use timesheets');
  if (!(await isModuleEnabled(req.orgId, 'timesheet'))) throw fail(403, 'Timesheet module is not enabled for this organization');
  req.tsRole = role;
  next();
});

const requirePermission = (check, message) => (req, res, next) => {
  if (!check(req.tsRole)) return res.status(403).json({ error: message });
  next();
};

async function getSettings(orgId) {
  const [[row]] = await db.execute('SELECT lock_days, unlock_days FROM timesheet_settings WHERE org_id = ?', [orgId]);
  return row ? { lock_days: Number(row.lock_days), unlock_days: Number(row.unlock_days) } : { ...DEFAULT_SETTINGS };
}

async function ensureDefaultOptions(orgId, userId) {
  const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM timesheet_options WHERE org_id = ?', [orgId]);
  if (Number(total) > 0) return;
  for (const group of OPTION_GROUPS) {
    for (const [index, label] of DEFAULT_OPTIONS[group].entries()) {
      await db.execute(
        'INSERT IGNORE INTO timesheet_options (org_id, option_group, label, sort_order, created_by) VALUES (?, ?, ?, ?, ?)',
        [orgId, group, label, index + 1, userId]
      );
    }
  }
}

async function getOptions(orgId, includeInactive = false) {
  const [rows] = await db.execute(
    `SELECT id, option_group, label, sort_order, is_active FROM timesheet_options
     WHERE org_id = ? ${includeInactive ? '' : 'AND is_active = 1'} ORDER BY option_group, sort_order, label`,
    [orgId]
  );
  const grouped = Object.fromEntries(OPTION_GROUPS.map((group) => [group, []]));
  rows.forEach((row) => grouped[row.option_group]?.push({ id: row.id, label: row.label, is_active: row.is_active === true || row.is_active === 1 }));
  return grouped;
}

async function isOrgMember(orgId, userId) {
  const [[row]] = await db.execute(
    `SELECT u.id FROM users u WHERE u.id = ? AND u.is_deleted = FALSE AND u.role IN ('admin', 'manager', 'person') AND ${memberClause}`,
    [userId, orgId, orgId]
  );
  return Boolean(row);
}

const { defaultLayout, normalizeTimesheetLayout } = require('../services/timesheetFormLayout');

const ENTRY_COLUMNS = `e.id, e.org_id, e.client_id, c.name AS client_name, e.job_type, e.work_type,
  CONVERT(VARCHAR(10), e.date_worked, 23) AS date_worked, e.agent_id, a.name AS agent_name,
  e.period_type, CONVERT(VARCHAR(10), e.period_ended, 23) AS period_ended, e.registration_status,
  e.description, e.count_type, e.count_number, e.status,
  CONVERT(VARCHAR(10), e.submitted_on, 23) AS submitted_on, CONVERT(VARCHAR(10), e.unlocked_until, 23) AS unlocked_until,
  e.created_by, cb.name AS created_by_name, e.version, e.task_id, tk.title AS task_title, tk.status AS task_status, e.custom_fields,
  e.agent_firm_id, af.name AS agent_firm_name`;
const ENTRY_FROM = `FROM timesheet_entries e
  JOIN timesheet_clients c ON c.id = e.client_id AND c.org_id = e.org_id
  LEFT JOIN users a ON a.id = e.agent_id
  LEFT JOIN users cb ON cb.id = e.created_by
  LEFT JOIN tasks tk ON tk.id = e.task_id AND tk.org_id = e.org_id
  LEFT JOIN org_agents af ON af.id = e.agent_firm_id`;

async function loadEntry(orgId, entryId) {
  const [[entry]] = await db.execute(
    `SELECT ${ENTRY_COLUMNS} ${ENTRY_FROM} WHERE e.id = ? AND e.org_id = ? AND e.is_deleted = 0`,
    [entryId, orgId]
  );
  if (!entry) throw fail(404, 'Timesheet entry not found');
  return entry;
}

async function audit(req, entryId, action, detail) {
  try {
    await db.execute(
      'INSERT INTO timesheet_audit (org_id, entry_id, user_id, action, detail) VALUES (?, ?, ?, ?, ?)',
      [req.orgId, entryId || null, req.userId || null, action, detail ? String(detail).slice(0, 2000) : null]
    );
  } catch (error) { console.error('[timesheet] audit write failed', error.message); }
}

// Tasks a person may log time against: managers and admins see every task in the organization;
// employees see tasks assigned to them or in their teams.
function taskScope(req, alias = 't') {
  const where = [`${alias}.org_id = ?`, `${alias}.is_deleted = 0`];
  const params = [req.orgId];
  if (req.tsRole === 'person') {
    where.push(`(${alias}.assigned_to = ? OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = ${alias}.team_id AND tm.user_id = ?))`);
    params.push(req.userId, req.userId);
  }
  return { where, params };
}

async function canUseTask(req, taskId) {
  const { where, params } = taskScope(req);
  const [[task]] = await db.execute(`SELECT t.id FROM tasks t WHERE t.id = ? AND ${where.join(' AND ')}`, [taskId, ...params]);
  return Boolean(task);
}

// The saved customised form, or null when the organization still uses the original form.
async function getFormLayout(orgId) {
  let row;
  try { [[row]] = await db.execute('SELECT definition, version FROM timesheet_form_layouts WHERE org_id = ?', [orgId]); }
  catch (error) { return null; }
  if (!row) return null;
  try { return { ...normalizeTimesheetLayout(JSON.parse(row.definition)), version: Number(row.version) }; }
  catch (error) { console.error('[timesheet] stored form is invalid for org', orgId, error.message); return null; }
}

// What the form looks like right now: the saved one, or the original form with today's dropdown options.
async function effectiveLayout(orgId) {
  return (await getFormLayout(orgId)) || { ...defaultLayout(await getOptions(orgId)), version: 0, is_default: true };
}

const parseCustom = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

module.exports = {
  getFormLayout, effectiveLayout, parseCustom,
  taskScope, canUseTask,
  db, memberClause, isDuplicateKey, route, positive, resolveRole, requireTimesheet, requirePermission, getSettings,
  ensureDefaultOptions, getOptions, orgMembers, isOrgMember, ENTRY_COLUMNS, ENTRY_FROM, loadEntry, audit,
};
