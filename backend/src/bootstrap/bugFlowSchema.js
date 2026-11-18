const db = require('../config/database');

// Bug tracking module: who is Developer or QA in each team, and where each bug is in its
// fix-and-check flow. Additive only: workspaces without the module never read these.
async function ensureBugFlowSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.team_work_roles', 'U') IS NULL
      CREATE TABLE dbo.team_work_roles (
        id INT IDENTITY(1,1) PRIMARY KEY,
        team_id INT NOT NULL REFERENCES dbo.teams(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        work_role NVARCHAR(12) NOT NULL CONSTRAINT ck_team_work_roles_role CHECK (work_role IN ('developer', 'qa', 'both')),
        set_by INT NULL,
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT ux_team_work_roles UNIQUE (team_id, user_id));
  `);
  // Old bugs keep NULL here; their stage is read from their status (see bugFlow.stageOf).
  await db.query(`IF COL_LENGTH('dbo.tasks', 'bug_stage') IS NULL ALTER TABLE dbo.tasks ADD bug_stage NVARCHAR(12) NULL;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'qa_user_id') IS NULL ALTER TABLE dbo.tasks ADD qa_user_id INT NULL;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'reopen_count') IS NULL ALTER TABLE dbo.tasks ADD reopen_count INT NOT NULL CONSTRAINT df_tasks_reopen_count DEFAULT 0;`);
  await db.query(`IF COL_LENGTH('dbo.tasks', 'fixed_at') IS NULL ALTER TABLE dbo.tasks ADD fixed_at DATETIME2 NULL;`);
}

module.exports = { ensureBugFlowSchema };
