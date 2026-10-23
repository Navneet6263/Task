const router = require('express').Router();
const {
  OPTION_GROUPS, fail, todayLocal, addDays, isValidDate, permissionsFor, lockState, canViewEntry, canEditEntry, canLogTime,
  canRequestUnlock, canDeleteEntry, validateEntry, parseHours, missingForSubmit, summarizeReport,
} = require('../services/timesheetRules');
const {
  db, isDuplicateKey, route, positive, requirePermission, getSettings, getOptions, isOrgMember, ENTRY_COLUMNS, ENTRY_FROM,
  loadEntry, audit, canUseTask, getFormLayout, parseCustom,
} = require('./timesheetSupport');
const { requiredKeys, checkChoices, cleanTimesheetCustom, visibleCoreKeys } = require('../services/timesheetFormLayout');

const PAGE_SIZE = 50;
const REPORT_ROW_LIMIT = 10000;
const GROUP_LABELS = { job_type: 'Job Type', work_type: 'Work Type', period_type: 'Period Type', registration_status: 'Registration Status', count_type: 'Count Type' };
const ENTRY_FIELDS = ['task_id', 'client_id', 'job_type', 'work_type', 'date_worked', 'agent_id', 'period_type', 'period_ended', 'registration_status', 'description', 'count_type', 'count_number'];

function decorate(entry, req, settings, today) {
  const lock = lockState(entry, settings.lock_days, today);
  return {
    ...entry,
    lock,
    can_edit: canEditEntry(req.tsRole, req.userId, entry, lock),
    can_log: canLogTime(req.tsRole, req.userId, entry, lock),
    can_request_unlock: canRequestUnlock(req.tsRole, req.userId, entry, lock),
    can_delete: canDeleteEntry(req.tsRole, req.userId, entry),
  };
}

async function viewableEntry(req, entryId) {
  const entry = await loadEntry(req.orgId, entryId);
  // Drafts belonging to someone else are reported as missing, not forbidden, so ids cannot be probed.
  if (!canViewEntry(req.tsRole, req.userId, entry)) throw fail(404, 'Timesheet entry not found');
  return entry;
}

// Client, agent and dropdown values must belong to this organization. A value that was
// already saved stays valid even if an admin later switched that option or client off.
async function checkReferences(req, entry, current, layout) {
  const errors = {};
  if (entry.client_id && entry.client_id !== current?.client_id) {
    // The client must be active in Settings → Clients (the one client list).
    const [[client]] = await db.execute(
      `SELECT tc.id FROM timesheet_clients tc JOIN org_clients oc ON oc.org_id = tc.org_id AND oc.name = tc.name
       WHERE tc.id = ? AND tc.org_id = ? AND oc.is_active = 1`, [entry.client_id, req.orgId]);
    if (!client) errors.client_id = 'Pick a client from the list.';
  }
  if (entry.task_id && entry.task_id !== current?.task_id && !(await canUseTask(req, entry.task_id))) {
    errors.task_id = 'Pick a task from the list.';
  }
  if (entry.agent_id && entry.agent_id !== current?.agent_id && !(await isOrgMember(req.orgId, entry.agent_id))) {
    errors.agent_id = 'Pick an agent from your organization.';
  }
  if (layout) {
    Object.assign(errors, checkChoices(layout, entry, current));
    if (Object.keys(errors).length) throw fail(422, Object.values(errors)[0], errors);
    return;
  }
  const options = await getOptions(req.orgId);
  OPTION_GROUPS.forEach((group) => {
    const value = entry[group];
    if (!value || value === current?.[group]) return;
    const match = options[group].find((option) => option.label.toLowerCase() === value.toLowerCase());
    if (match) entry[group] = match.label;
    else errors[group] = `Pick a ${GROUP_LABELS[group]} from the list.`;
  });
  if (Object.keys(errors).length) throw fail(422, Object.values(errors)[0], errors);
}

async function assertDailyCap(orgId, userId, workDate, hours) {
  const [[row]] = await db.execute(
    'SELECT COALESCE(SUM(hours), 0) AS total FROM timesheet_time_logs WHERE org_id = ? AND user_id = ? AND work_date = ? AND is_deleted = 0',
    [orgId, userId, workDate]
  );
  const already = Number(row.total);
  if (already + hours > 24) {
    const message = `This person already has ${already} hours logged on ${workDate}. One day cannot exceed 24 hours.`;
    throw fail(422, message, { hours: message });
  }
}

/* List */
router.get('/entries', route(async (req, res) => {
  const page = req.query.page === undefined ? 1 : positive(req.query.page, 'page');
  const settings = await getSettings(req.orgId);
  const today = todayLocal();
  const where = ['e.org_id = ?', 'e.is_deleted = 0'];
  const params = [req.orgId];
  if (req.tsRole === 'person') { where.push("(e.status = 'SUBMITTED' OR e.created_by = ?)"); params.push(req.userId); }
  if (req.query.client_id) { where.push('e.client_id = ?'); params.push(positive(req.query.client_id, 'client')); }
  if (req.query.agent_id) { where.push('e.agent_id = ?'); params.push(positive(req.query.agent_id, 'agent')); }
  if (req.query.task_id) { where.push('e.task_id = ?'); params.push(positive(req.query.task_id, 'task')); }
  if (req.query.from) { if (!isValidDate(req.query.from)) throw fail(422, 'Invalid from date'); where.push('e.date_worked >= ?'); params.push(req.query.from); }
  if (req.query.to) { if (!isValidDate(req.query.to)) throw fail(422, 'Invalid to date'); where.push('e.date_worked <= ?'); params.push(req.query.to); }
  const lockedSql = `(e.status = 'SUBMITTED' AND DATEADD(DAY, ?, e.submitted_on) < ? AND (e.unlocked_until IS NULL OR e.unlocked_until < ?))`;
  switch (req.query.status) {
    case undefined: case '': case 'ALL': break;
    case 'DRAFT': where.push("e.status = 'DRAFT'"); break;
    case 'LOCKED': where.push(lockedSql); params.push(settings.lock_days, today, today); break;
    case 'OPEN': where.push(`e.status = 'SUBMITTED' AND NOT ${lockedSql}`); params.push(settings.lock_days, today, today); break;
    default: throw fail(422, 'Invalid status filter');
  }
  if (req.query.mine === 'true') { where.push('(e.created_by = ? OR e.agent_id = ? OR EXISTS (SELECT 1 FROM timesheet_time_logs ml WHERE ml.entry_id = e.id AND ml.user_id = ? AND ml.is_deleted = 0))'); params.push(req.userId, req.userId, req.userId); }
  const whereSql = where.join(' AND ');
  const [rows] = await db.execute(
    `SELECT ${ENTRY_COLUMNS},
       (SELECT COALESCE(SUM(l.hours), 0) FROM timesheet_time_logs l WHERE l.entry_id = e.id AND l.is_deleted = 0) AS total_hours,
       (SELECT COUNT(DISTINCT l.user_id) FROM timesheet_time_logs l WHERE l.entry_id = e.id AND l.is_deleted = 0) AS people_count,
       CASE WHEN EXISTS (SELECT 1 FROM timesheet_unlock_requests r WHERE r.entry_id = e.id AND r.status = 'PENDING') THEN 1 ELSE 0 END AS has_pending_unlock
     ${ENTRY_FROM} WHERE ${whereSql}
     ORDER BY e.date_worked DESC, e.id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
    [...params, (page - 1) * PAGE_SIZE, PAGE_SIZE]
  );
  const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM timesheet_entries e WHERE ${whereSql}`, params);
  res.json({
    data: rows.map(({ description, ...row }) => decorate({ ...row, total_hours: Number(row.total_hours), has_pending_unlock: Boolean(row.has_pending_unlock) }, req, settings, today)),
    page, page_size: PAGE_SIZE, total: Number(count.total),
  });
}));

/* Detail */
router.get('/entries/:id', route(async (req, res) => {
  const entry = await viewableEntry(req, positive(req.params.id, 'entry'));
  const [settings, [logs], [requests]] = await Promise.all([
    getSettings(req.orgId),
    db.execute(
      `SELECT l.id, l.user_id, u.name AS user_name, CONVERT(VARCHAR(10), l.work_date, 23) AS work_date, l.hours, l.note, l.created_by
       FROM timesheet_time_logs l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.entry_id = ? AND l.org_id = ? AND l.is_deleted = 0 ORDER BY l.work_date ASC, l.id ASC`,
      [entry.id, req.orgId]
    ),
    db.execute(
      `SELECT TOP 5 r.id, r.status, r.reason, r.requested_by, u.name AS requested_by_name, d.name AS decided_by_name,
         CONVERT(VARCHAR(10), r.created_at, 23) AS created_on, CONVERT(VARCHAR(10), r.decided_at, 23) AS decided_on
       FROM timesheet_unlock_requests r LEFT JOIN users u ON u.id = r.requested_by LEFT JOIN users d ON d.id = r.decided_by
       WHERE r.entry_id = ? AND r.org_id = ? ORDER BY r.id DESC`,
      [entry.id, req.orgId]
    ),
  ]);
  const decorated = decorate(entry, req, settings, todayLocal());
  const canRemove = (log) => decorated.can_edit && (permissionsFor(req.tsRole).log_for_others || Number(log.user_id) === Number(req.userId));
  res.json({
    ...decorated,
    total_hours: logs.reduce((sum, log) => sum + Number(log.hours), 0),
    logs: logs.map((log) => ({ ...log, hours: Number(log.hours), can_remove: canRemove(log) })),
    unlock_requests: requests,
    lock_days: settings.lock_days,
  });
}));

/* Create */
router.post('/entries', route(async (req, res) => {
  const mode = req.body.mode === 'draft' ? 'draft' : 'submit';
  const today = todayLocal();
  const body = { ...req.body };
  if (req.tsRole === 'person') body.agent_id = req.userId;
  const layout = await getFormLayout(req.orgId);
  const entry = validateEntry(body, mode, today, layout ? requiredKeys(layout, mode) : undefined);
  const custom = layout ? cleanTimesheetCustom(layout, body.custom_fields, mode) : null;
  await checkReferences(req, entry, null, layout);
  const logUser = entry.agent_id || req.userId;
  const logDate = entry.date_worked || today;
  if (entry.hours !== null) await assertDailyCap(req.orgId, logUser, logDate, entry.hours);
  const [result] = await db.execute(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     DECLARE @entry_id INT;
     INSERT INTO timesheet_entries (org_id, client_id, job_type, work_type, date_worked, agent_id, period_type, period_ended,
       registration_status, description, count_type, count_number, status, submitted_on, created_by, task_id, custom_fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
     SET @entry_id = SCOPE_IDENTITY();
     IF ? IS NOT NULL
       INSERT INTO timesheet_time_logs (org_id, entry_id, user_id, work_date, hours, note, created_by)
       VALUES (?, @entry_id, ?, ?, ?, ?, ?);
     COMMIT;
     SELECT @entry_id AS insertId;`,
    [req.orgId, entry.client_id, entry.job_type, entry.work_type, entry.date_worked, entry.agent_id, entry.period_type, entry.period_ended,
      entry.registration_status, entry.description, entry.count_type, entry.count_number, mode === 'draft' ? 'DRAFT' : 'SUBMITTED',
      mode === 'draft' ? null : today, req.userId, entry.task_id, custom && Object.keys(custom).length ? JSON.stringify(custom) : null,
      entry.hours, req.orgId, logUser, logDate, entry.hours, 'Initial entry', req.userId]
  );
  await audit(req, result.insertId, mode === 'draft' ? 'CREATE_DRAFT' : 'CREATE', entry.hours ? `${entry.hours}h initial` : null);
  res.status(201).json({ id: result.insertId, status: mode === 'draft' ? 'DRAFT' : 'SUBMITTED' });
}));

/* Edit details (hours live in the time log) */
router.put('/entries/:id', route(async (req, res) => {
  const current = await viewableEntry(req, positive(req.params.id, 'entry'));
  const version = positive(req.body.version, 'version');
  const settings = await getSettings(req.orgId);
  const today = todayLocal();
  const lock = lockState(current, settings.lock_days, today);
  if (!canEditEntry(req.tsRole, req.userId, current, lock)) {
    throw fail(403, lock.locked ? 'This entry is locked. Ask your admin to unlock it.' : 'You can only edit your own entries.');
  }
  const body = { ...req.body };
  if (req.tsRole === 'person') body.agent_id = current.agent_id || req.userId;
  const layout = await getFormLayout(req.orgId);
  const editMode = current.status === 'DRAFT' ? 'draft' : 'edit';
  // Fields hidden from the form keep whatever an older entry already had.
  if (layout) {
    const shown = visibleCoreKeys(layout);
    ENTRY_FIELDS.filter((key) => !shown.has(key)).forEach((key) => { body[key] = current[key]; });
  }
  const entry = validateEntry(body, editMode, today, layout ? requiredKeys(layout, editMode) : undefined);
  let customJson = current.custom_fields || null;
  if (layout && body.custom_fields !== undefined) {
    const merged = { ...parseCustom(current.custom_fields), ...cleanTimesheetCustom(layout, body.custom_fields, editMode) };
    customJson = Object.keys(merged).length ? JSON.stringify(merged) : null;
  }
  await checkReferences(req, entry, current, layout);
  const changed = ENTRY_FIELDS.filter((key) => String(entry[key] ?? '') !== String(current[key] ?? ''));
  const [result] = await db.execute(
    `UPDATE timesheet_entries SET client_id = ?, job_type = ?, work_type = ?, date_worked = ?, agent_id = ?, period_type = ?,
       period_ended = ?, registration_status = ?, description = ?, count_type = ?, count_number = ?, task_id = ?, custom_fields = ?,
       updated_by = ?, version = version + 1, updated_at = SYSDATETIME()
     WHERE id = ? AND org_id = ? AND version = ? AND is_deleted = 0`,
    [entry.client_id, entry.job_type, entry.work_type, entry.date_worked, entry.agent_id, entry.period_type, entry.period_ended,
      entry.registration_status, entry.description, entry.count_type, entry.count_number, entry.task_id, customJson, req.userId, current.id, req.orgId, version]
  );
  if (!result.affectedRows) throw fail(409, 'Someone else changed this entry. Reload it and try again.');
  await audit(req, current.id, lock.locked ? 'EDIT_LOCKED_AS_ADMIN' : 'EDIT', changed.length ? `Changed: ${changed.join(', ')}` : 'No field changes');
  res.json({ id: current.id, version: version + 1 });
}));

router.post('/entries/:id/submit', route(async (req, res) => {
  const current = await viewableEntry(req, positive(req.params.id, 'entry'));
  if (current.status !== 'DRAFT') throw fail(409, 'This entry is already submitted');
  if (!canEditEntry(req.tsRole, req.userId, current, { locked: false })) throw fail(403, 'You can only submit your own drafts');
  const layout = await getFormLayout(req.orgId);
  const missing = missingForSubmit(current, layout ? requiredKeys(layout, 'submit') : undefined);
  if (layout) cleanTimesheetCustom(layout, parseCustom(current.custom_fields), 'submit');
  if (missing.length) throw fail(422, 'Fill all required fields before submitting', Object.fromEntries(missing.map((key) => [key, 'This field is required.'])));
  const [[logs]] = await db.execute('SELECT COUNT(*) AS total FROM timesheet_time_logs WHERE entry_id = ? AND org_id = ? AND is_deleted = 0', [current.id, req.orgId]);
  if (!Number(logs.total)) throw fail(422, 'Add at least one time log before submitting');
  const today = todayLocal();
  const [result] = await db.execute(
    `UPDATE timesheet_entries SET status = 'SUBMITTED', submitted_on = ?, updated_by = ?, version = version + 1, updated_at = SYSDATETIME()
     WHERE id = ? AND org_id = ? AND status = 'DRAFT' AND is_deleted = 0`,
    [today, req.userId, current.id, req.orgId]
  );
  if (!result.affectedRows) throw fail(409, 'This entry changed. Reload it and try again.');
  await audit(req, current.id, 'SUBMIT', null);
  res.json({ id: current.id, status: 'SUBMITTED', submitted_on: today });
}));

router.delete('/entries/:id', route(async (req, res) => {
  const current = await viewableEntry(req, positive(req.params.id, 'entry'));
  if (!canDeleteEntry(req.tsRole, req.userId, current)) throw fail(403, 'Only admins can delete submitted entries');
  await db.execute(
    `UPDATE timesheet_entries SET is_deleted = 1, updated_by = ?, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?;
     UPDATE timesheet_unlock_requests SET status = 'REJECTED', decided_by = ?, decided_at = SYSDATETIME()
       WHERE entry_id = ? AND org_id = ? AND status = 'PENDING';`,
    [req.userId, current.id, req.orgId, req.userId, current.id, req.orgId]
  );
  await audit(req, current.id, 'DELETE', `${current.client_name} ${current.job_type || ''}`.trim());
  res.json({ id: current.id });
}));

/* Time logs */
router.post('/entries/:id/logs', route(async (req, res) => {
  const entry = await viewableEntry(req, positive(req.params.id, 'entry'));
  const settings = await getSettings(req.orgId);
  const today = todayLocal();
  const lock = lockState(entry, settings.lock_days, today);
  if (!canLogTime(req.tsRole, req.userId, entry, lock)) throw fail(403, 'This entry is locked. Ask your admin to unlock it.');
  const errors = {};
  const hours = parseHours(req.body.hours, errors);
  const workDate = req.body.work_date;
  if (!isValidDate(workDate)) errors.work_date = 'Pick a valid date.';
  else if (workDate > today) errors.work_date = 'Date cannot be in the future.';
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (note.length > 500) errors.note = 'Note must be at most 500 characters.';
  let userId = req.userId;
  if (req.body.user_id !== undefined && req.body.user_id !== null && req.body.user_id !== '') {
    userId = positive(req.body.user_id, 'person');
    if (userId !== Number(req.userId) && !permissionsFor(req.tsRole).log_for_others) throw fail(403, 'You can only log time under your own name');
  }
  if (Object.keys(errors).length) throw fail(422, Object.values(errors)[0], errors);
  if (!(await isOrgMember(req.orgId, userId))) throw fail(422, 'Pick a person from your organization', { user_id: 'Pick a person from your organization.' });
  await assertDailyCap(req.orgId, userId, workDate, hours);
  const [result] = await db.execute(
    'INSERT INTO timesheet_time_logs (org_id, entry_id, user_id, work_date, hours, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.orgId, entry.id, userId, workDate, hours, note || null, req.userId]
  );
  await audit(req, entry.id, lock.locked ? 'ADD_TIME_LOCKED_AS_ADMIN' : 'ADD_TIME', `${hours}h for user ${userId} on ${workDate}`);
  res.status(201).json({ id: result.insertId });
}));

router.delete('/entries/:id/logs/:logId', route(async (req, res) => {
  const entry = await viewableEntry(req, positive(req.params.id, 'entry'));
  const logId = positive(req.params.logId, 'time log');
  const settings = await getSettings(req.orgId);
  const lock = lockState(entry, settings.lock_days, todayLocal());
  if (lock.locked && req.tsRole !== 'admin') throw fail(403, 'This entry is locked. Ask your admin to unlock it.');
  const [[log]] = await db.execute('SELECT id, user_id, hours FROM timesheet_time_logs WHERE id = ? AND entry_id = ? AND org_id = ? AND is_deleted = 0', [logId, entry.id, req.orgId]);
  if (!log) throw fail(404, 'Time log not found');
  if (Number(log.user_id) !== Number(req.userId) && !permissionsFor(req.tsRole).log_for_others) throw fail(403, 'You can only remove your own time');
  await db.execute('UPDATE timesheet_time_logs SET is_deleted = 1, deleted_by = ? WHERE id = ? AND org_id = ?', [req.userId, logId, req.orgId]);
  await audit(req, entry.id, 'REMOVE_TIME', `${Number(log.hours)}h for user ${log.user_id}`);
  res.json({ id: logId });
}));

/* Unlock requests */
router.post('/entries/:id/unlock-requests', route(async (req, res) => {
  const entry = await viewableEntry(req, positive(req.params.id, 'entry'));
  const settings = await getSettings(req.orgId);
  const lock = lockState(entry, settings.lock_days, todayLocal());
  if (!canRequestUnlock(req.tsRole, req.userId, entry, lock)) {
    throw fail(lock.locked ? 403 : 409, lock.locked ? 'You cannot request an unlock for this entry' : 'This entry is not locked');
  }
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 1000) throw fail(422, 'Write a reason (up to 1000 characters)', { reason: 'Write a short reason so the admin knows what will change.' });
  try {
    const [result] = await db.execute(
      'INSERT INTO timesheet_unlock_requests (org_id, entry_id, requested_by, reason) VALUES (?, ?, ?, ?)',
      [req.orgId, entry.id, req.userId, reason]
    );
    await audit(req, entry.id, 'REQUEST_UNLOCK', reason);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (isDuplicateKey(error)) throw fail(409, 'An unlock request for this entry is already waiting for the admin');
    throw error;
  }
}));

const canApprove = (role) => permissionsFor(role).approve_unlocks;

router.get('/unlock-requests', requirePermission(canApprove, 'Only admins can review unlock requests'), route(async (req, res) => {
  const status = String(req.query.status || 'PENDING');
  if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(status)) throw fail(422, 'Invalid status');
  const [rows] = await db.execute(
    `SELECT TOP 100 r.id, r.entry_id, r.status, r.reason, u.name AS requested_by_name, d.name AS decided_by_name,
       CONVERT(VARCHAR(10), r.created_at, 23) AS created_on, CONVERT(VARCHAR(10), r.decided_at, 23) AS decided_on,
       c.name AS client_name, e.job_type, CONVERT(VARCHAR(10), e.date_worked, 23) AS date_worked
     FROM timesheet_unlock_requests r
     JOIN timesheet_entries e ON e.id = r.entry_id AND e.org_id = r.org_id
     JOIN timesheet_clients c ON c.id = e.client_id AND c.org_id = e.org_id
     LEFT JOIN users u ON u.id = r.requested_by LEFT JOIN users d ON d.id = r.decided_by
     WHERE r.org_id = ? AND (? = 'ALL' OR r.status = ?) ORDER BY r.id DESC`,
    [req.orgId, status, status]
  );
  res.json(rows);
}));

router.patch('/unlock-requests/:id', requirePermission(canApprove, 'Only admins can review unlock requests'), route(async (req, res) => {
  const id = positive(req.params.id, 'request');
  const decision = String(req.body.decision || '');
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw fail(422, 'Decision must be APPROVED or REJECTED');
  const settings = await getSettings(req.orgId);
  const unlockedUntil = addDays(todayLocal(), settings.unlock_days);
  const [result] = await db.execute(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     DECLARE @entry_id INT;
     UPDATE timesheet_unlock_requests SET status = ?, decided_by = ?, decided_at = SYSDATETIME(), @entry_id = entry_id
       WHERE id = ? AND org_id = ? AND status = 'PENDING';
     IF @entry_id IS NOT NULL AND ? = 'APPROVED'
       UPDATE timesheet_entries SET unlocked_until = ?, version = version + 1, updated_at = SYSDATETIME()
         WHERE id = @entry_id AND org_id = ?;
     COMMIT;
     SELECT @entry_id AS entry_id;`,
    [decision, req.userId, id, req.orgId, decision, unlockedUntil, req.orgId]
  );
  const entryId = result.rows?.[0]?.entry_id;
  if (!entryId) throw fail(409, 'This request was already decided or does not exist');
  await audit(req, entryId, decision === 'APPROVED' ? 'APPROVE_UNLOCK' : 'REJECT_UNLOCK', decision === 'APPROVED' ? `Unlocked until ${unlockedUntil}` : null);
  res.json({ id, status: decision, unlocked_until: decision === 'APPROVED' ? unlockedUntil : null });
}));

/* Client report: time logs of submitted entries, grouped by client and person */
router.get('/reports', requirePermission((role) => permissionsFor(role).view_reports, 'Only managers and admins can see reports'), route(async (req, res) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) throw fail(422, 'Pick a valid from and to date');
  if (from > to) throw fail(422, 'From date must be before the to date');
  if (to > addDays(from, 366)) throw fail(422, 'Pick a range of one year or less');
  const where = ['l.org_id = ?', 'l.is_deleted = 0', 'e.is_deleted = 0', "e.status = 'SUBMITTED'", 'l.work_date >= ?', 'l.work_date <= ?'];
  const params = [req.orgId, from, to];
  if (req.query.client_id) { where.push('e.client_id = ?'); params.push(positive(req.query.client_id, 'client')); }
  if (req.query.user_id) { where.push('l.user_id = ?'); params.push(positive(req.query.user_id, 'person')); }
  const [rows] = await db.execute(
    `SELECT l.id, CONVERT(VARCHAR(10), l.work_date, 23) AS work_date, l.hours, l.note, l.user_id, u.name AS user_name,
       e.id AS entry_id, e.client_id, c.name AS client_name, e.job_type, e.work_type, e.period_type,
       CONVERT(VARCHAR(10), e.period_ended, 23) AS period_ended, CONVERT(VARCHAR(10), e.date_worked, 23) AS date_worked,
       e.registration_status, e.count_type, e.count_number, e.task_id, tk.title AS task_title, e.custom_fields
     FROM timesheet_time_logs l
     JOIN timesheet_entries e ON e.id = l.entry_id AND e.org_id = l.org_id
     JOIN timesheet_clients c ON c.id = e.client_id AND c.org_id = e.org_id
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN tasks tk ON tk.id = e.task_id AND tk.org_id = e.org_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.name ASC, e.date_worked ASC, e.id ASC, l.work_date ASC, l.id ASC
     OFFSET 0 ROWS FETCH NEXT ${REPORT_ROW_LIMIT + 1} ROWS ONLY`,
    params
  );
  const truncated = rows.length > REPORT_ROW_LIMIT;
  const data = rows.slice(0, REPORT_ROW_LIMIT).map(({ custom_fields: custom, ...row }) => ({ ...parseCustom(custom), ...row, hours: Number(row.hours) }));
  res.json({ from, to, truncated, rows: data, summary: summarizeReport(data) });
}));

module.exports = router;
