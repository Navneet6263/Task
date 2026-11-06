const db = require('../config/database');

// Developer API: company API keys, their request log, outgoing webhooks, and the other system's id
// on a task so the same record is never created twice. Additive only.
async function ensureDeveloperSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.api_keys', 'U') IS NULL
      CREATE TABLE dbo.api_keys (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(100) NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        key_hash CHAR(64) NOT NULL,
        scopes VARCHAR(200) NOT NULL,
        allowed_ips NVARCHAR(500) NULL,
        created_by INT NOT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        expires_at DATETIME2 NULL,
        last_used_at DATETIME2 NULL,
        last_used_ip VARCHAR(64) NULL,
        revoked_at DATETIME2 NULL,
        revoked_by INT NULL);
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_api_keys_prefix' AND object_id = OBJECT_ID('dbo.api_keys'))
      CREATE UNIQUE INDEX ux_api_keys_prefix ON dbo.api_keys(key_prefix);
  `);
  await db.query(`
    IF OBJECT_ID('dbo.api_request_logs', 'U') IS NULL
      CREATE TABLE dbo.api_request_logs (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        key_id INT NOT NULL,
        org_id INT NOT NULL,
        method VARCHAR(10) NOT NULL,
        path NVARCHAR(300) NOT NULL,
        status INT NOT NULL,
        ip VARCHAR(64) NULL,
        duration_ms INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_api_request_logs_org' AND object_id = OBJECT_ID('dbo.api_request_logs'))
      CREATE INDEX ix_api_request_logs_org ON dbo.api_request_logs(org_id, created_at DESC);
  `);
  await db.query(`
    IF OBJECT_ID('dbo.webhooks', 'U') IS NULL
      CREATE TABLE dbo.webhooks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(100) NOT NULL,
        url NVARCHAR(500) NOT NULL,
        events VARCHAR(200) NOT NULL,
        secret NVARCHAR(500) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        failure_count INT NOT NULL DEFAULT 0,
        last_status INT NULL,
        last_delivery_at DATETIME2 NULL,
        created_by INT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF OBJECT_ID('dbo.webhook_deliveries', 'U') IS NULL
      CREATE TABLE dbo.webhook_deliveries (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        webhook_id INT NOT NULL REFERENCES dbo.webhooks(id) ON DELETE CASCADE,
        event VARCHAR(40) NOT NULL,
        status_code INT NULL,
        error NVARCHAR(300) NULL,
        duration_ms INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  // Test keys never write; a rotated key keeps working for a day and points to its replacement.
  await db.query(`IF COL_LENGTH('dbo.api_keys', 'mode') IS NULL ALTER TABLE dbo.api_keys ADD mode VARCHAR(4) NOT NULL CONSTRAINT DF_api_keys_mode DEFAULT 'live';`);
  await db.query(`IF COL_LENGTH('dbo.api_keys', 'replaced_by') IS NULL ALTER TABLE dbo.api_keys ADD replaced_by INT NULL;`);
  // Calls per key per minute, shared by every backend process.
  await db.query(`
    IF OBJECT_ID('dbo.api_rate_windows', 'U') IS NULL
      CREATE TABLE dbo.api_rate_windows (
        key_id INT NOT NULL,
        minute BIGINT NOT NULL,
        count INT NOT NULL,
        CONSTRAINT pk_api_rate_windows PRIMARY KEY (key_id, minute));
  `);
  // Webhook messages waiting for a first try or a retry; the body is fixed when the event happens.
  await db.query(`
    IF OBJECT_ID('dbo.webhook_queue', 'U') IS NULL
      CREATE TABLE dbo.webhook_queue (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        webhook_id INT NOT NULL REFERENCES dbo.webhooks(id) ON DELETE CASCADE,
        event VARCHAR(40) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        status VARCHAR(12) NOT NULL DEFAULT 'pending',
        last_error NVARCHAR(300) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_webhook_queue_due' AND object_id = OBJECT_ID('dbo.webhook_queue'))
      CREATE INDEX ix_webhook_queue_due ON dbo.webhook_queue(status, next_attempt_at);
  `);
  // Incoming connections: another system posts its own JSON to a secret address, mapped to task fields.
  await db.query(`
    IF OBJECT_ID('dbo.inbound_hooks', 'U') IS NULL
      CREATE TABLE dbo.inbound_hooks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(100) NOT NULL,
        source NVARCHAR(40) NOT NULL,
        token_prefix VARCHAR(24) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        team_id INT NULL,
        mapping NVARCHAR(MAX) NOT NULL,
        required_fields NVARCHAR(500) NOT NULL,
        sample NVARCHAR(MAX) NULL,
        listening BIT NOT NULL DEFAULT 1,
        is_active BIT NOT NULL DEFAULT 1,
        created_by INT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        last_received_at DATETIME2 NULL);
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_inbound_hooks_prefix' AND object_id = OBJECT_ID('dbo.inbound_hooks'))
      CREATE UNIQUE INDEX ux_inbound_hooks_prefix ON dbo.inbound_hooks(token_prefix);
  `);
  await db.query(`
    IF OBJECT_ID('dbo.inbound_hook_events', 'U') IS NULL
      CREATE TABLE dbo.inbound_hook_events (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        hook_id INT NOT NULL REFERENCES dbo.inbound_hooks(id) ON DELETE CASCADE,
        outcome VARCHAR(12) NOT NULL,
        message NVARCHAR(300) NULL,
        task_id INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  // Which system a task came from and its id there, e.g. source "crm", external id "TCK-981".
  // Unique among live tasks, so two calls racing with the same id never make two tasks, while a
  // deleted task does not block its id from coming back.
  await db.query(`IF COL_LENGTH('dbo.tasks', 'external_source') IS NULL ALTER TABLE dbo.tasks ADD external_source NVARCHAR(40) NULL;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'external_id') IS NULL ALTER TABLE dbo.tasks ADD external_id NVARCHAR(100) NULL;`);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_tasks_external' AND object_id = OBJECT_ID('dbo.tasks'))
      CREATE UNIQUE INDEX ux_tasks_external ON dbo.tasks(org_id, external_source, external_id) WHERE external_id IS NOT NULL AND is_deleted = 0;
  `);
}

module.exports = { ensureDeveloperSchema };
