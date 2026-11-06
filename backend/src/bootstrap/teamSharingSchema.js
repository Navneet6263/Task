const db = require('../config/database');

// Teams that share their tasks with another team. Additive only: with no shares nothing changes.
async function ensureTeamSharingSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.team_shares', 'U') IS NULL
      CREATE TABLE dbo.team_shares (
        id INT IDENTITY(1,1) PRIMARY KEY,
        org_id INT NOT NULL REFERENCES dbo.organizations(id),
        team_id INT NOT NULL REFERENCES dbo.teams(id),
        viewer_team_id INT NOT NULL REFERENCES dbo.teams(id),
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ux_team_shares UNIQUE (team_id, viewer_team_id),
        CONSTRAINT ck_team_shares_other CHECK (team_id <> viewer_team_id));
  `);
  // Memberships that exist only because of a share remember which team brought them in.
  await db.query(`IF COL_LENGTH('dbo.team_members', 'shared_from_team_id') IS NULL ALTER TABLE dbo.team_members ADD shared_from_team_id INT NULL;`);
}

module.exports = { ensureTeamSharingSchema };
