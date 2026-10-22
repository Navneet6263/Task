const db = require('../config/database');
const { localNow, reminderLabel } = require('./calendarRules');
const { notifyUsers } = require('../routes/calendarSupport');

// Claims due reminders atomically (safe with several server instances), then notifies the
// organizer and every attendee who has not declined. Reminders older than 30 minutes past
// the start are skipped, so a server that was down does not send a burst of stale alerts.
async function sendDueReminders(now = new Date()) {
  const nowText = localNow(now);
  const [result] = await db.execute(
    `UPDATE calendar_events SET reminder_sent_at = SYSDATETIME()
     OUTPUT INSERTED.id, INSERTED.title, INSERTED.created_by, INSERTED.reminder_minutes, INSERTED.all_day,
       CONVERT(VARCHAR(16), INSERTED.start_at, 126) AS start_at
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
    await notifyUsers(
      [event.created_by, ...attendees.map((row) => row.user_id)],
      'calendar_reminder',
      `Reminder: "${event.title}" starts ${reminderLabel(event.reminder_minutes)} (${time})`,
      { event_id: event.id }
    );
  }
  return events.length;
}

module.exports = { sendDueReminders };
