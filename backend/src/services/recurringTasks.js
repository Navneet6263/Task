const db = require('../config/database');

const nextDueDate = (value, cadence) => {
  const source = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(source.getTime()) || !['DAILY', 'WEEKLY', 'MONTHLY'].includes(cadence)) throw new Error('Invalid recurrence');
  if (cadence === 'MONTHLY') {
    const day = source.getUTCDate(); source.setUTCDate(1); source.setUTCMonth(source.getUTCMonth() + 1);
    const last = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
    source.setUTCDate(Math.min(day, last));
  } else source.setUTCDate(source.getUTCDate() + (cadence === 'DAILY' ? 1 : 7));
  return source.toISOString().slice(0, 10);
};

// One successor per completed task, enforced by a unique index even with multiple workers.
async function createRecurringSuccessors() {
  const [rows] = await db.execute(`SELECT TOP 50 t.id, t.due_date, t.repeat_interval
    FROM tasks t JOIN teams te ON te.id = t.team_id AND te.is_deleted = FALSE
    WHERE t.status = 'DONE' AND t.is_deleted = FALSE AND t.repeat_interval IS NOT NULL AND t.due_date IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tasks child WHERE child.recurrence_parent_id = t.id)
    ORDER BY t.id`);
  let created = 0;
  for (const row of rows) {
    const originalDue = row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : String(row.due_date).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const due = nextDueDate(originalDue < today ? today : originalDue, row.repeat_interval);
    const [result] = await db.execute(`INSERT IGNORE INTO tasks
      (title, description, team_id, org_id, assigned_by, assigned_to, priority, status, issue_type,
       task_type, product, category, client_name, due_date, assigned_date, repeat_interval, recurrence_parent_id)
      SELECT t.title, t.description, t.team_id, t.org_id, t.assigned_by,
        CASE WHEN EXISTS (SELECT 1 FROM team_members a JOIN users u ON u.id = a.user_id AND u.is_deleted = FALSE WHERE a.team_id = t.team_id AND a.user_id = t.assigned_to) THEN t.assigned_to ELSE NULL END,
        t.priority, 'TODO', t.issue_type, t.task_type, t.product, t.category, t.client_name, ?, CAST(GETDATE() AS DATE), t.repeat_interval, t.id
      FROM tasks t JOIN users creator ON creator.id = t.assigned_by AND creator.is_deleted = FALSE
      JOIN teams te ON te.id = t.team_id AND te.is_deleted = FALSE
      WHERE t.id = ? AND t.status = 'DONE' AND t.is_deleted = FALSE AND t.repeat_interval = ?
        AND (creator.role = 'admin' AND creator.org_id = t.org_id OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.team_id AND m.user_id = creator.id))
        AND NOT EXISTS (SELECT 1 FROM tasks child WHERE child.recurrence_parent_id = t.id)`, [due, row.id, row.repeat_interval]);
    if (result.affectedRows > 0) created += 1;
  }
  return created;
}
module.exports = { nextDueDate, createRecurringSuccessors };
