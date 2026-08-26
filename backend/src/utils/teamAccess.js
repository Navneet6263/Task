const db = require('../config/database');

const canAccessTeam = async (req, teamId) => {
  const normalizedTeamId = Number(teamId);
  if (!Number.isInteger(normalizedTeamId) || normalizedTeamId <= 0) return false;

  if (req.userRole === 'company_admin') {
    const [[team]] = await db.execute(
      `SELECT t.id
       FROM teams t
       JOIN organizations o ON o.id = t.org_id
       WHERE t.id = ? AND t.is_deleted = FALSE AND o.company_admin_id = ?`,
      [normalizedTeamId, req.companyAdminId]
    );
    return Boolean(team);
  }

  if (req.userRole === 'admin') {
    const [[team]] = await db.execute(
      'SELECT id FROM teams WHERE id = ? AND org_id = ? AND is_deleted = FALSE',
      [normalizedTeamId, req.orgId]
    );
    return Boolean(team);
  }

  const [[membership]] = await db.execute(
    `SELECT tm.id
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.team_id = ? AND tm.user_id = ? AND t.is_deleted = FALSE
       AND (? IS NULL OR t.org_id = ?)`,
    [normalizedTeamId, req.userId, req.orgId, req.orgId]
  );
  return Boolean(membership);
};

const requireTeamAccess = async (req, res, teamId) => {
  const allowed = await canAccessTeam(req, teamId);
  if (allowed) return true;
  res.status(403).json({ error: 'Team access denied', code: 'FORBIDDEN' });
  return false;
};

module.exports = { canAccessTeam, requireTeamAccess };
