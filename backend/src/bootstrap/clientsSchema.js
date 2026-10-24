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
  // Agents: the accounting firms clients come through. Each client sits under one agent.
  await db.query(`
    IF OBJECT_ID('dbo.org_agents', 'U') IS NULL
      CREATE TABLE dbo.org_agents (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(255) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_by INT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_org_agents UNIQUE (org_id, name));
  `);
  await db.query(`IF COL_LENGTH('dbo.org_clients', 'agent_id') IS NULL ALTER TABLE dbo.org_clients ADD agent_id INT NULL REFERENCES dbo.org_agents(id);`);
  // Tasks and timesheet entries keep the agent they were done for, so moving a client later keeps history.
  await db.query(`IF COL_LENGTH('dbo.tasks', 'agent_firm_id') IS NULL ALTER TABLE dbo.tasks ADD agent_firm_id INT NULL REFERENCES dbo.org_agents(id);`);
  await db.query(`
    IF OBJECT_ID('dbo.timesheet_entries', 'U') IS NOT NULL AND COL_LENGTH('dbo.timesheet_entries', 'agent_firm_id') IS NULL
      ALTER TABLE dbo.timesheet_entries ADD agent_firm_id INT NULL REFERENCES dbo.org_agents(id);
  `);
  // Agents: the accounting firms clients come through. Each client sits under one agent.
  await db.query(`
    IF OBJECT_ID('dbo.org_agents', 'U') IS NULL
      CREATE TABLE dbo.org_agents (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        name NVARCHAR(255) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_by INT NULL REFERENCES dbo.users(id),
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_org_agents UNIQUE (org_id, name));
  `);
  await db.query(`IF COL_LENGTH('dbo.org_clients', 'agent_id') IS NULL ALTER TABLE dbo.org_clients ADD agent_id INT NULL REFERENCES dbo.org_agents(id);`);
  // Tasks and timesheet entries keep the agent they were done for, so moving a client later keeps history.
  await db.query(`IF COL_LENGTH('dbo.tasks', 'agent_firm_id') IS NULL ALTER TABLE dbo.tasks ADD agent_firm_id INT NULL REFERENCES dbo.org_agents(id);`);
  await db.query(`
    IF OBJECT_ID('dbo.timesheet_entries', 'U') IS NOT NULL AND COL_LENGTH('dbo.timesheet_entries', 'agent_firm_id') IS NULL
      ALTER TABLE dbo.timesheet_entries ADD agent_firm_id INT NULL REFERENCES dbo.org_agents(id);
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
