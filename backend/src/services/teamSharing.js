const db = require('../config/database');

// A share lets the people of one team (the viewer) see and work on another team's tasks. Task access
// follows team membership everywhere in the app, so a share adds the viewer team's own members to the
// shared team, marked auto_added with shared_from_team_id. Removing the share removes only those rows,
// except for people who already have tasks there, who stay so their work does not disappear.
async function syncTeamShares(orgId) {
  if (!orgId) return { added: 0, removed: 0 };
  const [added] = await db.execute(
    `INSERT INTO team_members (team_id, user_id, role, auto_added, shared_from_team_id)
     SELECT s.team_id, vm.user_id, 'Member', 1, MIN(s.viewer_team_id)
     FROM team_shares s
     JOIN teams st ON st.id = s.team_id AND st.is_deleted = 0
     JOIN teams vt ON vt.id = s.viewer_team_id AND vt.is_deleted = 0
     JOIN team_members vm ON vm.team_id = s.viewer_team_id AND vm.auto_added = 0
     JOIN users u ON u.id = vm.user_id AND u.is_deleted = 0
     WHERE s.org_id = ? AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = s.team_id AND tm.user_id = vm.user_id)
     GROUP BY s.team_id, vm.user_id`,
    [orgId]
  );
  // Still justified when some share into this team has the person as a real member of its viewer team.
  const stale = `tm.auto_added = 1 AND tm.shared_from_team_id IS NOT NULL AND t.org_id = ?
    AND NOT EXISTS (
      SELECT 1 FROM team_shares s
      JOIN teams vt ON vt.id = s.viewer_team_id AND vt.is_deleted = 0
      JOIN team_members vm ON vm.team_id = s.viewer_team_id AND vm.user_id = tm.user_id AND vm.auto_added = 0
      WHERE s.team_id = tm.team_id)`;
  await db.execute(
    `UPDATE tm SET auto_added = 0, shared_from_team_id = NULL FROM team_members tm JOIN teams t ON t.id = tm.team_id
     WHERE ${stale}
       AND EXISTS (SELECT 1 FROM tasks k WHERE k.team_id = tm.team_id AND k.is_deleted = 0 AND (k.assigned_to = tm.user_id OR k.assigned_by = tm.user_id))`,
    [orgId]
  );
  const [removed] = await db.execute(`DELETE tm FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE ${stale}`, [orgId]);
  return { added: Number(added?.affectedRows || 0), removed: Number(removed?.affectedRows || 0) };
}

// Safety net for the background job: every organization that has shares, or leftovers of old ones.
async function syncTeamSharesEverywhere() {
  const [rows] = await db.execute(
    `SELECT DISTINCT org_id FROM (
       SELECT org_id FROM team_shares
       UNION
       SELECT t.org_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.shared_from_team_id IS NOT NULL AND tm.auto_added = 1
     ) x`
  );
  for (const row of rows) await syncTeamShares(row.org_id);
}

// Who sees this team's tasks, and whose tasks this team sees.
async function sharesOfTeam(teamId) {
  const [rows] = await db.execute(
    `SELECT s.team_id, s.viewer_team_id, a.name AS team_name, b.name AS viewer_name,
       (SELECT COUNT(*) FROM team_members m WHERE m.team_id = s.viewer_team_id AND m.auto_added = 0) AS viewer_members,
       (SELECT COUNT(*) FROM team_members m WHERE m.team_id = s.team_id AND m.auto_added = 0) AS team_members
     FROM team_shares s JOIN teams a ON a.id = s.team_id AND a.is_deleted = 0 JOIN teams b ON b.id = s.viewer_team_id AND b.is_deleted = 0
     WHERE s.team_id = ? OR s.viewer_team_id = ?`,
    [teamId, teamId]
  );
  const id = Number(teamId);
  const pairs = new Set(rows.map((r) => `${r.team_id}>${r.viewer_team_id}`));
  const twoWay = (a, b) => pairs.has(`${a}>${b}`) && pairs.has(`${b}>${a}`);
  return {
    shared_with: rows.filter((r) => Number(r.team_id) === id)
      .map((r) => ({ id: r.viewer_team_id, name: r.viewer_name, members: Number(r.viewer_members), both_ways: twoWay(id, r.viewer_team_id) })),
    sees: rows.filter((r) => Number(r.viewer_team_id) === id)
      .map((r) => ({ id: r.team_id, name: r.team_name, members: Number(r.team_members), both_ways: twoWay(id, r.team_id) })),
  };
}

// Every share in some organizations, for the overview.
async function sharesOfOrgs(orgIds) {
  if (!orgIds.length) return [];
  const [rows] = await db.execute(
    `SELECT s.team_id, s.viewer_team_id, s.org_id, a.name AS team_name, b.name AS viewer_name, s.created_at
     FROM team_shares s JOIN teams a ON a.id = s.team_id AND a.is_deleted = 0 JOIN teams b ON b.id = s.viewer_team_id AND b.is_deleted = 0
     WHERE s.org_id IN (${orgIds.map(() => '?').join(',')}) ORDER BY a.name, b.name`,
    orgIds
  );
  return rows;
}

// Two teams of the same organization, both alive. Returns that organization.
async function sameOrgTeams(teamId, otherId) {
  const [rows] = await db.execute('SELECT id, org_id FROM teams WHERE id IN (?, ?) AND is_deleted = FALSE', [teamId, otherId]);
  if (Number(teamId) === Number(otherId) || rows.length !== 2 || Number(rows[0].org_id) !== Number(rows[1].org_id)) return null;
  return Number(rows[0].org_id);
}

async function addShare(orgId, teamId, viewerId, userId) {
  await db.execute(
    `IF NOT EXISTS (SELECT 1 FROM team_shares WHERE team_id = ? AND viewer_team_id = ?)
       INSERT INTO team_shares (org_id, team_id, viewer_team_id, created_by) SELECT ?, ?, ?, ?`,
    [teamId, viewerId, orgId, teamId, viewerId, userId]
  );
}

async function removeShare(teamId, viewerId) {
  await db.execute('DELETE FROM team_shares WHERE team_id = ? AND viewer_team_id = ?', [teamId, viewerId]);
}

module.exports = { syncTeamShares, syncTeamSharesEverywhere, sharesOfTeam, sharesOfOrgs, sameOrgTeams, addShare, removeShare };
