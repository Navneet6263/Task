const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/database');
const mailer = require('../src/utils/mailer');
const { emailCalendar, emailInvites, buildIcs, readable } = require('../src/services/inviteMail');

const meeting = { id: 41, title: 'Payroll review', description: 'Bring the October sheet', location: 'Teams call', start_at: '2026-11-14T10:30', end_at: '2026-11-14T11:00', all_day: false, event_type: 'MEETING', version: 1 };

test('the invite file gives the time in UTC, so every mail app shows it right (10:30 India time = 05:00 UTC)', () => {
  assert.equal(process.env.TZ, 'Asia/Kolkata', 'calendar times are India wall-clock times');
  const ics = buildIcs({ eventId: 41, title: 'Review; Q4, payroll', start: '2026-11-14T10:30', end: '2026-11-14T11:00', organizer: { name: 'Navneet', email: 'n@x.com' }, attendees: [{ name: 'Ashish', email: 'a@x.com' }], host: 'task.greencall.in', sequence: 3 });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:greentask-event-41@task\.greencall\.in/);
  assert.match(ics, /SEQUENCE:3/);
  assert.match(ics, /DTSTART:20261114T050000Z\r\nDTEND:20261114T053000Z/);
  assert.ok(ics.includes('SUMMARY:Review\\; Q4\\, payroll'), 'commas and semicolons are escaped');
  assert.match(ics, /ATTENDEE;CN=Ashish;RSVP=TRUE:mailto:a@x\.com/);
  // Late evening crosses to the previous day in UTC.
  assert.match(buildIcs({ eventId: 1, title: 'x', start: '2026-11-15T02:00', end: '2026-11-15T03:00', attendees: [] }), /DTSTART:20261114T203000Z/);
});

test('an all-day event ends the day after its last day, as iCalendar expects; a cancel says so', () => {
  const one = buildIcs({ eventId: 2, title: 'Holiday', start: '2026-12-31T00:00', end: '2026-12-31T23:59', allDay: true, attendees: [] });
  assert.match(one, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  const cancel = buildIcs({ eventId: 2, title: 'Holiday', start: '2026-12-31T00:00', end: '2026-12-31T23:59', allDay: true, attendees: [], method: 'CANCEL' });
  assert.match(cancel, /METHOD:CANCEL/);
  assert.match(cancel, /STATUS:CANCELLED/);
});

test('the date in the email is written out in full, with the end date when it runs past midnight', () => {
  assert.equal(readable(meeting), 'Saturday 14 November 2026, 10:30 to 11:00 (India time)');
  assert.equal(readable({ ...meeting, end_at: '2026-11-15T01:00' }), 'Saturday 14 November 2026, 10:30 to Sunday 15 November 2026, 01:00 (India time)');
  assert.equal(readable({ ...meeting, all_day: true, start_at: '2026-11-14T00:00', end_at: '2026-11-16T23:59' }), 'Saturday 14 November 2026 to Monday 16 November 2026 (all day)');
  assert.equal(readable({ ...meeting, event_type: 'REMINDER', end_at: meeting.start_at }), 'Saturday 14 November 2026, 10:30 (India time)');
});

function fakeMail(t, { people } = {}) {
  const sent = [];
  const logs = [];
  t.mock.method(mailer, 'createTransporter', () => ({ sendMail: async (mail) => { sent.push(mail); return { messageId: 'm1' }; } }));
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.name, u.email FROM users u')) {
      assert.match(sql, /user_org_access/, 'people of this workspace, including those given access to it');
      assert.deepEqual(params.slice(-2), [8, 8]);
      return [people || [{ id: 12, name: 'Ashish Kumar', email: 'ashish@x.com' }, { id: 13, name: 'Code Only', email: 'act13.8@no-email.invalid' }]];
    }
    if (sql.startsWith('SELECT name, email FROM users WHERE id = ?')) return [[{ name: 'Navneet Kumar', email: 'navneet@x.com' }]];
    if (sql.startsWith('INSERT INTO communication_logs')) { logs.push(params); return [{}]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  return { sent, logs };
}

test('a meeting invite is emailed in every workspace, never to placeholder addresses, and is logged', async (t) => {
  const { sent, logs } = fakeMail(t);
  const count = await emailInvites(8, 3, [12, 13, 12], meeting, { appUrl: 'https://task.greencall.in' });
  assert.equal(count, 1);
  assert.equal(sent[0].to, 'ashish@x.com');
  assert.equal(sent[0].subject, 'Navneet Kumar has scheduled a meeting with you: Payroll review');
  assert.match(sent[0].text, /^Hi Ashish,/);
  assert.match(sent[0].text, /When: Saturday 14 November 2026, 10:30 to 11:00 \(India time\)/);
  assert.match(sent[0].text, /https:\/\/task\.greencall\.in\/calendar/);
  assert.equal(sent[0].icalEvent.method, 'REQUEST');
  assert.deepEqual([logs[0][0], logs[0][1], logs[0][2], logs[0][7], logs[0][8]], [8, 3, 'ashish@x.com', 'Calendar invite', 'SENT']);
});

test('a reminder set for someone, a time change and a cancellation each get their own email', async (t) => {
  const { sent } = fakeMail(t, { people: [{ id: 12, name: 'Ashish', email: 'ashish@x.com' }] });
  const reminder = { ...meeting, event_type: 'REMINDER', title: 'Call Acme about VAT', end_at: meeting.start_at, task_id: 40, task_title: 'VAT return for Acme' };
  await emailCalendar(8, 3, [12], reminder, { kind: 'invite', appUrl: 'https://task.greencall.in' });
  assert.equal(sent[0].subject, 'Navneet Kumar set a reminder for you: Call Acme about VAT');
  assert.match(sent[0].text, /Task: VAT return for Acme/);
  assert.match(sent[0].text, /https:\/\/task\.greencall\.in\/dashboard\?task=40/, 'the link opens the task');

  await emailCalendar(8, 3, [12], { ...meeting, start_at: '2026-11-14T12:00', end_at: '2026-11-14T12:30', version: 4 }, { kind: 'update' });
  assert.equal(sent[1].subject, 'Updated: Payroll review, now Saturday 14 November 2026, 12:00 to 12:30 (India time)');
  assert.match(sent[1].icalEvent.content, /SEQUENCE:4/, 'their own calendar moves it instead of adding a second one');

  await emailCalendar(8, 3, [12], meeting, { kind: 'cancel' });
  assert.equal(sent[2].subject, 'Cancelled: Payroll review');
  assert.equal(sent[2].icalEvent.method, 'CANCEL');
});

test('when a reminder is due its email says what it is about and needs no invite file', async (t) => {
  const { sent, logs } = fakeMail(t, { people: [{ id: 3, name: 'Navneet', email: 'navneet@x.com' }] });
  await emailCalendar(8, null, [3], { ...meeting, event_type: 'REMINDER', title: 'Call Acme', end_at: meeting.start_at, task_id: 40 }, { kind: 'reminder', appUrl: 'https://task.greencall.in' });
  assert.equal(sent[0].subject, 'Reminder: Call Acme');
  assert.equal(sent[0].icalEvent, undefined);
  assert.match(sent[0].text, /Open the task:\n\nhttps:\/\/task\.greencall\.in\/dashboard\?task=40/);
  assert.equal(logs[0][7], 'Reminder');
});

test('a mail server error is logged as failed and does not throw', async (t) => {
  const logs = [];
  t.mock.method(mailer, 'createTransporter', () => ({ sendMail: async () => { throw new Error('535 Authentication unsuccessful'); } }));
  t.mock.method(console, 'error', () => {});
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.name, u.email FROM users u')) return [[{ id: 12, name: 'Ashish', email: 'ashish@x.com' }]];
    if (sql.startsWith('SELECT name, email FROM users WHERE id = ?')) return [[{ name: 'Navneet', email: 'n@x.com' }]];
    if (sql.startsWith('INSERT INTO communication_logs')) { logs.push(params); return [{}]; }
    return [[]];
  });
  assert.equal(await emailInvites(8, 3, [12], meeting), 0);
  assert.equal(logs[0][8], 'FAILED');
  assert.match(logs[0][9], /535/);
});
