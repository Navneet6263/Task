const db = require('../config/database');

// Jira-style extras on tasks: a readable key, subtasks, coloured labels and links between tasks.
// Additive only: tasks without them look and behave exactly as before.
async function ensureTaskExtrasSchema() {
  await db.query(`IF COL_LENGTH('dbo.tasks', 'parent_task_id') IS NULL ALTER TABLE dbo.tasks ADD parent_task_id INT NULL;`);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_tasks_parent' AND object_id = OBJECT_ID('dbo.tasks'))
      CREATE INDEX ix_tasks_parent ON dbo.tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
  `);
  // Letters before a task number, e.g. ACC in ACC-142. Empty means "taken from the company code".
  await db.query(`IF COL_LENGTH('dbo.organizations', 'task_prefix') IS NULL ALTER TABLE dbo.organizations ADD task_prefix NVARCHAR(10) NULL;`);
  await db.query(`
    IF OBJECT_ID('dbo.task_labels', 'U') IS NULL
      CREATE TABLE dbo.task_labels (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(40) NOT NULL,
        color VARCHAR(20) NOT NULL,
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ux_task_labels_name UNIQUE (org_id, name));
  `);
  await db.query(`
    IF OBJECT_ID('dbo.task_label_links', 'U') IS NULL
      CREATE TABLE dbo.task_label_links (
        task_id INT NOT NULL REFERENCES dbo.tasks(id),
        label_id INT NOT NULL REFERENCES dbo.task_labels(id) ON DELETE CASCADE,
        CONSTRAINT pk_task_label_links PRIMARY KEY (task_id, label_id));
  `);
  await db.query(`
    IF OBJECT_ID('dbo.task_links', 'U') IS NULL
      CREATE TABLE dbo.task_links (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        from_task_id INT NOT NULL REFERENCES dbo.tasks(id),
        to_task_id INT NOT NULL REFERENCES dbo.tasks(id),
        link_type VARCHAR(20) NOT NULL,
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ux_task_links UNIQUE (from_task_id, to_task_id, link_type),
        CONSTRAINT ck_task_links_type CHECK (link_type IN ('blocks', 'relates', 'duplicates')),
        CONSTRAINT ck_task_links_other CHECK (from_task_id <> to_task_id));
  `);
}

module.exports = { ensureTaskExtrasSchema };
