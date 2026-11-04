const db = require('../config/database');

const LEADER_ROLE = 'Team Leader';
const fail = (status, message) => Object.assign(new Error(message), { status });

// The company's manager-and-admin limit, if the organization belongs to a company admin with one.
async function managerLimitReached(orgId) {
  const [[row]] = await db.execute(
    `SELECT ca.max_managers_per_company AS max,
       (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.is_deleted = FALSE AND u.role IN ('admin', 'manager')) AS used
     FROM organizations o JOIN company_admins ca ON ca.id = o.company_admin_id WHERE o.id = ?`,
    [orgId]
  );
  return Boolean(row && Number(row.max) > 0 && Number(row.used) >= Number(row.max));
}

// Teams of one organization, by id, ready to be led. Anything else in the list is refused.
async function teamsInOrg(orgId, teamIds) {
  const ids = [...new Set((Array.isArray(teamIds) ? teamIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  const [rows] = await db.execute(
    `SELECT id FROM teams WHERE org_id = ? AND is_deleted = FALSE AND id IN (${ids.map(() => '?').join(',')})`,
    [orgId, ...ids]
  );
  if (rows.length !== ids.length) throw fail(422, 'Pick teams from this person\'s organization');
  return ids;
}

// Make someone the one leader of a team: they join it if they are not in it, the old leader
// becomes a member, and a member is raised to manager so they can run the team.
async function setTeamLeader(teamId, userId) {
  const [[person]] = await db.execute(
    `SELECT u.id, u.role, u.org_id FROM users u JOIN teams t ON t.id = ? AND t.org_id = u.org_id AND t.is_deleted = FALSE
     WHERE u.id = ? AND u.is_deleted = FALSE`,
    [teamId, userId]
  );
  if (!person) throw fail(404, 'This person is not in the team\'s organization');
  if (person.role === 'person') {
    if (await managerLimitReached(person.org_id)) throw fail(403, 'Manager and admin limit reached for this organization');
    await db.execute("UPDATE users SET role = 'manager' WHERE id = ? AND role = 'person'", [userId]);
  }
  await db.execute(
    `UPDATE team_members SET is_reporting_manager = 0, role = CASE WHEN role IN ('Reporting Manager', 'Team Leader') THEN 'Member' ELSE role END
     WHERE team_id = ? AND user_id <> ? AND is_reporting_manager = 1`,
    [teamId, userId]
  );
  const [updated] = await db.execute(
    'UPDATE team_members SET is_reporting_manager = 1, auto_added = 0, role = ? WHERE team_id = ? AND user_id = ?',
    [LEADER_ROLE, teamId, userId]
  );
  if (!Number(updated?.affectedRows)) {
    await db.execute('INSERT INTO team_members (team_id, user_id, role, is_reporting_manager) VALUES (?, ?, ?, 1)', [teamId, userId, LEADER_ROLE]);
  }
  return { promoted: person.role === 'person' };
}

// A member no longer leads anything.
async function clearLeads(userId) {
  await db.execute(
    `UPDATE team_members SET is_reporting_manager = 0, role = CASE WHEN role IN ('Reporting Manager', 'Team Leader') THEN 'Member' ELSE role END
     WHERE user_id = ? AND is_reporting_manager = 1`,
    [userId]
  );
}

// Which teams each person leads, for a list of people: { userId: [{ id, name }] }.
async function leadsFor(userIds) {
  const ids = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!ids.length) return {};
  const [rows] = await db.execute(
    `SELECT tm.user_id, t.id, t.name FROM team_members tm JOIN teams t ON t.id = tm.team_id AND t.is_deleted = FALSE
     WHERE tm.is_reporting_manager = 1 AND tm.user_id IN (${ids.map(() => '?').join(',')}) ORDER BY t.name ASC`,
    ids
  );
  return rows.reduce((map, row) => {
    (map[row.user_id] = map[row.user_id] || []).push({ id: row.id, name: row.name });
    return map;
  }, {});
}

// After an admin changes someone's role: a member leads nothing; a manager or admin leads exactly the
// teams picked (already checked with teamsInOrg), or keeps what they lead when no list was sent.
async function applyLeadsForRole(userId, role, teamIds) {
  if (role !== 'person' && teamIds === null) return;
  await clearLeads(userId);
  for (const teamId of teamIds || []) await setTeamLeader(teamId, userId);
}

// The lead_team_ids an admin sent with a role change: null when they sent none.
const pickedLeads = (orgId, role, body) => (role === 'person' || !Array.isArray(body?.lead_team_ids) ? Promise.resolve(role === 'person' ? [] : null) : teamsInOrg(orgId, body.lead_team_ids));

module.exports = { LEADER_ROLE, managerLimitReached, teamsInOrg, setTeamLeader, clearLeads, leadsFor, applyLeadsForRole, pickedLeads };
