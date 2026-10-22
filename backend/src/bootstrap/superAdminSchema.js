const db = require('../config/database');

// Console helpers sign in with a password plus an emailed code. Additive: existing rows keep working,
// but helpers without a password must finish setup from an invite link before they can sign in.
const USER_COLUMNS = [
  ['password_hash', 'NVARCHAR(100) NULL'],
  ['password_set_at', 'DATETIME2 NULL'],
  ['invite_token_hash', 'CHAR(64) NULL'],
  ['invite_expires_at', 'DATETIME2 NULL'],
  ['failed_logins', 'INT NOT NULL CONSTRAINT DF_super_admin_users_failed_logins DEFAULT 0'],
  ['locked_until', 'DATETIME2 NULL'],
  ['last_login_at', 'DATETIME2 NULL'],
];

async function ensureSuperAdminSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.super_admin_users', 'U') IS NULL
      CREATE TABLE dbo.super_admin_users (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        email NVARCHAR(255) NOT NULL UNIQUE,
        name NVARCHAR(255) NULL,
        added_by INT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_super_admin_users_is_active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_super_admin_users_created_at DEFAULT SYSDATETIME());
  `);
  for (const [column, type] of USER_COLUMNS) {
    await db.query(`IF COL_LENGTH('dbo.super_admin_users', '${column}') IS NULL ALTER TABLE dbo.super_admin_users ADD ${column} ${type};`);
  }
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_super_admin_users_invite' AND object_id = OBJECT_ID('dbo.super_admin_users'))
      CREATE INDEX idx_super_admin_users_invite ON dbo.super_admin_users(invite_token_hash) WHERE invite_token_hash IS NOT NULL;
  `);
  await db.query(`
    IF OBJECT_ID('dbo.super_admin_logs', 'U') IS NULL
      CREATE TABLE dbo.super_admin_logs (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        actor_email NVARCHAR(255) NOT NULL,
        actor_name NVARCHAR(255) NULL,
        action NVARCHAR(100) NOT NULL,
        target_type NVARCHAR(50) NULL,
        target_id INT NULL,
        description NVARCHAR(MAX) NULL,
        ip_address NVARCHAR(50) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_super_admin_logs_created_at DEFAULT SYSDATETIME());
  `);
  await db.query(`
    IF OBJECT_ID('dbo.super_admin_otps', 'U') IS NULL
      CREATE TABLE dbo.super_admin_otps (
        id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(255) NOT NULL,
        challenge_hash CHAR(64) NOT NULL,
        code_hash CHAR(64) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        resends INT NOT NULL DEFAULT 0,
        expires_at DATETIME2 NOT NULL,
        last_sent_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        consumed_at DATETIME2 NULL,
        ip_address NVARCHAR(50) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_super_admin_otps_challenge UNIQUE (challenge_hash));
  `);
}

module.exports = { ensureSuperAdminSchema };
