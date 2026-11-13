const db = require('../config/database');
// Used through the modules (not destructured) so tests can stand in for the mail server.
const mailer = require('../utils/mailer');
const modules = require('./orgModules');

// Calendar invites by email. Only for organizations that have the Communications module on; everyone
// else still gets the in-app notification. A failed email never fails the meeting itself.
// The email carries an .ics file, so Outlook or Gmail can put the meeting in the person's own calendar.

const PLACEHOLDER = /@no-email\.invalid$/i;
const icsText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// "2026-11-14T10:30" → "20261114T103000" (local time, as typed in GreenTask).
const icsTime = (value) => `${String(value).slice(0, 16).replace(/[-:]/g, '')}00`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

function buildIcs({ eventId, title, description, location, start, end, allDay, organizer, attendees, host }) {
  const dateOnly = (v) => String(v).slice(0, 10).replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GreenTask//Calendar//EN', 'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:greentask-event-${eventId}@${host || 'greentask'}`, `DTSTAMP:${stamp()}`,
    ...(allDay ? [`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(end)}`] : [`DTSTART:${icsTime(start)}`, `DTEND:${icsTime(end)}`]),
    `SUMMARY:${icsText(title)}`,
    ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
    ...(location ? [`LOCATION:${icsText(location)}`] : []),
    ...(organizer?.email ? [`ORGANIZER;CN=${icsText(organizer.name)}:mailto:${organizer.email}`] : []),
    ...attendees.map((a) => `ATTENDEE;CN=${icsText(a.name)};RSVP=TRUE:mailto:${a.email}`),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// "Saturday 14 November 2026", the same on every server (no locale data needed).
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const readable = (event) => {
  const d = new Date(`${String(event.start_at).slice(0, 10)}T00:00:00Z`);
  const day = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return event.all_day ? `${day} (all day)` : `${day}, ${String(event.start_at).slice(11, 16)} to ${String(event.end_at).slice(11, 16)}`;
};

// event: { id, title, description, location, start_at, end_at, all_day, event_type }. Returns how many were emailed.
async function emailInvites(orgId, organizerId, userIds, event, { appUrl } = {}) {
  if (!userIds.length || !(await modules.isModuleEnabled(orgId, 'communications'))) return 0;
  const ids = [...new Set(userIds.map(Number))];
  const [people] = await db.execute(
    `SELECT id, name, email FROM users WHERE org_id = ? AND is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')})`, [orgId, ...ids]);
  const to = people.filter((p) => p.email && !PLACEHOLDER.test(p.email));
  if (!to.length) return 0;
  const [[organizer]] = await db.execute('SELECT name, email FROM users WHERE id = ?', [organizerId]);
  const kind = event.event_type === 'MEETING' ? 'meeting' : 'event';
  const when = readable(event);
  const ics = buildIcs({
    eventId: event.id, title: event.title, description: event.description, location: event.location, start: event.start_at, end: event.end_at,
    allDay: event.all_day, organizer, attendees: to, host: appUrl ? new URL(appUrl).host : '',
  });
  const subject = `${organizer?.name || 'A colleague'} has scheduled a ${kind} with you: ${event.title}`.slice(0, 200);
  let sent = 0;
  const transporter = mailer.createTransporter('task');
  for (const person of to) {
    const body = [
      `Hi ${String(person.name || '').split(' ')[0] || 'there'},`, '',
      `${organizer?.name || 'A colleague'} has scheduled a ${kind} with you.`, '',
      `What: ${event.title}`, `When: ${when}`,
      ...(event.location ? [`Where: ${event.location}`] : []),
      ...(event.description ? ['', event.description] : []), '',
      'It is already in your GreenTask calendar. Open the attached invite to add it to your own calendar as well.',
      ...(appUrl ? ['', `${appUrl}/calendar`] : []),
    ].join('\n');
    let status = 'SENT';
    let error = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      await transporter.sendMail({
        from: process.env.FROM_EMAIL || process.env.SMTP_USER, to: person.email, subject, text: body,
        icalEvent: { method: 'REQUEST', filename: 'invite.ics', content: ics },
      });
      sent += 1;
    } catch (sendError) {
      status = 'FAILED';
      error = String(sendError.message || 'Send failed').slice(0, 500);
      console.error('[calendar] invite email failed', error);
    }
    // Shows in Communications → Sent history like any other email.
    // eslint-disable-next-line no-await-in-loop
    await db.execute(
      'INSERT INTO communication_logs (org_id, sent_by, to_list, cc_list, subject, body, task_id, template_name, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [orgId, organizerId, person.email, null, subject, body, null, 'Calendar invite', status, error]
    ).catch((logError) => console.error('[calendar] invite log failed', logError.message));
  }
  return sent;
}

module.exports = { emailInvites, buildIcs };
