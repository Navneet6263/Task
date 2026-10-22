const db = require('../config/database');

// Customisable task forms: one layout per organization, custom field values stored on the task,
// and per-person time logs ("who spent how long"). Additive only.
async function ensureTaskFormSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.task_form_layouts', 'U') IS NULL
      CREATE TABLE dbo.task_form_layouts (
        org_id INT NOT NULL PRIMARY KEY REFERENCES dbo.organizations(id),
        template VARCHAR(30) NOT NULL DEFAULT 'standard',
        definition NVARCHAR(MAX) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        updated_by INT NULL REFERENCES dbo.users(id),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_task_form_layouts_json CHECK (ISJSON(definition) = 1));
  `);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'custom_fields') IS NULL ALTER TABLE dbo.tasks ADD custom_fields NVARCHAR(MAX) NULL;`);
  await db.query(`
    IF OBJECT_ID('dbo.task_time_logs', 'U') IS NULL
      CREATE TABLE dbo.task_time_logs (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        task_id INT NOT NULL REFERENCES dbo.tasks(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        hours DECIMAL(5,2) NOT NULL,
        work_date DATE NOT NULL,
        note NVARCHAR(500) NULL,
        created_by INT NULL REFERENCES dbo.users(id),
        is_deleted BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_task_time_logs_hours CHECK (hours > 0 AND hours <= 24));
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_task_time_logs_task' AND object_id = OBJECT_ID('dbo.task_time_logs'))
      CREATE INDEX idx_task_time_logs_task ON dbo.task_time_logs(task_id) INCLUDE (user_id, hours) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_task_time_logs_org_date' AND object_id = OBJECT_ID('dbo.task_time_logs'))
      CREATE INDEX idx_task_time_logs_org_date ON dbo.task_time_logs(org_id, work_date) INCLUDE (task_id, user_id, hours) WHERE is_deleted = 0;
  `);
}

module.exports = { ensureTaskFormSchema };
