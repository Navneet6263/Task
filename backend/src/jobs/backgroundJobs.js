const cron = require('node-cron');
const db = require('../config/database');
const ws = require('../websocket');
const { fetchEmailsAndCreateTasks } = require('../utils/emailToTask');
const { createRecurringSuccessors } = require('../services/recurringTasks');
function startBackgroundJobs() {
// Cron: overdue alert every hour
cron.schedule('0 * * * *', async () => {
  try {
    const [overdue] = await db.execute(
      `SELECT t.id, t.title, t.team_id, t.assigned_to
       FROM tasks t
       WHERE t.due_date < CAST(GETDATE() AS DATE) AND t.status != 'DONE' AND t.is_deleted = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM audit_logs al
           WHERE al.task_id = t.id AND al.activity = 'Overdue Alert'
             AND al.created_at > DATEADD(HOUR, -24, GETDATE())
         )`
    );
    for (const task of overdue) {
      await db.execute(
        'INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [task.assigned_to, task.team_id, task.id, 'Overdue Alert', task.title, `Task overdue: ${task.title}`, 'System (AI)']
      );
      await db.execute(
        'INSERT INTO notifications (user_id, type, message, task_id) VALUES (?, ?, ?, ?)',
        [task.assigned_to, 'overdue', `Task overdue: ${task.title}`, task.id]
      );

      ws.broadcast(task.team_id, 'overdue_alert', { taskId: task.id, title: task.title });
    }
    if (overdue.length) console.log(`[CRON] ${overdue.length} overdue alerts sent`);
  } catch (e) { console.error('[CRON] overdue error:', e.message); }
});

// Cron: Email → Task inbox check every 2 minutes (only organizations with the module on)
let readingInboxes = false;
cron.schedule('*/2 * * * *', async () => {
  if (readingInboxes) return;
  readingInboxes = true;
  try { await fetchEmailsAndCreateTasks(); }
  catch (e) { console.error('[CRON] email→task error:', e.message); }
  finally { readingInboxes = false; }
});


  if (process.env.ENABLE_CALENDAR_REMINDERS !== 'false') {
    const { sendDueReminders } = require('../services/calendarReminders');
    let sending = false;
    cron.schedule('* * * * *', async () => {
      if (sending) return;
      sending = true;
      try { await sendDueReminders(); }
      catch (error) { console.error('[CRON] calendar reminders failed:', error.message); }
      finally { sending = false; }
    });
  }

  // "Sheet to task": read every linked sheet at the end of the working day, India time.
  cron.schedule('0 19 * * *', () => {
    require('../services/sheetToTask').syncAllSheets()
      .then((r) => console.log(`[CRON] sheet to task: ${r.created} task(s) from ${r.links} sheet(s)`))
      .catch((error) => console.error('[CRON] sheet to task failed:', error.message));
  }, { timezone: 'Asia/Kolkata' });

  // Developer API: webhook messages that are due (new ones and retries), every minute.
  let sendingHooks = false;
  cron.schedule('* * * * *', async () => {
    if (sendingHooks) return;
    sendingHooks = true;
    try { await require('../services/webhooks').processQueue(); }
    catch (error) { console.error('[CRON] webhook queue failed:', error.message); }
    finally { sendingHooks = false; }
  });

  // Developer API: keep 30 days of logs, deliveries and finished queue rows; a day of rate counters.
  cron.schedule('30 3 * * *', () => {
    const db = require('../config/database');
    db.execute('DELETE FROM api_request_logs WHERE created_at < DATEADD(DAY, -30, SYSDATETIME())')
      .then(() => db.execute('DELETE FROM webhook_deliveries WHERE created_at < DATEADD(DAY, -30, SYSDATETIME())'))
      .then(() => db.execute("DELETE FROM webhook_queue WHERE status IN ('sent', 'failed', 'dropped') AND created_at < DATEADD(DAY, -30, SYSDATETIME())"))
      .then(() => db.execute('DELETE FROM inbound_hook_events WHERE created_at < DATEADD(DAY, -30, SYSDATETIME())'))
      .then(() => db.execute('DELETE FROM api_rate_windows WHERE minute < ?', [Math.floor(Date.now() / 60000) - 1440]))
      .catch((error) => console.error('[CRON] developer log cleanup failed:', error.message));
  }, { timezone: 'Asia/Kolkata' });

  // "Show all tasks": keep new people and new teams in step every 10 minutes.
  cron.schedule('*/10 * * * *', () => {
    require('../services/employeeAccounts').syncAllTasksEverywhere()
      .catch((error) => console.error('[CRON] all-tasks sync failed:', error.message))
      .then(() => require('../services/teamSharing').syncTeamSharesEverywhere())
      .catch((error) => console.error('[CRON] team sharing sync failed:', error.message));
  });

  if (process.env.ENABLE_RECURRING_TASKS === 'true') {
    let running = false;
    cron.schedule('* * * * *', async () => {
      if (running) return;
      running = true;
      try { await createRecurringSuccessors(); }
      catch (error) { console.error('Recurring task worker failed:', error.message); }
      finally { running = false; }
    });
  }
}
module.exports = { startBackgroundJobs };
