const db = require('../config/database');

const columnExists = async (tableName, columnName) => {
  const [rows] = await db.execute(
    `SELECT TOP 1 1 AS found
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
};

const indexExists = async (tableName, indexName) => {
  const [rows] = await db.execute(
    `SELECT TOP 1 1 AS found
     FROM sys.indexes
     WHERE object_id = OBJECT_ID(?) AND name = ?`,
    [`dbo.${tableName}`, indexName]
  );
  return rows.length > 0;
};

const ensureTaskProductivitySchema = async () => {
  if (!(await columnExists('tasks', 'snoozed_until'))) {
    await db.query('ALTER TABLE dbo.tasks ADD snoozed_until DATETIME2 NULL');
  }

  if (!(await indexExists('tasks', 'idx_tasks_my_day'))) {
    await db.query(
      `CREATE INDEX idx_tasks_my_day
       ON dbo.tasks(assigned_to, status, due_date, snoozed_until)
       INCLUDE (team_id, priority, created_at)
       WHERE is_deleted = 0`
    );
  }
};

module.exports = { ensureTaskProductivitySchema };
