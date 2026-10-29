const db = require('../config/database');

// "Email to task": each organization the super admin turns it on for can have its own inbox.
// The mailbox password is stored sealed (services/secretBox), never as plain text.
async function ensureEmailInboxSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.org_email_inboxes', 'U') IS NULL
      CREATE TABLE dbo.org_email_inboxes (
        org_id INT NOT NULL PRIMARY KEY REFERENCES dbo.organizations(id),
        host NVARCHAR(255) NOT NULL,
        port INT NOT NULL DEFAULT 993,
        username NVARCHAR(255) NOT NULL,
        secret NVARCHAR(1000) NOT NULL,
        team_id INT NULL REFERENCES dbo.teams(id),
        last_checked_at DATETIME2 NULL,
        last_error NVARCHAR(500) NULL,
        tasks_created INT NOT NULL DEFAULT 0,
        updated_by NVARCHAR(255) NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME());
  `);
}

module.exports = { ensureEmailInboxSchema };
