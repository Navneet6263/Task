const db = require('../config/database');

// Additive only: a sent-email log for accountability and organization-wide templates.
async function ensureCommunicationsSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.communication_logs', 'U') IS NULL
      CREATE TABLE dbo.communication_logs (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        sent_by INT NOT NULL REFERENCES dbo.users(id),
        to_list NVARCHAR(2000) NOT NULL,
        cc_list NVARCHAR(2000) NULL,
        subject NVARCHAR(200) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        task_id INT NULL,
        template_name NVARCHAR(120) NULL,
        status VARCHAR(10) NOT NULL,
        error NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_communication_status CHECK (status IN ('SENT','FAILED')));
    IF OBJECT_ID('dbo.communication_templates', 'U') IS NULL
      CREATE TABLE dbo.communication_templates (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(120) NOT NULL,
        subject NVARCHAR(200) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        created_by INT NOT NULL REFERENCES dbo.users(id),
        is_deleted BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_communication_logs_org' AND object_id = OBJECT_ID('dbo.communication_logs'))
      CREATE INDEX idx_communication_logs_org ON dbo.communication_logs(org_id, created_at DESC) INCLUDE (sent_by, status);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_communication_templates_name' AND object_id = OBJECT_ID('dbo.communication_templates'))
      CREATE UNIQUE INDEX uq_communication_templates_name ON dbo.communication_templates(org_id, name) WHERE is_deleted = 0;
  `);
}

module.exports = { ensureCommunicationsSchema };
