const db = require('../config/database');
// Used through the modules (not destructured) so tests can stand in for the mail server.
const mailer = require('../utils/mailer');
const { memberClause } = require('../utils/orgMember');

// Calendar emails, for every workspace (sent with the platform mail account, SMTP_*):
//   invite   someone puts you in a meeting, event or reminder (with an .ics file for Outlook / Gmail)
//   update   its time changed (same .ics, higher SEQUENCE, so your own calendar moves it)
//   cancel   it was deleted or you were taken off it
//   reminder a Reminder is due (to the organizer and everyone on it who has not declined)
// The in-app notification always goes as well. A failed email never fails the calendar change itself.

const PLACEHOLDER = /@no-email\.invalid$/i;
const icsText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const parts = (value) => {
  const [date, time = '00:00'] = String(value).slice(0, 16).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return { y, m, d, hh, mm };
};
// Calendar times are wall-clock times in the app timezone (DB_TIMEZONE, which config/database.js also sets
// as the process timezone). In the .ics they go as UTC ("Z"), so every mail app shows the right local time.
const icsUtc = (value) => {
  const { y, m, d, hh, mm } = parts(value);
  return new Date(y, m - 1, d, hh, mm).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
};
const icsDate = (value, plusDays = 0) => {
  const { y, m, d } = parts(value);
  const date = new Date(Date.UTC(y, m - 1, d + plusDays));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
};

function buildIcs({ eventId, title, description, location, start, end, allDay, organizer, attendees, host, method = 'REQUEST', sequence = 0 }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GreenTask//Calendar//EN', `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:greentask-event-${eventId}@${host || 'greentask'}`, `DTSTAMP:${stamp()}`, `SEQUENCE:${Number(sequence) || 0}`,
    // An all-day end in iCalendar is the day after the last day.
    ...(allDay ? [`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(end, 1)}`] : [`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`]),
    `SUMMARY:${icsText(title)}`,
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    ...(location ? [`LOCATION:${icsText(location)}`] : []),
    ...(method === 'CANCEL' ? ['STATUS:CANCELLED'] : []),
    ...(organizer?.email ? [`ORGANIZER;CN=${icsText(organizer.name)}:mailto:${organizer.email}`] : []),
    ...attendees.map((a) => `ATTENDEE;CN=${icsText(a.name)};RSVP=TRUE:mailto:${a.email}`),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// "Saturday 14 November 2026, 10:30 to 11:00 (India time)", the same on every server (no locale data needed).
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayText = (value) => {
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const zoneText = () => {
  const zone = process.env.DB_TIMEZONE || 'Asia/Kolkata';
  return zone === 'Asia/Kolkata' ? 'India time' : zone;
};
function readable(event) {
  const start = String(event.start_at);
  const end = String(event.end_at || event.start_at);
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  if (event.all_day) return sameDay ? `${dayText(start)} (all day)` : `${dayText(start)} to ${dayText(end)} (all day)`;
  if (event.event_type === 'REMINDER' && start === end) return `${dayText(start)}, ${start.slice(11, 16)} (${zoneText()})`;
  return sameDay
    ? `${dayText(start)}, ${start.slice(11, 16)} to ${end.slice(11, 16)} (${zoneText()})`
    : `${dayText(start)}, ${start.slice(11, 16)} to ${dayText(end)}, ${end.slice(11, 16)} (${zoneText()})`;
}

const KIND_WORD = { MEETING: 'meeting', REMINDER: 'reminder', EVENT: 'event' };
const LOG_NAME = { invite: 'Calendar invite', update: 'Calendar update', cancel: 'Calendar cancelled', reminder: 'Reminder' };

function wording(kind, event, actor, when) {
  const what = KIND_WORD[event.event_type] || 'event';
  const who = actor?.name || 'A colleague';
  if (kind === 'reminder') {
    return { subject: `Reminder: ${event.title}`, lead: `This is your reminder for "${event.title}".` };
  }
  if (kind === 'update') return { subject: `Updated: ${event.title}, now ${when}`, lead: `${who} changed the time of this ${what}.` };
  if (kind === 'cancel') return { subject: `Cancelled: ${event.title}`, lead: `${who} cancelled this ${what}, or took you off it.` };
  if (event.event_type === 'REMINDER') return { subject: `${who} set a reminder for you: ${event.title}`, lead: `${who} set a reminder for you.` };
  if (event.event_type === 'MEETING') return { subject: `${who} has scheduled a meeting with you: ${event.title}`, lead: `${who} has scheduled a meeting with you.` };
  return { subject: `${who} added you to an event: ${event.title}`, lead: `${who} added you to an event.` };
}

// event: { id, title, description, location, start_at, end_at, all_day, event_type, task_id, version }.
// Returns how many emails went out.
async function emailCalendar(orgId, actorId, userIds, event, { kind = 'invite', appUrl } = {}) {
  const ids = [...new Set((userIds || []).map(Number).filter((id) => id > 0))];
  if (!ids.length) return 0;
  const [people] = await db.execute(
    `SELECT u.id, u.name, u.email FROM users u WHERE u.is_deleted = 0 AND u.id IN (${ids.map(() => '?').join(',')}) AND ${memberClause}`,
    [...ids, orgId, orgId]);
  const to = people.filter((p) => p.email && !PLACEHOLDER.test(p.email));
  if (!to.length) return 0;
  const [[actor]] = actorId ? await db.execute('SELECT name, email FROM users WHERE id = ?', [actorId]) : [[null]];
  const when = readable(event);
  const { subject, lead } = wording(kind, event, actor, when);
  const ics = kind === 'reminder' ? null : buildIcs({
    eventId: event.id, title: event.title, description: event.description, location: event.location, start: event.start_at, end: event.end_at,
    allDay: event.all_day, organizer: actor, attendees: to, host: appUrl ? new URL(appUrl).host : '',
    method: kind === 'cancel' ? 'CANCEL' : 'REQUEST', sequence: event.version || 0,
  });
  const link = appUrl ? `${appUrl}${event.task_id ? `/dashboard?task=${event.task_id}` : '/calendar'}` : '';
  let sent = 0;
  const transporter = mailer.createTransporter('task');
  for (const person of to) {
    const body = [
      `Hi ${String(person.name || '').split(' ')[0] || 'there'},`, '',
      lead, '',
      `What: ${event.title}`, `When: ${when}`,
      ...(event.location ? [`Where: ${event.location}`] : []),
      ...(event.task_title ? [`Task: ${event.task_title}`] : []),
      ...(event.description ? ['', event.description] : []), '',
      kind === 'cancel' ? 'It has been taken off your GreenTask calendar.'
        : kind === 'reminder' ? (event.task_id ? 'Open the task:' : 'Open your calendar:')
          : 'It is in your GreenTask calendar. Open the attached invite to add it to your own calendar as well.',
      ...(link ? ['', link] : []),
    ].join('\n');
    let status = 'SENT';
    let error = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      await transporter.sendMail({
        from: process.env.FROM_EMAIL || process.env.SMTP_USER, to: person.email, subject: subject.slice(0, 200), text: body,
        ...(ics ? { icalEvent: { method: kind === 'cancel' ? 'CANCEL' : 'REQUEST', filename: 'invite.ics', content: ics } } : {}),
      });
      sent += 1;
    } catch (sendError) {
      status = 'FAILED';
      error = String(sendError.message || 'Send failed').slice(0, 500);
      console.error('[calendar] email failed', error);
    }
    // Shows in Communications → Sent history like any other email (for workspaces that use it).
    // eslint-disable-next-line no-await-in-loop
    await db.execute(
      'INSERT INTO communication_logs (org_id, sent_by, to_list, cc_list, subject, body, task_id, template_name, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [orgId, actorId || null, person.email, null, subject.slice(0, 200), body, event.task_id || null, LOG_NAME[kind], status, error]
    ).catch((logError) => console.error('[calendar] email log failed', logError.message));
  }
  return sent;
}

const emailInvites = (orgId, organizerId, userIds, event, options = {}) => emailCalendar(orgId, organizerId, userIds, event, { ...options, kind: 'invite' });

module.exports = { emailCalendar, emailInvites, buildIcs, readable };
