const db = require('../config/database');
const { DEFAULT_SETTINGS, fail, todayLocal, isValidDate } = require('./timesheetRules');

// Sign-out rule, set per company in Timesheet → Setup (Accountrust asked for it): on a working day an
// employee needs at least min_daily_hours of SUBMITTED time for that day before Log out lets them go.
// Leave entries count, so half a day of work plus half a day of Leave is enough. Drafts do not count
// until they are submitted. Only the Log out button can be stopped; closing the browser cannot.
const DEFAULT_DAYS = [1, 2, 3, 4, 5]; // Monday to Friday (1 = Monday ... 7 = Sunday)
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const parseDays = (value) => {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const days = [...new Set(list.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
  return days;
};
const weekdayOf = (date) => { const d = new Date(`${date}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

async function getRule(orgId) {
  const [[row]] = await db.execute('SELECT min_daily_hours, working_days FROM timesheet_settings WHERE org_id = ?', [orgId]);
  const [holidays] = await db.execute(
    `SELECT id, CONVERT(VARCHAR(10), holiday_date, 23) AS date, name FROM timesheet_holidays
     WHERE org_id = ? AND holiday_date >= DATEADD(DAY, -31, CAST(SYSDATETIME() AS DATE)) ORDER BY holiday_date`, [orgId]);
  const min = row?.min_daily_hours == null ? null : Number(row.min_daily_hours);
  const days = parseDays(row?.working_days);
  return { enabled: Boolean(min), min_daily_hours: min, working_days: days.length ? days : DEFAULT_DAYS, holidays };
}

// May this person log out now? Pure, so the rule is tested without a database.
function decide({ rule, today, isHoliday = false, role, submitted = 0, drafts = 0 }) {
  const result = { allowed: true, date: today, required: rule.min_daily_hours, hours: round2(submitted), draft_hours: round2(drafts) };
  if (!rule.enabled || role !== 'person') return { ...result, reason: 'not_applicable' };
  if (!rule.working_days.includes(weekdayOf(today))) return { ...result, reason: 'day_off' };
  if (isHoliday) return { ...result, reason: 'holiday' };
  if (result.hours >= rule.min_daily_hours) return { ...result, reason: 'enough' };
  return { ...result, allowed: false, reason: 'short', missing: round2(rule.min_daily_hours - result.hours) };
}

async function signOutCheck(req) {
  const rule = await getRule(req.orgId);
  const today = todayLocal();
  if (!rule.enabled || req.tsRole !== 'person') return decide({ rule, today, role: req.tsRole });
  const [[holiday]] = await db.execute('SELECT TOP 1 id FROM timesheet_holidays WHERE org_id = ? AND holiday_date = ?', [req.orgId, today]);
  const [[sum]] = await db.execute(
    `SELECT COALESCE(SUM(CASE WHEN e.status <> 'DRAFT' THEN l.hours END), 0) AS submitted,
       COALESCE(SUM(CASE WHEN e.status = 'DRAFT' THEN l.hours END), 0) AS drafts
     FROM timesheet_time_logs l JOIN timesheet_entries e ON e.id = l.entry_id AND e.is_deleted = 0
     WHERE l.org_id = ? AND l.user_id = ? AND l.work_date = ? AND l.is_deleted = 0`,
    [req.orgId, req.userId, today]);
  return decide({ rule, today, isHoliday: Boolean(holiday), role: req.tsRole, submitted: sum?.submitted, drafts: sum?.drafts });
}

async function saveRule(req, body) {
  const on = body?.enabled === true;
  const min = Number(body?.min_daily_hours);
  if (on && (!Number.isFinite(min) || min < 0.25 || min > 24 || Math.round(min * 100) !== min * 100)) {
    throw fail(422, 'Enter the hours needed, from 0.25 to 24', { min_daily_hours: 'Enter hours from 0.25 to 24, like 8 or 7.5.' });
  }
  const days = parseDays(body?.working_days);
  if (on && !days.length) throw fail(422, 'Pick at least one working day', { working_days: 'Pick at least one working day.' });
  const keepDays = (days.length ? days : DEFAULT_DAYS).join(',');
  await db.execute(
    `MERGE timesheet_settings WITH (HOLDLOCK) AS target
     USING (SELECT ? AS org_id) AS source ON target.org_id = source.org_id
     WHEN MATCHED THEN UPDATE SET min_daily_hours = ?, working_days = ?, updated_by = ?, updated_at = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (org_id, lock_days, unlock_days, min_daily_hours, working_days, updated_by)
       VALUES (source.org_id, ?, ?, ?, ?, ?);`,
    [req.orgId, on ? min : null, keepDays, req.userId, DEFAULT_SETTINGS.lock_days, DEFAULT_SETTINGS.unlock_days, on ? min : null, keepDays, req.userId]);
  return getRule(req.orgId);
}

async function addHoliday(req, body) {
  const date = String(body?.date || '');
  if (!isValidDate(date)) throw fail(422, 'Pick a date', { date: 'Pick a date.' });
  const name = String(body?.name || '').trim().slice(0, 120) || null;
  const [[taken]] = await db.execute('SELECT TOP 1 id FROM timesheet_holidays WHERE org_id = ? AND holiday_date = ?', [req.orgId, date]);
  if (taken) throw fail(409, 'That day is already a holiday', { date: 'That day is already a holiday.' });
  await db.execute('INSERT INTO timesheet_holidays (org_id, holiday_date, name, created_by) VALUES (?, ?, ?, ?)', [req.orgId, date, name, req.userId]);
  return getRule(req.orgId);
}

async function removeHoliday(req, id) {
  await db.execute('DELETE FROM timesheet_holidays WHERE id = ? AND org_id = ?', [Number(id), req.orgId]);
  return getRule(req.orgId);
}

module.exports = { DEFAULT_DAYS, weekdayOf, decide, getRule, signOutCheck, saveRule, addHoliday, removeHoliday };
