const db = require('../config/database');
const ws = require('../websocket');
const { fail } = require('../services/calendarRules');
const { currentOrgRole, memberClause } = require('../utils/orgMember');

const route = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) {
    if (!error.status) console.error('[calendar]', error.message);
    res.status(error.status || 500).json({
      error: error.status ? error.message : 'Unable to complete request. Please retry.',
      ...(error.fields ? { fields: error.fields } : {}),
    });
  }
};

// Stores the live role so org-wide views never trust a stale token role.
const requireMember = route(async (req, res, next) => { req.orgRole = await currentOrgRole(req); next(); });

function positive(value, label = 'ID') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw fail(422, `Invalid ${label}`);
  return number;
}

const EVENT_COLUMNS = `e.id, e.title, e.description, e.event_type, e.all_day, e.location, e.reminder_minutes,
  CONVERT(VARCHAR(16), e.start_at, 126) AS start_at, CONVERT(VARCHAR(16), e.end_at, 126) AS end_at,
  e.created_by, u.name AS created_by_name, e.version`;

const isTrue = (value) => value === true || value === 1;
const shapeEvent = (row, attendees, userId) => {
  const mine = attendees.find((a) => Number(a.user_id) === Number(userId));
  return {
    ...row,
    all_day: isTrue(row.all_day),
    attendees,
    is_organizer: Number(row.created_by) === Number(userId),
    my_response: mine ? mine.response : null,
  };
};

async function attendeesFor(eventIds) {
  if (!eventIds.length) return {};
  const [rows] = await db.execute(
    `SELECT a.event_id, a.user_id, u.name, a.response FROM calendar_event_attendees a
     JOIN users u ON u.id = a.user_id WHERE a.event_id IN (${eventIds.map(() => '?').join(',')}) ORDER BY u.name`,
    eventIds
  );
  return rows.reduce((map, row) => {
    (map[row.event_id] ||= []).push({ user_id: row.user_id, name: row.name, response: row.response });
    return map;
  }, {});
}

// Organizer or attendee only; anyone else gets "not found" so ids cannot be probed.
async function loadVisibleEvent(req, eventId) {
  const [[row]] = await db.execute(
    `SELECT ${EVENT_COLUMNS} FROM calendar_events e LEFT JOIN users u ON u.id = e.created_by
     WHERE e.id = ? AND e.org_id = ? AND e.is_deleted = 0
       AND (e.created_by = ? OR EXISTS (SELECT 1 FROM calendar_event_attendees a WHERE a.event_id = e.id AND a.user_id = ?))`,
    [eventId, req.orgId, req.userId, req.userId]
  );
  if (!row) throw fail(404, 'Event not found');
  const map = await attendeesFor([row.id]);
  return shapeEvent(row, map[row.id] || [], req.userId);
}

// Attendees must be members of the same organization; the organizer is never an attendee.
async function validAttendees(orgId, ids, organizerId) {
  const wanted = ids.filter((id) => id !== Number(organizerId));
  if (!wanted.length) return [];
  const [rows] = await db.execute(
    `SELECT u.id FROM users u WHERE u.id IN (${wanted.map(() => '?').join(',')}) AND u.is_deleted = FALSE AND ${memberClause}`,
    [...wanted, orgId, orgId]
  );
  if (rows.length !== wanted.length) throw fail(422, 'Invite only people from your organization', { attendee_ids: 'Invite only people from your organization.' });
  return wanted;
}

async function notifyUsers(userIds, type, message, payload = {}) {
  for (const userId of [...new Set(userIds.map(Number))]) {
    try {
      await db.execute('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', [userId, type, message.slice(0, 255)]);
      ws.sendToUser(userId, type === 'calendar_reminder' ? 'calendar_reminder' : 'calendar_updated', { message: message.slice(0, 255), ...payload });
    } catch (error) { console.error('[calendar] notify failed', error.message); }
  }
}

module.exports = { db, route, requireMember, positive, EVENT_COLUMNS, shapeEvent, attendeesFor, loadVisibleEvent, validAttendees, notifyUsers };
