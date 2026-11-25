const db = require('../config/database');
const { localNow, reminderLabel } = require('./calendarRules');
const { notifyUsers } = require('../routes/calendarSupport');
// Through the module so tests can stand in for the mail server.
const inviteMail = require('./inviteMail');
const appUrl = () => String(process.env.APP_FRONTEND_URL || process.env.FRONTEND_URL || 'https://task.greencall.in').replace(/\/+$/, '');

// Claims due reminders atomically (safe with several server instances), then notifies the
// organizer and every attendee who has not declined. Reminders older than 30 minutes past
// the start are skipped, so a server that was down does not send a burst of stale alerts.
async function sendDueReminders(now = new Date()) {
  const nowText = localNow(now);
  const [result] = await db.execute(
    `UPDATE calendar_events SET reminder_sent_at = SYSDATETIME()
     OUTPUT INSERTED.id, INSERTED.title, INSERTED.created_by, INSERTED.reminder_minutes, INSERTED.all_day, INSERTED.task_id, INSERTED.event_type, INSERTED.org_id, INSERTED.version,
       CONVERT(VARCHAR(16), INSERTED.start_at, 126) AS start_at, CONVERT(VARCHAR(16), INSERTED.end_at, 126) AS end_at
     WHERE is_deleted = 0 AND reminder_minutes IS NOT NULL AND reminder_sent_at IS NULL
       AND DATEADD(MINUTE, -reminder_minutes, start_at) <= ?
       AND start_at >= DATEADD(MINUTE, -30, CAST(? AS DATETIME2))`,
    [nowText, nowText]
  );
  const events = result.rows || [];
  for (const event of events) {
    const [attendees] = await db.execute(
      "SELECT user_id FROM calendar_event_attendees WHERE event_id = ? AND response <> 'DECLINED'",
      [event.id]
    );
    const time = event.all_day === true || event.all_day === 1 ? 'today' : `at ${event.start_at.slice(11, 16)}`;
    // A reminder set for its own time (e.g. from a task's "Set reminder") just says what it is about.
    const onTime = event.event_type === 'REMINDER' && Number(event.reminder_minutes) === 0;
    await notifyUsers(
      [event.created_by, ...attendees.map((row) => row.user_id)],
      'calendar_reminder',
      onTime ? `Reminder: "${event.title}"` : `Reminder: "${event.title}" starts ${reminderLabel(event.reminder_minutes)} (${time})`,
      { event_id: event.id, task_id: event.task_id || null }
    );
    // A Reminder also comes by email (meetings and events already went to people's own calendars with the invite).
    if (event.event_type === 'REMINDER') {
      const [[task]] = event.task_id ? await db.execute('SELECT title FROM tasks WHERE id = ? AND is_deleted = 0', [event.task_id]) : [[null]];
      // Not awaited: a slow mail server must not hold up the other reminders.
      inviteMail.emailCalendar(event.org_id, null, [event.created_by, ...attendees.map((row) => row.user_id)],
        { ...event, task_title: task?.title || null }, { kind: 'reminder', appUrl: appUrl() })
        .catch((error) => console.error('[calendar] reminder email failed', error.message));
    }
  }
  return events.length;
}

module.exports = { sendDueReminders };
