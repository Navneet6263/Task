let orgAccessTableReady = false;

const ensureUserOrgAccessTable = async (db) => {
  if (orgAccessTableReady) return;

  await db.execute(`
    IF OBJECT_ID('dbo.user_org_access', 'U') IS NULL
    BEGIN
      CREATE TABLE user_org_access (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        org_id INT NOT NULL,
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_user_org_access UNIQUE (user_id, org_id),
        CONSTRAINT fk_user_org_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_org_access_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_org_access_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_user_org_access_user ON user_org_access(user_id);
      CREATE INDEX idx_user_org_access_org ON user_org_access(org_id);
    END
  `);
  // 1 = given automatically when the person was added to a team there; taken away again when they leave its last team.
  await db.execute(`IF COL_LENGTH('dbo.user_org_access', 'via_team') IS NULL
    ALTER TABLE dbo.user_org_access ADD via_team BIT NOT NULL CONSTRAINT DF_user_org_access_via_team DEFAULT 0`);

  orgAccessTableReady = true;
};

const getAccessibleOrgIds = async (db, userId, primaryOrgId) => {
  await ensureUserOrgAccessTable(db);
  const [rows] = await db.execute(
    'SELECT org_id FROM user_org_access WHERE user_id = ?',
    [userId]
  );

  const set = new Set();
  if (primaryOrgId) set.add(Number(primaryOrgId));
  rows.forEach((row) => set.add(Number(row.org_id)));
  return Array.from(set).filter((value) => Number.isFinite(value) && value > 0);
};

module.exports = {
  ensureUserOrgAccessTable,
  getAccessibleOrgIds,
};
