// Pure timesheet rules: no database access, so they are unit-tested directly.
const OPTION_GROUPS = ['job_type', 'work_type', 'period_type', 'registration_status', 'count_type'];
const DEFAULT_OPTIONS = {
  job_type: ['Bookkeeping', 'Payroll', 'Tax Return', 'BAS / GST', 'Audit'],
  work_type: ['Preparation', 'Review', 'Lodgement', 'Client query'],
  period_type: ['Monthly', 'Quarterly', 'Half-yearly', 'Annually'],
  registration_status: ['Registered', 'Not registered', 'Pending registration'],
  count_type: ['Transactions', 'Invoices', 'Payslips', 'Pages'],
};
const DEFAULT_SETTINGS = { lock_days: 7, unlock_days: 2 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROLE_MAP = { company_admin: 'admin', admin: 'admin', manager: 'manager', person: 'person' };

const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });
const pad = (value) => String(value).padStart(2, '0');

// Process TZ is pinned to DB_TIMEZONE in config/database.js, so local date == business date.
const todayLocal = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + Number(days));
  return value.toISOString().slice(0, 10);
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const timesheetRole = (role) => ROLE_MAP[role] || null;

const permissionsFor = (role) => ({
  manage_clients: role === 'admin' || role === 'manager',
  view_reports: role === 'admin' || role === 'manager',
  log_for_others: role === 'admin' || role === 'manager',
  setup: role === 'admin',
  approve_unlocks: role === 'admin',
  bypass_lock: role === 'admin',
});

// Drafts never lock; submitted entries lock lockDays after the submission date
// unless an admin-approved unlock window is still running.
function lockState(entry, lockDays, today) {
  if (entry.status !== 'SUBMITTED' || !entry.submitted_on) {
    return { locked: false, editable_until: null, unlocked_until: null };
  }
  const editableUntil = addDays(entry.submitted_on, lockDays);
  const unlocked = Boolean(entry.unlocked_until && today <= entry.unlocked_until);
  return {
    locked: !unlocked && today > editableUntil,
    editable_until: editableUntil,
    unlocked_until: unlocked ? entry.unlocked_until : null,
  };
}

const isOwner = (entry, userId) => Number(entry.created_by) === Number(userId) || Number(entry.agent_id) === Number(userId);

function canViewEntry(role, userId, entry) {
  if (entry.status === 'SUBMITTED') return true;
  return role === 'admin' || role === 'manager' || Number(entry.created_by) === Number(userId);
}

function canEditEntry(role, userId, entry, lock) {
  if (role === 'admin') return true;
  if (lock.locked) return false;
  if (role === 'manager') return true;
  return isOwner(entry, userId);
}

const canLogTime = (role, userId, entry, lock) => canViewEntry(role, userId, entry) && (role === 'admin' || !lock.locked);

function canRequestUnlock(role, userId, entry, lock) {
  if (role === 'admin' || !lock.locked) return false;
  return role === 'manager' || isOwner(entry, userId);
}

function canDeleteEntry(role, userId, entry) {
  if (role === 'admin') return true;
  return entry.status === 'DRAFT' && Number(entry.created_by) === Number(userId);
}

function text(body, key, max, label, errors, required) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors[key] = `${label} is required.`;
    return null;
  }
  if (typeof raw !== 'string') { errors[key] = `${label} must be text.`; return null; }
  const value = raw.trim();
  if (!value) { if (required) errors[key] = `${label} is required.`; return null; }
  if (value.length > max) { errors[key] = `${label} must be at most ${max} characters.`; return null; }
  return value;
}

function id(body, key, label, errors, required) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors[key] = `${label} is required.`;
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) { errors[key] = `${label} is invalid.`; return null; }
  return value;
}

function date(body, key, label, errors, required, today, notFuture) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors[key] = `${label} is required.`;
    return null;
  }
  if (!isValidDate(raw)) { errors[key] = `${label} must be a valid date.`; return null; }
  if (notFuture && raw > today) { errors[key] = `${label} cannot be in the future.`; return null; }
  return raw;
}

function parseHours(raw, errors, key = 'hours', required = true) {
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors[key] = 'Hours worked is required.';
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 24) { errors[key] = 'Hours must be more than 0 and at most 24.'; return null; }
  if (Math.round(value * 100) !== value * 100) { errors[key] = 'Hours can have at most 2 decimal places.'; return null; }
  return value;
}

// mode: 'draft' (only client required), 'submit' (all required, hours too), 'edit' (all required, no hours).
function validateEntry(body, mode, today) {
  const errors = {};
  const full = mode !== 'draft';
  const entry = {
    client_id: id(body, 'client_id', 'Client', errors, true),
    task_id: id(body, 'task_id', 'Task', errors, false),
    job_type: text(body, 'job_type', 120, 'Job Type', errors, full),
    work_type: text(body, 'work_type', 120, 'Work Type', errors, full),
    date_worked: date(body, 'date_worked', 'Date worked', errors, full, today, true),
    agent_id: id(body, 'agent_id', 'Agent', errors, full),
    period_type: text(body, 'period_type', 120, 'Period Type', errors, full),
    period_ended: date(body, 'period_ended', 'Period Ended', errors, full, today, false),
    registration_status: text(body, 'registration_status', 120, 'Registration Status', errors, full),
    description: text(body, 'description', 2000, 'Description', errors, false),
    count_type: text(body, 'count_type', 120, 'Count Type', errors, full),
    count_number: null,
  };
  const count = body.count_number;
  if (count === undefined || count === null || count === '') {
    if (full) errors.count_number = 'Count number is required.';
  } else if (!Number.isSafeInteger(Number(count)) || Number(count) < 0 || Number(count) > 2000000000) {
    errors.count_number = 'Count number must be a whole number, 0 or more.';
  } else entry.count_number = Number(count);
  entry.hours = mode === 'edit' ? null : parseHours(body.hours, errors, 'hours', mode === 'submit');
  if (Object.keys(errors).length) throw fail(422, Object.values(errors)[0], errors);
  return entry;
}

// Fields a draft must have before it can be submitted.
const missingForSubmit = (entry) => ['job_type', 'work_type', 'date_worked', 'agent_id', 'period_type', 'period_ended', 'registration_status', 'count_type', 'count_number']
  .filter((key) => entry[key] === null || entry[key] === undefined || entry[key] === '');

function summarizeReport(rows) {
  const people = new Map();
  const clients = new Map();
  let total = 0;
  rows.forEach((row) => {
    const hours = Number(row.hours);
    total += hours;
    const person = people.get(row.user_id) || { user_id: row.user_id, name: row.user_name, hours: 0 };
    person.hours += hours; people.set(row.user_id, person);
    const client = clients.get(row.client_id) || { client_id: row.client_id, name: row.client_name, hours: 0, entries: new Map() };
    client.hours += hours;
    const entry = client.entries.get(row.entry_id) || {
      entry_id: row.entry_id, date_worked: row.date_worked, job_type: row.job_type, work_type: row.work_type,
      period_type: row.period_type, period_ended: row.period_ended, hours: 0, people: new Map(),
    };
    entry.hours += hours;
    entry.people.set(row.user_id, { user_id: row.user_id, name: row.user_name, hours: (entry.people.get(row.user_id)?.hours || 0) + hours });
    client.entries.set(row.entry_id, entry);
    clients.set(row.client_id, client);
  });
  const round = (value) => Math.round(value * 100) / 100;
  return {
    total_hours: round(total),
    entry_count: new Set(rows.map((row) => row.entry_id)).size,
    by_person: [...people.values()].map((p) => ({ ...p, hours: round(p.hours) })).sort((a, b) => b.hours - a.hours),
    by_client: [...clients.values()].map((c) => ({
      client_id: c.client_id, name: c.name, hours: round(c.hours),
      entries: [...c.entries.values()].map((e) => ({ ...e, hours: round(e.hours), people: [...e.people.values()].map((p) => ({ ...p, hours: round(p.hours) })) })),
    })),
  };
}

module.exports = {
  OPTION_GROUPS, DEFAULT_OPTIONS, DEFAULT_SETTINGS, fail, todayLocal, addDays, isValidDate, timesheetRole, permissionsFor,
  lockState, canViewEntry, canEditEntry, canLogTime, canRequestUnlock, canDeleteEntry, validateEntry, parseHours,
  missingForSubmit, summarizeReport,
};
