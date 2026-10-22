const db = require('../config/database');

// Additive only. Every timesheet table carries org_id so data never crosses organizations,
// and nothing here alters the existing tasks tables.
async function ensureTimesheetSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.org_modules', 'U') IS NULL
      CREATE TABLE dbo.org_modules (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        module_key VARCHAR(40) NOT NULL,
        is_enabled BIT NOT NULL DEFAULT 0,
        updated_by NVARCHAR(255) NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_org_modules UNIQUE (org_id, module_key));
    IF OBJECT_ID('dbo.timesheet_settings', 'U') IS NULL
      CREATE TABLE dbo.timesheet_settings (
        org_id INT NOT NULL PRIMARY KEY REFERENCES dbo.organizations(id),
        lock_days INT NOT NULL DEFAULT 7,
        unlock_days INT NOT NULL DEFAULT 2,
        updated_by INT NULL REFERENCES dbo.users(id),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_timesheet_lock_days CHECK (lock_days BETWEEN 1 AND 365),
        CONSTRAINT ck_timesheet_unlock_days CHECK (unlock_days BETWEEN 1 AND 90));
    IF OBJECT_ID('dbo.timesheet_clients', 'U') IS NULL
      CREATE TABLE dbo.timesheet_clients (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(255) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_by INT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_timesheet_clients UNIQUE (org_id, name));
    IF OBJECT_ID('dbo.timesheet_options', 'U') IS NULL
      CREATE TABLE dbo.timesheet_options (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        option_group VARCHAR(40) NOT NULL,
        label NVARCHAR(120) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BIT NOT NULL DEFAULT 1,
        created_by INT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_timesheet_options UNIQUE (org_id, option_group, label),
        CONSTRAINT ck_timesheet_option_group CHECK (option_group IN ('job_type','work_type','period_type','registration_status','count_type')));
    IF OBJECT_ID('dbo.timesheet_entries', 'U') IS NULL
      CREATE TABLE dbo.timesheet_entries (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        client_id INT NOT NULL REFERENCES dbo.timesheet_clients(id),
        job_type NVARCHAR(120) NULL,
        work_type NVARCHAR(120) NULL,
        date_worked DATE NULL,
        agent_id INT NULL REFERENCES dbo.users(id),
        period_type NVARCHAR(120) NULL,
        period_ended DATE NULL,
        registration_status NVARCHAR(120) NULL,
        description NVARCHAR(2000) NULL,
        count_type NVARCHAR(120) NULL,
        count_number INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        submitted_on DATE NULL,
        unlocked_until DATE NULL,
        created_by INT NOT NULL REFERENCES dbo.users(id),
        updated_by INT NULL REFERENCES dbo.users(id),
        version INT NOT NULL DEFAULT 1,
        is_deleted BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_timesheet_entry_status CHECK (status IN ('DRAFT','SUBMITTED')),
        CONSTRAINT ck_timesheet_entry_count CHECK (count_number IS NULL OR count_number >= 0));
    IF OBJECT_ID('dbo.timesheet_time_logs', 'U') IS NULL
      CREATE TABLE dbo.timesheet_time_logs (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        entry_id INT NOT NULL REFERENCES dbo.timesheet_entries(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        work_date DATE NOT NULL,
        hours DECIMAL(5,2) NOT NULL,
        note NVARCHAR(500) NULL,
        created_by INT NOT NULL REFERENCES dbo.users(id),
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_by INT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_timesheet_log_hours CHECK (hours > 0 AND hours <= 24));
    IF OBJECT_ID('dbo.timesheet_unlock_requests', 'U') IS NULL
      CREATE TABLE dbo.timesheet_unlock_requests (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        entry_id INT NOT NULL REFERENCES dbo.timesheet_entries(id),
        requested_by INT NOT NULL REFERENCES dbo.users(id),
        reason NVARCHAR(1000) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        decided_by INT NULL REFERENCES dbo.users(id),
        decided_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_timesheet_unlock_status CHECK (status IN ('PENDING','APPROVED','REJECTED')));
    IF OBJECT_ID('dbo.timesheet_audit', 'U') IS NULL
      CREATE TABLE dbo.timesheet_audit (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL,
        entry_id INT NULL,
        user_id INT NULL,
        action VARCHAR(40) NOT NULL,
        detail NVARCHAR(2000) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  // Optional link to the task the work was done for (managers create the task, people log time against it).
  await db.query(`IF COL_LENGTH('dbo.timesheet_entries', 'task_id') IS NULL ALTER TABLE dbo.timesheet_entries ADD task_id INT NULL REFERENCES dbo.tasks(id);`);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_entries_task' AND object_id = OBJECT_ID('dbo.timesheet_entries'))
      CREATE INDEX idx_timesheet_entries_task ON dbo.timesheet_entries(org_id, task_id) WHERE task_id IS NOT NULL AND is_deleted = 0;
  `);
  // 'task' when the client was copied from a task's client name, NULL when someone added it here.
  await db.query(`IF COL_LENGTH('dbo.timesheet_clients', 'source') IS NULL ALTER TABLE dbo.timesheet_clients ADD source VARCHAR(10) NULL;`);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_entries_org_date' AND object_id = OBJECT_ID('dbo.timesheet_entries'))
      CREATE INDEX idx_timesheet_entries_org_date ON dbo.timesheet_entries(org_id, date_worked DESC, id DESC) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_entries_org_client' AND object_id = OBJECT_ID('dbo.timesheet_entries'))
      CREATE INDEX idx_timesheet_entries_org_client ON dbo.timesheet_entries(org_id, client_id) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_logs_entry' AND object_id = OBJECT_ID('dbo.timesheet_time_logs'))
      CREATE INDEX idx_timesheet_logs_entry ON dbo.timesheet_time_logs(entry_id) INCLUDE (user_id, hours) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_logs_org_date' AND object_id = OBJECT_ID('dbo.timesheet_time_logs'))
      CREATE INDEX idx_timesheet_logs_org_date ON dbo.timesheet_time_logs(org_id, work_date) INCLUDE (entry_id, user_id, hours) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_logs_user_date' AND object_id = OBJECT_ID('dbo.timesheet_time_logs'))
      CREATE INDEX idx_timesheet_logs_user_date ON dbo.timesheet_time_logs(org_id, user_id, work_date) INCLUDE (hours) WHERE is_deleted = 0;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_timesheet_pending_unlock' AND object_id = OBJECT_ID('dbo.timesheet_unlock_requests'))
      CREATE UNIQUE INDEX uq_timesheet_pending_unlock ON dbo.timesheet_unlock_requests(entry_id) WHERE status = 'PENDING';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_unlock_org' AND object_id = OBJECT_ID('dbo.timesheet_unlock_requests'))
      CREATE INDEX idx_timesheet_unlock_org ON dbo.timesheet_unlock_requests(org_id, status, id DESC);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_timesheet_audit_entry' AND object_id = OBJECT_ID('dbo.timesheet_audit'))
      CREATE INDEX idx_timesheet_audit_entry ON dbo.timesheet_audit(org_id, entry_id, id DESC);
  `);
}

module.exports = { ensureTimesheetSchema };
