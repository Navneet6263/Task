// Pure calendar rules (no database), unit-tested directly.
const EVENT_TYPES = ['EVENT', 'MEETING', 'REMINDER'];
const REMINDER_CHOICES = [0, 5, 10, 15, 30, 60, 120, 1440];
const RESPONSES = ['ACCEPTED', 'DECLINED', 'PENDING'];
const MAX_ATTENDEES = 50;
const MAX_RANGE_DAYS = 62;
const MAX_EVENT_DAYS = 31;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });
const pad = (value) => String(value).padStart(2, '0');

// Wall-clock "now" in the process timezone (pinned to DB_TIMEZONE), as YYYY-MM-DDTHH:mm:ss.
const localNow = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

// Treat a local date-time as UTC only for arithmetic and validation; no timezone shift.
const asUtc = (value) => new Date(`${value}${value.length === 16 ? ':00' : ''}Z`);

function isValidLocalDateTime(value) {
  if (typeof value !== 'string' || !LOCAL_DATETIME.test(value)) return false;
  const parsed = asUtc(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 16) === value;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const daysBetween = (a, b) => (asUtc(b) - asUtc(a)) / 86400000;

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function validateRange(from, to) {
  if (!isValidDate(from) || !isValidDate(to)) throw fail(422, 'Pick a valid from and to date');
  if (from > to) throw fail(422, 'From date must be before the to date');
  if (to > addDays(from, MAX_RANGE_DAYS)) throw fail(422, `Pick a range of ${MAX_RANGE_DAYS} days or less`);
  return { from, toExclusive: addDays(to, 1) };
}

function text(body, key, max, label, errors, required) {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === '') { if (required) errors[key] = `${label} is required.`; return null; }
  if (typeof raw !== 'string') { errors[key] = `${label} must be text.`; return null; }
  const value = raw.trim();
  if (!value) { if (required) errors[key] = `${label} is required.`; return null; }
  if (value.length > max) { errors[key] = `${label} must be at most ${max} characters.`; return null; }
  return value;
}

function attendeeIds(raw, errors) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { errors.attendee_ids = 'Attendees must be a list.'; return []; }
  const ids = [...new Set(raw.map(Number))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)) { errors.attendee_ids = 'Attendee list has an invalid person.'; return []; }
  if (ids.length > MAX_ATTENDEES) { errors.attendee_ids = `Invite at most ${MAX_ATTENDEES} people.`; return []; }
  return ids;
}

// All-day events are stored from 00:00 on the start date to 23:59 on the end date.
function validateEvent(body) {
  const errors = {};
  const event = {
    title: text(body, 'title', 200, 'Title', errors, true),
    description: text(body, 'description', 2000, 'Description', errors, false),
    location: text(body, 'location', 500, 'Location or link', errors, false),
    event_type: EVENT_TYPES.includes(body.event_type) ? body.event_type : null,
    all_day: body.all_day === true,
    reminder_minutes: null,
    attendee_ids: attendeeIds(body.attendee_ids, errors),
  };
  if (!event.event_type) errors.event_type = 'Pick Event, Meeting or Reminder.';
  if (body.reminder_minutes !== undefined && body.reminder_minutes !== null && body.reminder_minutes !== '') {
    const minutes = Number(body.reminder_minutes);
    if (REMINDER_CHOICES.includes(minutes)) event.reminder_minutes = minutes;
    else errors.reminder_minutes = 'Pick a reminder from the list.';
  }
  let start = body.start_at;
  let end = body.end_at;
  if (event.all_day) {
    start = typeof start === 'string' ? `${start.slice(0, 10)}T00:00` : start;
    end = typeof end === 'string' ? `${end.slice(0, 10)}T23:59` : end;
  }
  if (!isValidLocalDateTime(start)) errors.start_at = 'Pick a valid start date and time.';
  if (!isValidLocalDateTime(end)) errors.end_at = 'Pick a valid end date and time.';
  if (!errors.start_at && !errors.end_at) {
    if (end < start) errors.end_at = 'End must be after the start.';
    else if (daysBetween(start, end) > MAX_EVENT_DAYS) errors.end_at = `An event can last at most ${MAX_EVENT_DAYS} days.`;
  }
  if (Object.keys(errors).length) throw fail(422, Object.values(errors)[0], errors);
  return { ...event, start_at: start, end_at: end };
}

const sqlDateTime = (value) => `${value}:00`;

// When a reminder is due: reminder_minutes before the start.
function reminderDueAt(startAt, minutes) {
  const due = asUtc(startAt);
  due.setUTCMinutes(due.getUTCMinutes() - minutes);
  return due.toISOString().slice(0, 19);
}

const reminderLabel = (minutes) => {
  if (minutes === 0) return 'now';
  if (minutes < 60) return `in ${minutes} minutes`;
  if (minutes === 1440) return 'tomorrow';
  return `in ${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
};

module.exports = {
  EVENT_TYPES, REMINDER_CHOICES, RESPONSES, MAX_ATTENDEES, fail, localNow, isValidLocalDateTime, isValidDate, addDays,
  validateRange, validateEvent, sqlDateTime, reminderDueAt, reminderLabel,
};
