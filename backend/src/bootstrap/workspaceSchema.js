const db = require('../config/database');
const { ensureRecurringSchema } = require('./recurringSchema');

// Additive migration only; existing task data is never rewritten.
const ensureWorkspaceSchema = async () => {
  await db.query(`
    IF COL_LENGTH('dbo.tasks', 'completed_at') IS NULL
      ALTER TABLE dbo.tasks ADD completed_at DATETIME2 NULL;
    IF COL_LENGTH('dbo.tasks', 'blocked_reason') IS NULL
      ALTER TABLE dbo.tasks ADD blocked_reason NVARCHAR(1000) NULL, waiting_on INT NULL,
        review_status VARCHAR(30) NOT NULL DEFAULT 'NONE', review_note NVARCHAR(1000) NULL;
    IF OBJECT_ID('dbo.task_reads', 'U') IS NULL
      CREATE TABLE dbo.task_reads (
        task_id INT NOT NULL, user_id INT NOT NULL, last_viewed_at DATETIME2 NOT NULL,
        CONSTRAINT pk_task_reads PRIMARY KEY (task_id, user_id));
    IF OBJECT_ID('dbo.task_checklist', 'U') IS NULL
      CREATE TABLE dbo.task_checklist (
        id INT IDENTITY PRIMARY KEY, task_id INT NOT NULL, title NVARCHAR(255) NOT NULL,
        is_done BIT NOT NULL DEFAULT 0, created_by INT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_checklist_task' AND object_id = OBJECT_ID('dbo.task_checklist'))
      CREATE INDEX idx_checklist_task ON dbo.task_checklist(task_id);
    IF OBJECT_ID('dbo.task_followers', 'U') IS NULL
      CREATE TABLE dbo.task_followers (
        task_id INT NOT NULL, user_id INT NOT NULL,
        CONSTRAINT pk_task_followers PRIMARY KEY (task_id, user_id));
  `);
  await db.query(`IF COL_LENGTH('dbo.task_reads', 'last_comment_id') IS NULL
    ALTER TABLE dbo.task_reads ADD last_comment_id INT NOT NULL DEFAULT 0;`);
  // Carry forward existing assignee read state when migrating to per-user receipts.
  await db.query(`INSERT INTO task_reads (task_id, user_id, last_viewed_at, last_comment_id)
    SELECT t.id, t.assigned_to, t.assignee_last_viewed_at, COALESCE(MAX(tc.id), 0)
    FROM tasks t LEFT JOIN task_comments tc ON tc.task_id = t.id AND tc.created_at <= t.assignee_last_viewed_at
    WHERE t.assigned_to IS NOT NULL AND t.assignee_last_viewed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM task_reads r WHERE r.task_id = t.id AND r.user_id = t.assigned_to)
    GROUP BY t.id, t.assigned_to, t.assignee_last_viewed_at;`);
  await ensureRecurringSchema();
  await require('./updatesSchema').ensureUpdatesSchema();
  await require('./timesheetSchema').ensureTimesheetSchema();
  await require('./calendarSchema').ensureCalendarSchema();
  await require('./communicationsSchema').ensureCommunicationsSchema();
  await require('./notesSchema').ensureNotesSchema();
  await require('./superAdminSchema').ensureSuperAdminSchema();
  await require('./taskFormSchema').ensureTaskFormSchema();
  await require('./clientsSchema').ensureClientsSchema();
  await require('./hrmsSchema').ensureHrmsSchema();
  await require('./emailInboxSchema').ensureEmailInboxSchema();
};

module.exports = { ensureWorkspaceSchema };
