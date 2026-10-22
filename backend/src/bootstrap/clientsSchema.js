const db = require('../config/database');

// The organization's client list and the "pick only from this list" rule. Additive only:
// tasks keep storing the client's name in tasks.client_name, so nothing existing changes.
async function ensureClientsSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.org_clients', 'U') IS NULL
      CREATE TABLE dbo.org_clients (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(255) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        source VARCHAR(10) NULL,
        created_by INT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_org_clients UNIQUE (org_id, name));
  `);
  await db.query(`
    IF OBJECT_ID('dbo.org_client_settings', 'U') IS NULL
      CREATE TABLE dbo.org_client_settings (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL UNIQUE REFERENCES dbo.organizations(id),
        pick_only BIT NOT NULL DEFAULT 0,
        updated_by INT NULL REFERENCES dbo.users(id),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
}

module.exports = { ensureClientsSchema };
