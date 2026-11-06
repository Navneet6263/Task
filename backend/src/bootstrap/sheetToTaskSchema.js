const db = require('../config/database');

// "Sheet to task": a person links a live sheet, and its new rows become their tasks. Additive only.
async function ensureSheetToTaskSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.task_sheet_links', 'U') IS NULL
      CREATE TABLE dbo.task_sheet_links (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        team_id INT NOT NULL REFERENCES dbo.teams(id),
        name NVARCHAR(150) NOT NULL,
        source_url NVARCHAR(1000) NOT NULL,
        mapping NVARCHAR(MAX) NOT NULL,
        required_fields NVARCHAR(500) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        last_synced_at DATETIME2 NULL,
        last_result NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  // Rows already turned into tasks (or skipped on purpose), so a row never makes a second task.
  await db.query(`
    IF OBJECT_ID('dbo.task_sheet_rows', 'U') IS NULL
      CREATE TABLE dbo.task_sheet_rows (
        id INT IDENTITY(1,1) PRIMARY KEY,
        link_id INT NOT NULL REFERENCES dbo.task_sheet_links(id) ON DELETE CASCADE,
        row_number INT NOT NULL,
        row_hash VARCHAR(64) NOT NULL,
        task_id INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_task_sheet_rows_link' AND object_id = OBJECT_ID('dbo.task_sheet_rows'))
      CREATE INDEX ix_task_sheet_rows_link ON dbo.task_sheet_rows(link_id, row_hash);
  `);
}

module.exports = { ensureSheetToTaskSchema };
