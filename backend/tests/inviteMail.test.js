const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/database');
const mailer = require('../src/utils/mailer');
const modules = require('../src/services/orgModules');
const { emailInvites, buildIcs } = require('../src/services/inviteMail');

const meeting = { id: 41, title: 'Payroll review', description: 'Bring the October sheet', location: 'Teams call', start_at: '2026-11-14T10:30', end_at: '2026-11-14T11:00', all_day: false, event_type: 'MEETING' };

test('the invite file puts the meeting in Outlook or Gmail at the time it was set', () => {
  const ics = buildIcs({ eventId: 41, title: 'Review; Q4, payroll', start: '2026-11-14T10:30', end: '2026-11-14T11:00', organizer: { name: 'Navneet', email: 'n@x.com' }, attendees: [{ name: 'Ashish', email: 'a@x.com' }], host: 'task.greencall.online' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:greentask-event-41@task\.greencall\.online/);
  assert.match(ics, /DTSTART:20261114T103000\r\nDTEND:20261114T110000/);
  assert.ok(ics.includes('SUMMARY:Review\\; Q4\\, payroll'), 'commas and semicolons are escaped');
  assert.match(ics, /ATTENDEE;CN=Ashish;RSVP=TRUE:mailto:a@x\.com/);
});

test('invite emails go only when the workspace has Communications on, never to placeholder addresses, and are logged', async (t) => {
  let on = true;
  const sent = [];
  const logs = [];
  t.mock.method(modules, 'isModuleEnabled', async (orgId, key) => { assert.deepEqual([orgId, key], [8, 'communications']); return on; });
  t.mock.method(mailer, 'createTransporter', () => ({ sendMail: async (mail) => { sent.push(mail); return { messageId: 'm1' }; } }));
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, name, email FROM users WHERE org_id = ?')) {
      assert.equal(params[0], 8, 'only people of the same workspace');
      return [[{ id: 12, name: 'Ashish Kumar', email: 'ashish@x.com' }, { id: 13, name: 'Code Only', email: 'act13.8@no-email.invalid' }]];
    }
    if (sql.startsWith('SELECT name, email FROM users WHERE id = ?')) return [[{ name: 'Navneet Kumar', email: 'navneet@x.com' }]];
    if (sql.startsWith('INSERT INTO communication_logs')) { logs.push(params); return [{}]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const count = await emailInvites(8, 3, [12, 13, 12], meeting, { appUrl: 'https://task.greencall.online' });
  assert.equal(count, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ashish@x.com');
  assert.equal(sent[0].subject, 'Navneet Kumar has scheduled a meeting with you: Payroll review');
  assert.match(sent[0].text, /^Hi Ashish,/);
  assert.match(sent[0].text, /When: Saturday 14 November 2026, 10:30 to 11:00/);
  assert.match(sent[0].text, /https:\/\/task\.greencall\.online\/calendar/);
  assert.equal(sent[0].icalEvent.method, 'REQUEST');
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0][0], logs[0][1], logs[0][2], logs[0][7], logs[0][8]], [8, 3, 'ashish@x.com', 'Calendar invite', 'SENT']);
  // Communications off: nobody is emailed (they still get the in-app notification from the calendar).
  on = false;
  assert.equal(await emailInvites(8, 3, [12], meeting), 0);
  assert.equal(sent.length, 1);
});

test('a mail server error is logged as failed and does not throw', async (t) => {
  const logs = [];
  t.mock.method(modules, 'isModuleEnabled', async () => true);
  t.mock.method(mailer, 'createTransporter', () => ({ sendMail: async () => { throw new Error('535 Authentication unsuccessful'); } }));
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, name, email FROM users WHERE org_id = ?')) return [[{ id: 12, name: 'Ashish', email: 'ashish@x.com' }]];
    if (sql.startsWith('SELECT name, email FROM users WHERE id = ?')) return [[{ name: 'Navneet', email: 'n@x.com' }]];
    if (sql.startsWith('INSERT INTO communication_logs')) { logs.push(params); return [{}]; }
    return [[]];
  });
  assert.equal(await emailInvites(8, 3, [12], meeting), 0);
  assert.equal(logs[0][8], 'FAILED');
  assert.match(logs[0][9], /535/);
});
