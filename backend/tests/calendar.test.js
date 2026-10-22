const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const ws = require('../src/websocket');
const router = require('../src/routes/calendar');
const rules = require('../src/services/calendarRules');
const { sendDueReminders } = require('../src/services/calendarReminders');

const meeting = { title: 'Client review', event_type: 'MEETING', start_at: '2026-10-20T15:00', end_at: '2026-10-20T16:00', reminder_minutes: 15, attendee_ids: [20, 21] };
const eventRow = { id: 5, title: 'Client review', event_type: 'MEETING', all_day: false, start_at: '2026-10-20T15:00', end_at: '2026-10-20T16:00', created_by: 10, version: 2 };

async function client(t, identity = { id: 10, role: 'person', org_id: 1 }) {
  process.env.JWT_SECRET = 'calendar-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function mockDb(t, handle) {
  const calls = [];
  t.mock.method(ws, 'sendToUser', () => {});
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 10, role: 'person' }]];
    if (sql.startsWith('INSERT INTO notifications')) return [{}];
    return handle(sql, params);
  });
  return calls;
}

/* Rules */
test('events need a title, a valid type and an end after the start', () => {
  assert.equal(rules.validateEvent(meeting).start_at, '2026-10-20T15:00');
  assert.throws(() => rules.validateEvent({ ...meeting, title: ' ' }), (e) => e.status === 422 && Boolean(e.fields.title));
  assert.throws(() => rules.validateEvent({ ...meeting, end_at: '2026-10-20T14:00' }), (e) => Boolean(e.fields.end_at));
  assert.throws(() => rules.validateEvent({ ...meeting, start_at: '2026-02-30T10:00' }), (e) => Boolean(e.fields.start_at));
  assert.throws(() => rules.validateEvent({ ...meeting, reminder_minutes: 7 }), (e) => Boolean(e.fields.reminder_minutes));
  assert.throws(() => rules.validateEvent({ ...meeting, event_type: 'PARTY' }), (e) => Boolean(e.fields.event_type));
});

test('all-day events cover the whole of each day', () => {
  const event = rules.validateEvent({ ...meeting, all_day: true, start_at: '2026-10-20', end_at: '2026-10-21' });
  assert.equal(event.start_at, '2026-10-20T00:00');
  assert.equal(event.end_at, '2026-10-21T23:59');
});

test('calendar ranges are bounded and reminders fall before the start', () => {
  assert.deepEqual(rules.validateRange('2026-10-01', '2026-10-31'), { from: '2026-10-01', toExclusive: '2026-11-01' });
  assert.throws(() => rules.validateRange('2026-01-01', '2026-06-01'), /62 days/);
  assert.equal(rules.reminderDueAt('2026-10-20T00:10', 15), '2026-10-19T23:55:00');
});

/* Routes */
test('people outside the organization cannot use the calendar', async (t) => {
  t.mock.method(db, 'execute', async () => [[]]);
  const send = await client(t);
  assert.equal((await send('/events?from=2026-10-01&to=2026-10-31')).status, 403);
  assert.equal((await send('/events', 'POST', meeting)).status, 403);
});

test('creating a meeting stores the token org and organizer and notifies each invitee', async (t) => {
  let insert;
  const calls = mockDb(t, async (sql, params) => {
    if (sql.startsWith('SELECT u.id FROM users u WHERE u.id IN')) return [[{ id: 20 }, { id: 21 }]];
    if (sql.startsWith('SET XACT_ABORT ON')) { insert = params; return [{ insertId: 9, rows: [{ insertId: 9 }] }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const response = await send('/events', 'POST', { ...meeting, org_id: 99, created_by: 99, attendee_ids: [20, 21, 10] });
  assert.equal(response.status, 201);
  assert.equal(insert[0], 1, 'org from token');
  assert.equal(insert[4], '2026-10-20T15:00:00');
  assert.equal(insert[9], 10, 'organizer from token');
  assert.deepEqual(insert.slice(10), [20, 21], 'organizer is never added as an attendee');
  const notes = calls.filter((call) => call.sql.startsWith('INSERT INTO notifications'));
  assert.deepEqual(notes.map((call) => call.params[0]), [20, 21]);
  assert.equal(notes[0].params[1], 'calendar_invite');
});

test('invitees from another organization are rejected', async (t) => {
  mockDb(t, async (sql) => {
    if (sql.startsWith('SELECT u.id FROM users u WHERE u.id IN')) return [[{ id: 20 }]];
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const response = await send('/events', 'POST', meeting);
  assert.equal(response.status, 422);
  assert.ok((await response.json()).fields.attendee_ids);
});

test('only the organizer can edit or delete; others are refused', async (t) => {
  mockDb(t, async (sql) => {
    if (sql.includes('FROM calendar_events e') && sql.includes('WHERE e.id = ?')) return [[{ ...eventRow, created_by: 30 }]];
    if (sql.includes('FROM calendar_event_attendees a')) return [[{ event_id: 5, user_id: 10, name: 'Me', response: 'PENDING' }]];
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  assert.equal((await send('/events/5', 'PUT', { ...meeting, version: 2 })).status, 403);
  assert.equal((await send('/events/5', 'DELETE')).status, 403);
});

test('events the user is not part of are not found, and the query is scoped to org and user', async (t) => {
  let lookup;
  mockDb(t, async (sql, params) => {
    if (sql.includes('FROM calendar_events e') && sql.includes('WHERE e.id = ?')) { lookup = params; return [[]]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  assert.equal((await send('/events/5')).status, 404);
  assert.deepEqual(lookup, [5, 1, 10, 10]);
});

test('due reminders are claimed once and sent to everyone who has not declined', async (t) => {
  const calls = mockDb(t, async (sql) => {
    if (sql.startsWith('UPDATE calendar_events SET reminder_sent_at')) return [{ rows: [{ id: 5, title: 'Standup', created_by: 10, reminder_minutes: 10, all_day: false, start_at: '2026-10-20T09:30' }] }];
    if (sql.startsWith('SELECT user_id FROM calendar_event_attendees')) { assert.match(sql, /DECLINED/); return [[{ user_id: 20 }]]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  assert.equal(await sendDueReminders(new Date(2026, 9, 20, 9, 20)), 1);
  const claim = calls.find((call) => call.sql.startsWith('UPDATE calendar_events'));
  assert.deepEqual(claim.params, ['2026-10-20T09:20:00', '2026-10-20T09:20:00']);
  const notes = calls.filter((call) => call.sql.startsWith('INSERT INTO notifications'));
  assert.deepEqual(notes.map((call) => call.params[0]), [10, 20]);
  assert.match(notes[0].params[2], /Standup.*in 10 minutes.*09:30/);
});

test('team scope lists tasks from the member teams only, never outside the organization', async (t) => {
  const queries = [];
  mockDb(t, async (sql, params) => {
    if (sql.includes('FROM calendar_events e')) return [[]];
    if (sql.includes('FROM tasks t')) { queries.push({ sql, params }); return [[]]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  assert.equal((await send('/events?from=2026-10-01&to=2026-10-31&scope=team')).status, 200);
  assert.equal((await send('/events?from=2026-10-01&to=2026-10-31')).status, 200);
  assert.match(queries[0].sql, /team_members tm WHERE tm\.team_id = t\.team_id AND tm\.user_id = \?/);
  assert.deepEqual(queries[0].params, [1, '2026-10-01', '2026-11-01', 10]);
  assert.match(queries[1].sql, /t\.assigned_to = \? OR t\.assigned_by = \?/);
});
