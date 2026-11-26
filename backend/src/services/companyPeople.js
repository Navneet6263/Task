const db = require('../config/database');
const { ensureUserOrgAccessTable } = require('../utils/orgAccess');

// One company, several workspaces (e.g. Green HR: GreenCall Technology and Vision India). A team may take people
// from any workspace of its own company. Someone from another workspace gets access to the team's workspace
// (user_org_access, the same as Admin → Multi-workspace access), so they switch to it with the same sign-in.
// People of other companies are never shown or added.
//
// A role is one per person, not per workspace, so a manager or admin from another workspace would be one here too:
// managers may bring in members only; managers and admins of another workspace are brought in by an admin.
// Access given this way (via_team = 1) is taken back when the person leaves their last team in that workspace.

// "This person belongs to org X": their own workspace, or one they were given access to.
const IN_ORG = (userAlias, orgParam) => `(${userAlias}.org_id = ${orgParam} OR EXISTS (SELECT 1 FROM user_org_access oa WHERE oa.user_id = ${userAlias}.id AND oa.org_id = ${orgParam}))`;

// The workspaces of the company that owns this workspace (just this one when it has no company).
async function companyOrgIds(orgId) {
  const [rows] = await db.execute(
    `SELECT o2.id FROM organizations o JOIN organizations o2 ON o2.company_admin_id = o.company_admin_id
     WHERE o.id = ? AND o.company_admin_id IS NOT NULL`, [orgId]);
  const ids = rows.map((r) => Number(r.id));
  return ids.length ? ids : [Number(orgId)];
}

// People who can join this team: from any workspace of the same company, not in the team yet.
async function teamCandidates(teamId, query) {
  const [[team]] = await db.execute('SELECT id, org_id FROM teams WHERE id = ? AND is_deleted = 0', [teamId]);
  if (!team) return [];
  await ensureUserOrgAccessTable(db);
  const orgIds = await companyOrgIds(team.org_id);
  const q = String(query || '').trim().slice(0, 80);
  const [rows] = await db.execute(
    `SELECT TOP 20 u.id, u.name, u.email, u.role, u.org_id, o.name AS workspace,
       CASE WHEN ${IN_ORG('u', '?')} THEN 1 ELSE 0 END AS in_workspace
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.is_deleted = 0 AND u.role IN ('admin', 'manager', 'person')
       AND (u.org_id IN (${orgIds.map(() => '?').join(',')}) OR EXISTS (SELECT 1 FROM user_org_access oa WHERE oa.user_id = u.id AND oa.org_id = ?))
       AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = ? AND tm.user_id = u.id)
       AND (? = '' OR u.name LIKE ? OR u.email LIKE ?)
     ORDER BY CASE WHEN u.org_id = ? THEN 0 ELSE 1 END, u.name ASC`,
    [team.org_id, team.org_id, ...orgIds, team.org_id, team.id, q, `%${q}%`, `%${q}%`, team.org_id]);
  return rows.map((r) => ({ ...r, in_workspace: Boolean(Number(r.in_workspace)), other_workspace: Number(r.org_id) !== Number(team.org_id) }));
}

const fail = (status, message) => Object.assign(new Error(message), { status });

// The person to add (by id or email), checked against the team's company. Grants access to the team's
// workspace when they come from another one. Returns the user id.
async function personForTeam(req, team, { userId, email }) {
  await ensureUserOrgAccessTable(db);
  const orgIds = await companyOrgIds(team.org_id);
  const byId = userId !== undefined && userId !== null && userId !== '';
  const [[person]] = await db.execute(
    `SELECT u.id, u.role, u.org_id, CASE WHEN ${IN_ORG('u', '?')} THEN 1 ELSE 0 END AS in_workspace
     FROM users u
     WHERE ${byId ? 'u.id = ?' : 'u.email = ?'} AND u.is_deleted = 0 AND u.role IN ('admin', 'manager', 'person')
       AND (u.org_id IN (${orgIds.map(() => '?').join(',')}) OR EXISTS (SELECT 1 FROM user_org_access oa WHERE oa.user_id = u.id AND oa.org_id = ?))`,
    [team.org_id, team.org_id, byId ? Number(userId) : String(email || '').trim().toLowerCase(), ...orgIds, team.org_id]);
  if (!person) throw fail(404, 'No one with that email works in this company');
  if (!Number(person.in_workspace)) {
    if (person.role !== 'person' && !['admin', 'company_admin'].includes(req.userRole)) {
      throw fail(403, `This person is ${person.role === 'admin' ? 'an admin' : 'a manager'} in another workspace. Ask an admin to add them.`);
    }
    await db.execute(
      `IF NOT EXISTS (SELECT 1 FROM user_org_access WHERE user_id = ? AND org_id = ?)
         INSERT INTO user_org_access (user_id, org_id, created_by, via_team) VALUES (?, ?, ?, 1)`,
      [person.id, team.org_id, person.id, team.org_id, req.userId || null]);
    // Their next request sees the new workspace in the switcher.
    require('./sessions').forgetSessions();
  }
  return Number(person.id);
}

// After someone leaves a team: access that came only from team membership ends with their last team there.
async function releaseTeamAccess(userId, orgId) {
  await ensureUserOrgAccessTable(db);
  const [result] = await db.execute(
    `DELETE FROM user_org_access WHERE user_id = ? AND org_id = ? AND via_team = 1
       AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.org_id = ?)
       AND NOT EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
                       WHERE tm.user_id = ? AND t.org_id = ? AND t.is_deleted = 0)`,
    [userId, orgId, userId, orgId, userId, orgId]);
  if (Number(result?.affectedRows)) require('./sessions').forgetSessions();
}

module.exports = { IN_ORG, companyOrgIds, teamCandidates, personForTeam, releaseTeamAccess };
