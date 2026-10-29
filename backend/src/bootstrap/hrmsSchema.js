const db = require('../config/database');

// Employee-code sign-in (HRMS import) and the "everyone sees all tasks" switch. Additive only:
// organizations without these modules keep working exactly as before.
async function ensureHrmsSchema() {
  const addUserColumn = (name, definition) => db.query(`IF COL_LENGTH('dbo.users', '${name}') IS NULL ALTER TABLE dbo.users ADD ${name} ${definition};`);
  await addUserColumn('login_code', 'NVARCHAR(50) NULL');
  await addUserColumn('must_change_password', 'BIT NOT NULL CONSTRAINT DF_users_must_change_password DEFAULT 0');
  await addUserColumn('reports_to', 'INT NULL');
  await addUserColumn('department', 'NVARCHAR(150) NULL');
  await addUserColumn('designation', 'NVARCHAR(150) NULL');
  await addUserColumn('work_location', 'NVARCHAR(100) NULL');
  // The same employee code can exist in two companies, so it is unique per organization only.
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_users_org_login_code' AND object_id = OBJECT_ID('dbo.users'))
      CREATE UNIQUE INDEX ux_users_org_login_code ON dbo.users(org_id, login_code) WHERE login_code IS NOT NULL;
  `);
  // Memberships added by the "show all tasks" switch, so turning it off removes only those.
  await db.query(`IF COL_LENGTH('dbo.team_members', 'auto_added') IS NULL ALTER TABLE dbo.team_members ADD auto_added BIT NOT NULL CONSTRAINT DF_team_members_auto_added DEFAULT 0;`);
  await db.query(`
    IF OBJECT_ID('dbo.org_task_settings', 'U') IS NULL
      CREATE TABLE dbo.org_task_settings (
        org_id INT NOT NULL PRIMARY KEY REFERENCES dbo.organizations(id),
        show_all_tasks BIT NOT NULL DEFAULT 0,
        updated_by INT NULL REFERENCES dbo.users(id),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
  // One pending "confirm your email" code per user. Only a keyed hash of the code is stored.
  await db.query(`
    IF OBJECT_ID('dbo.user_email_otps', 'U') IS NULL
      CREATE TABLE dbo.user_email_otps (
        user_id INT NOT NULL PRIMARY KEY REFERENCES dbo.users(id),
        email NVARCHAR(255) NOT NULL,
        code_hash VARCHAR(64) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at DATETIME2 NOT NULL,
        sent_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
}

module.exports = { ensureHrmsSchema };
