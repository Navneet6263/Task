const db = require('../config/database');
async function ensureRecurringSchema() {
  await db.query(`IF COL_LENGTH('dbo.tasks', 'repeat_interval') IS NULL
    ALTER TABLE dbo.tasks ADD repeat_interval VARCHAR(10) NULL, recurrence_parent_id INT NULL;`);
  await db.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_recurring_successor' AND object_id = OBJECT_ID('dbo.tasks'))
    CREATE UNIQUE INDEX uq_recurring_successor ON dbo.tasks(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;`);
}
module.exports = { ensureRecurringSchema };
