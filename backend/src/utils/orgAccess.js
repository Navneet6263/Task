let orgAccessTableReady = false;

const ensureUserOrgAccessTable = async (db) => {
  if (orgAccessTableReady) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_org_access (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      org_id INT NOT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_org_access (user_id, org_id),
      INDEX idx_user_org_access_user (user_id),
      INDEX idx_user_org_access_org (org_id),
      CONSTRAINT fk_user_org_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_org_access_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `);

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
