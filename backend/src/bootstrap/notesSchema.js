const db = require('../config/database');

// Private notes: each note belongs to one user inside one organization.
async function ensureNotesSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.user_notes', 'U') IS NULL
      CREATE TABLE dbo.user_notes (
        id INT IDENTITY PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        title NVARCHAR(200) NOT NULL DEFAULT '',
        body NVARCHAR(MAX) NOT NULL DEFAULT '',
        color VARCHAR(12) NOT NULL DEFAULT 'none',
        is_pinned BIT NOT NULL DEFAULT 0,
        is_deleted BIT NOT NULL DEFAULT 0,
        version INT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ck_user_notes_color CHECK (color IN ('none','green','blue','amber','red')));
  `);
  await db.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_user_notes_owner' AND object_id = OBJECT_ID('dbo.user_notes'))
      CREATE INDEX idx_user_notes_owner ON dbo.user_notes(user_id, org_id, is_pinned DESC, updated_at DESC) WHERE is_deleted = 0;
  `);
}

module.exports = { ensureNotesSchema };
