const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { orgMembers } = require('../utils/orgMember');
const { RESPONSES, fail, validateRange, validateEvent, sqlDateTime } = require('../services/calendarRules');
const {
  db, route, requireMember, positive, EVENT_COLUMNS, shapeEvent, attendeesFor, loadVisibleEvent, validAttendees, notifyUsers,
} = require('./calendarSupport');

router.use(authenticate, requireMember);

const when = (event) => (event.all_day ? event.start_at.slice(0, 10) : event.start_at.replace('T', ' '));
const label = (type) => ({ MEETING: 'meeting', REMINDER: 'reminder' }[type] || 'event');

router.get('/members', route(async (req, res) => {
  res.json((await orgMembers(req.orgId)).map(({ id, name }) => ({ id, name })));
}));

// Events the user organizes or is invited to, plus their own tasks due in the range.
router.get('/events', route(async (req, res) => {
  const { from, toExclusive } = validateRange(req.query.from, req.query.to);
  const [rows] = await db.execute(
    `SELECT ${EVENT_COLUMNS} FROM calendar_events e LEFT JOIN users u ON u.id = e.created_by
     WHERE e.org_id = ? AND e.is_deleted = 0 AND e.start_at < ? AND e.end_at >= ?
       AND (e.created_by = ? OR EXISTS (SELECT 1 FROM calendar_event_attendees a WHERE a.event_id = e.id AND a.user_id = ?))
     ORDER BY e.start_at ASC`,
    [req.orgId, toExclusive, from, req.userId, req.userId]
  );
  const map = await attendeesFor(rows.map((row) => row.id));
  // scope=team: every task due in the user's teams (admins: the whole organization).
  const teamScope = req.query.scope === 'team';
  const orgWide = teamScope && req.orgRole === 'admin';
  const scopeSql = !teamScope ? '(t.assigned_to = ? OR t.assigned_by = ?)'
    : orgWide ? '1 = 1'
      : 'EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.team_id AND tm.user_id = ?)';
  const scopeParams = !teamScope ? [req.userId, req.userId] : orgWide ? [] : [req.userId];
  const [tasks] = await db.execute(
    `SELECT t.id, t.title, t.status, t.priority, t.team_id, t.issue_type, t.client_name, u.name AS assigned_to_name,
       cb.name AS created_by_name, te.name AS team_name, CONVERT(VARCHAR(10), t.due_date, 23) AS due_date,
       CONVERT(VARCHAR(16), t.created_at, 126) AS created_at
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN users cb ON cb.id = t.assigned_by
     LEFT JOIN teams te ON te.id = t.team_id
     WHERE t.org_id = ? AND t.is_deleted = 0 AND t.due_date >= ? AND t.due_date < ? AND ${scopeSql}
     ORDER BY t.due_date ASC, t.id ASC OFFSET 0 ROWS FETCH NEXT 500 ROWS ONLY`,
    [req.orgId, from, toExclusive, ...scopeParams]
  );
  res.json({ events: rows.map((row) => shapeEvent(row, map[row.id] || [], req.userId)), tasks });
}));

router.get('/events/:id', route(async (req, res) => {
  res.json(await loadVisibleEvent(req, positive(req.params.id, 'event')));
}));

router.post('/events', route(async (req, res) => {
  const event = validateEvent(req.body);
  const attendees = await validAttendees(req.orgId, event.attendee_ids, req.userId);
  const [result] = await db.execute(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     DECLARE @event_id INT;
     INSERT INTO calendar_events (org_id, title, description, event_type, start_at, end_at, all_day, location, reminder_minutes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
     SET @event_id = SCOPE_IDENTITY();
     ${attendees.length ? `INSERT INTO calendar_event_attendees (event_id, user_id) VALUES ${attendees.map(() => '(@event_id, ?)').join(', ')};` : ''}
     COMMIT;
     SELECT @event_id AS insertId;`,
    [req.orgId, event.title, event.description, event.event_type, sqlDateTime(event.start_at), sqlDateTime(event.end_at), event.all_day,
      event.location, event.reminder_minutes, req.userId, ...attendees]
  );
  if (attendees.length) {
    await notifyUsers(attendees, 'calendar_invite', `You are invited to the ${label(event.event_type)} "${event.title}" on ${when(event)}`, { event_id: result.insertId });
  }
  res.status(201).json({ id: result.insertId });
}));

router.put('/events/:id', route(async (req, res) => {
  const current = await loadVisibleEvent(req, positive(req.params.id, 'event'));
  if (!current.is_organizer) throw fail(403, 'Only the organizer can change this event');
  const version = positive(req.body.version, 'version');
  const event = validateEvent(req.body);
  const attendees = await validAttendees(req.orgId, event.attendee_ids, req.userId);
  const before = current.attendees.map((a) => Number(a.user_id));
  const added = attendees.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !attendees.includes(id));
  const timeChanged = current.start_at !== event.start_at || current.end_at !== event.end_at;
  const [result] = await db.execute(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     UPDATE calendar_events SET title = ?, description = ?, event_type = ?, start_at = ?, end_at = ?, all_day = ?, location = ?,
       reminder_minutes = ?, reminder_sent_at = CASE WHEN ? = 1 OR ISNULL(reminder_minutes, -1) <> ISNULL(?, -1) THEN NULL ELSE reminder_sent_at END,
       version = version + 1, updated_at = SYSDATETIME()
     WHERE id = ? AND org_id = ? AND version = ? AND is_deleted = 0;
     IF @@ROWCOUNT = 0 BEGIN ROLLBACK; SELECT 0 AS ok; RETURN; END
     ${removed.length ? `DELETE FROM calendar_event_attendees WHERE event_id = ? AND user_id IN (${removed.map(() => '?').join(',')});` : ''}
     ${added.length ? `INSERT INTO calendar_event_attendees (event_id, user_id) VALUES ${added.map(() => '(?, ?)').join(', ')};` : ''}
     COMMIT;
     SELECT 1 AS ok;`,
    [event.title, event.description, event.event_type, sqlDateTime(event.start_at), sqlDateTime(event.end_at), event.all_day, event.location,
      event.reminder_minutes, timeChanged ? 1 : 0, event.reminder_minutes, current.id, req.orgId, version,
      ...(removed.length ? [current.id, ...removed] : []), ...added.flatMap((id) => [current.id, id])]
  );
  if (!result.rows?.[0]?.ok) throw fail(409, 'This event changed. Reload it and try again.');
  const kept = attendees.filter((id) => before.includes(id));
  if (added.length) await notifyUsers(added, 'calendar_invite', `You are invited to the ${label(event.event_type)} "${event.title}" on ${when(event)}`, { event_id: current.id });
  if (kept.length) await notifyUsers(kept, 'calendar_updated', `"${event.title}" was updated${timeChanged ? `: now on ${when(event)}` : ''}`, { event_id: current.id });
  if (removed.length) await notifyUsers(removed, 'calendar_cancelled', `You were removed from "${current.title}"`, { event_id: current.id });
  res.json({ id: current.id, version: version + 1 });
}));

router.delete('/events/:id', route(async (req, res) => {
  const current = await loadVisibleEvent(req, positive(req.params.id, 'event'));
  if (!current.is_organizer) throw fail(403, 'Only the organizer can delete this event');
  await db.execute('UPDATE calendar_events SET is_deleted = 1, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?', [current.id, req.orgId]);
  const attendees = current.attendees.map((a) => a.user_id);
  if (attendees.length) await notifyUsers(attendees, 'calendar_cancelled', `"${current.title}" on ${when(current)} was cancelled`, { event_id: current.id });
  res.json({ id: current.id });
}));

router.patch('/events/:id/response', route(async (req, res) => {
  const current = await loadVisibleEvent(req, positive(req.params.id, 'event'));
  const response = String(req.body.response || '');
  if (!RESPONSES.includes(response)) throw fail(422, 'Response must be ACCEPTED, DECLINED or PENDING');
  if (current.is_organizer || current.my_response === null) throw fail(403, 'Only invited people can reply');
  await db.execute(
    'UPDATE calendar_event_attendees SET response = ?, responded_at = SYSDATETIME() WHERE event_id = ? AND user_id = ?',
    [response, current.id, req.userId]
  );
  if (response !== 'PENDING' && response !== current.my_response) {
    const [[me]] = await db.execute('SELECT name FROM users WHERE id = ?', [req.userId]);
    await notifyUsers([current.created_by], 'calendar_updated', `${me?.name || 'Someone'} ${response === 'ACCEPTED' ? 'accepted' : 'declined'} "${current.title}"`, { event_id: current.id });
  }
  res.json({ id: current.id, response });
}));

module.exports = router;
