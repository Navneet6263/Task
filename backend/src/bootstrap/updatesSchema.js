const db = require('../config/database');
const { ensureUserOrgAccessTable } = require('../utils/orgAccess');

// Private reports deliberately do not enter shared tasks, logs, notifications or broadcasts.
async function ensureUpdatesSchema() {
  await ensureUserOrgAccessTable(db);
  await db.query(`
    IF OBJECT_ID('dbo.workspace_updates', 'U') IS NULL
      CREATE TABLE dbo.workspace_updates (
        id INT IDENTITY PRIMARY KEY, org_id INT NULL,
        title NVARCHAR(160) NOT NULL, summary NVARCHAR(3000) NOT NULL,
        why_text NVARCHAR(3000) NOT NULL, how_text NVARCHAR(MAX) NOT NULL,
        performance_text NVARCHAR(3000) NOT NULL DEFAULT '',
        created_by INT NULL, version INT NOT NULL DEFAULT 1,
        published_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME());
    IF OBJECT_ID('dbo.workspace_update_reads', 'U') IS NULL
      CREATE TABLE dbo.workspace_update_reads (
        update_id INT NOT NULL, user_id INT NOT NULL, version INT NOT NULL,
        CONSTRAINT pk_workspace_update_reads PRIMARY KEY (update_id, user_id));
    IF OBJECT_ID('dbo.update_report_tasks', 'U') IS NULL
      CREATE TABLE dbo.update_report_tasks (
        id INT IDENTITY PRIMARY KEY, org_id INT NOT NULL,
        update_id INT NOT NULL REFERENCES dbo.workspace_updates(id),
        update_title NVARCHAR(160) NOT NULL, update_version INT NOT NULL,
        reported_by INT NOT NULL REFERENCES dbo.users(id),
        assigned_to INT NOT NULL REFERENCES dbo.users(id),
        request_key VARCHAR(80) NOT NULL, title NVARCHAR(160) NOT NULL,
        description NVARCHAR(MAX) NOT NULL, steps NVARCHAR(MAX) NOT NULL DEFAULT '',
        priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
        status VARCHAR(20) NOT NULL DEFAULT 'TODO', resolution_note NVARCHAR(3000) NOT NULL DEFAULT '',
        version INT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT uq_update_report_request UNIQUE (org_id, reported_by, request_key),
        CONSTRAINT ck_update_report_status CHECK (status IN ('TODO','IN_PROGRESS','PENDING','DONE')),
        CONSTRAINT ck_update_report_priority CHECK (priority IN ('LOW','MEDIUM','HIGH')));
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_workspace_updates_org' AND object_id = OBJECT_ID('dbo.workspace_updates'))
      CREATE INDEX idx_workspace_updates_org ON dbo.workspace_updates(org_id, id DESC);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_update_reports_assignee' AND object_id = OBJECT_ID('dbo.update_report_tasks'))
      CREATE INDEX idx_update_reports_assignee ON dbo.update_report_tasks(org_id, assigned_to, status, id DESC);
  `);
  await db.query(`IF COL_LENGTH('dbo.workspace_updates', 'source_key') IS NULL
    ALTER TABLE dbo.workspace_updates ADD source_key VARCHAR(80) NULL;`);
  await db.query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_workspace_update_source' AND object_id = OBJECT_ID('dbo.workspace_updates'))
    CREATE UNIQUE INDEX uq_workspace_update_source ON dbo.workspace_updates(source_key) WHERE source_key IS NOT NULL;`);
}
module.exports = { ensureUpdatesSchema };
