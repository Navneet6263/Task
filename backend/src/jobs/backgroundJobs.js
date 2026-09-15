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

// Cron: Email → Task inbox check every 2 minutes
cron.schedule('*/2 * * * *', () => {
  fetchEmailsAndCreateTasks().catch((e) => console.error('[CRON] email→task error:', e.message));
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
