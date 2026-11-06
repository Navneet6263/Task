const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const { canAccessTeam } = require('../utils/teamAccess');
const { syncQuietly } = require('../services/employeeAccounts');
const { setTeamLeader } = require('../services/teamLeads');
const { syncTeamShares, sharesOfTeam, sharesOfOrgs, sameOrgTeams, addShare, removeShare } = require('../services/teamSharing');

const isAdmin = (req) => ['admin', 'company_admin'].includes(req.userRole);
// Organizations the caller runs: all of a company admin's, or the current one for an admin.
async function adminOrgIds(req) {
  if (req.userRole === 'company_admin') {
    const [rows] = await db.execute('SELECT id FROM organizations WHERE company_admin_id = ?', [req.companyAdminId]);
    return rows.map((row) => Number(row.id));
  }
  return req.userRole === 'admin' && req.orgId ? [Number(req.orgId)] : [];
}
const quietShares = (orgId) => syncTeamShares(orgId).catch((error) => console.error('[team-sharing] sync failed', error.message));

const MANAGER_ROLES = ['admin', 'manager', 'company_admin'];
const teamRoleText = (value) => {
  const text = String(value || 'Member').trim() || 'Member';
  return text.length > 60 ? null : text;
};

// Shared guard for team changes: manager role plus access to this team.
async function requireTeamManager(req, res) {
  if (!MANAGER_ROLES.includes(req.userRole)) { res.status(403).json({ error: 'Only admins and managers can change teams' }); return false; }
  if (!await canAccessTeam(req, req.params.teamId)) { res.status(403).json({ error: 'Team access denied' }); return false; }
  return true;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    let query, params;

    if (req.userRole === 'company_admin') {
      // Company admin sees all teams across their organizations
      const [orgRows] = await db.execute(
        'SELECT id FROM organizations WHERE company_admin_id = ?',
        [req.companyAdminId]
      );
      const orgIds = orgRows.map((org) => org.id);
      if (!orgIds || orgIds.length === 0) return res.json([]);
      const placeholders = orgIds.map(() => '?').join(',');
      query = `SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t LEFT JOIN users u ON t.created_by = u.id
       WHERE t.is_deleted = FALSE AND t.org_id IN (${placeholders})
       ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`;
      params = [...orgIds, limit, offset];
    } else if (req.userRole === 'admin') {
      query = `SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t LEFT JOIN users u ON t.created_by = u.id
       WHERE t.is_deleted = FALSE AND t.org_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`;
      params = [req.orgId, limit, offset];
    } else {
      query = `SELECT t.*, u.name as creator_name,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE tm.user_id = ? AND t.is_deleted = FALSE AND t.org_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`;
      params = [req.userId, req.orgId, limit, offset];
    }
    const [teams] = await db.execute(query, params);
    res.json(teams);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type, org_id } = req.body;
    if (!name) return res.status(422).json({ error: 'Team name required' });

    let resolvedOrgId = req.orgId;

    if (req.userRole === 'company_admin') {
      const targetOrgId = Number(org_id || req.orgIds?.[0] || 0);
      if (!targetOrgId) return res.status(422).json({ error: 'org_id required for company admin' });

      const [[org]] = await db.execute(
        'SELECT id FROM organizations WHERE id = ? AND company_admin_id = ?',
        [targetOrgId, req.companyAdminId]
      );
      if (!org) return res.status(403).json({ error: 'Organization access denied' });
      resolvedOrgId = targetOrgId;
    }

    if (!resolvedOrgId) return res.status(422).json({ error: 'Organization context missing' });

    // Admins may pick the leader and members right away; people must belong to the team's organization.
    const leaderId = isAdmin(req) && req.body.leader_id ? Number(req.body.leader_id) : null;
    const memberIds = isAdmin(req) && Array.isArray(req.body.member_ids)
      ? [...new Set(req.body.member_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== leaderId))].slice(0, 500) : [];
    const picked = [...(leaderId ? [leaderId] : []), ...memberIds];
    if (picked.length) {
      const [found] = await db.execute(
        `SELECT id FROM users WHERE org_id = ? AND is_deleted = FALSE AND id IN (${picked.map(() => '?').join(',')})`,
        [resolvedOrgId, ...picked]
      );
      if (found.length !== picked.length) return res.status(422).json({ error: 'Pick people from this organization' });
    }

    const code = 'TM' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const [result] = await db.execute(
      'INSERT INTO teams (name, type, team_code, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
      [name, type, code, req.userId, resolvedOrgId]
    );
    // Without a chosen leader the creator leads the team, as before.
    if (!leaderId) {
      await db.execute(
        'INSERT INTO team_members (team_id, user_id, role, is_reporting_manager) VALUES (?, ?, ?, ?)',
        [result.insertId, req.userId, 'Reporting Manager', true]
      );
    }
    for (const memberId of memberIds) {
      await db.execute("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'Member')", [result.insertId, memberId]);
    }
    if (leaderId) await setTeamLeader(result.insertId, leaderId);
    await syncQuietly(resolvedOrgId);
    res.json({ id: result.insertId, name, type, team_code: code });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:teamId/members', authenticate, async (req, res) => {
  try {
    const allowed = await canAccessTeam(req, req.params.teamId);
    if (!allowed) return res.status(403).json({ error: 'Team access denied' });

    const [members] = await db.execute(
      `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.avatar,
        tm.role as team_role, tm.is_reporting_manager, tm.auto_added, tm.shared_from_team_id,
        (SELECT name FROM teams sf WHERE sf.id = tm.shared_from_team_id) as shared_from_name,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND team_id = ? AND status != 'DONE' AND is_deleted = FALSE) as current_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND team_id = ? AND status != 'DONE' AND is_deleted = FALSE
           AND due_date < CAST(GETDATE() AS DATE)) as overdue_tasks,
        (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND team_id = ? AND status = 'DONE' AND is_deleted = FALSE
           AND completed_at >= DATEADD(DAY, -30, GETDATE())) as done_30d
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ? AND u.is_deleted = FALSE
       ORDER BY tm.is_reporting_manager DESC, u.name ASC`,
      [req.params.teamId, req.params.teamId, req.params.teamId, req.params.teamId]
    );
    res.json(members);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:teamId/members', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager', 'company_admin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only admin, manager, or company admin can add members' });
    }
    const allowed = await canAccessTeam(req, req.params.teamId);
    if (!allowed) return res.status(403).json({ error: 'Team access denied' });

    // Add by picked person (user_id) or by email; either way the person must be in the team's organization.
    const { email, role, user_id: userId } = req.body;
    const teamRole = teamRoleText(role);
    if (teamRole === null) return res.status(422).json({ error: 'Team role must be 60 characters or fewer' });
    const byId = userId !== undefined && userId !== null && userId !== '';
    const [users] = await db.execute(
      `SELECT u.id
       FROM users u
       JOIN teams t ON t.id = ?
       WHERE ${byId ? 'u.id = ?' : 'u.email = ?'} AND u.org_id = t.org_id AND u.is_deleted = FALSE`,
      [req.params.teamId, byId ? Number(userId) : normalizeEmail(email)]
    );
    if (users.length === 0) return res.status(404).json({ error: 'No one with that email works in this organization' });
    // Already in the team only through "show all tasks": make the membership permanent instead.
    const [kept] = await db.execute(
      'UPDATE team_members SET auto_added = 0, shared_from_team_id = NULL, role = ? WHERE team_id = ? AND user_id = ? AND auto_added = 1',
      [teamRole, req.params.teamId, users[0].id]
    );
    if (Number(kept?.affectedRows) > 0) return res.json({ message: 'Member added' });
    const [[existing]] = await db.execute('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [req.params.teamId, users[0].id]);
    if (existing) return res.status(409).json({ error: 'This person is already in the team' });
    await db.execute(
      'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
      [req.params.teamId, users[0].id, teamRole]
    );
    // A new member also reaches every team this team is allowed to see.
    const [[team]] = await db.execute('SELECT org_id FROM teams WHERE id = ?', [req.params.teamId]);
    await quietShares(team?.org_id);
    res.json({ message: 'Member added' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:teamId/members/:userId', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manager', 'company_admin'].includes(req.userRole)) {
      return res.status(403).json({ error: 'Only admin, manager, or company admin can remove members' });
    }
    const allowed = await canAccessTeam(req, req.params.teamId);
    if (!allowed) return res.status(403).json({ error: 'Team access denied' });

    await db.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [req.params.teamId, req.params.userId]);
    const [[team]] = await db.execute('SELECT org_id FROM teams WHERE id = ?', [req.params.teamId]);
    await quietShares(team?.org_id);
    res.json({ message: 'Member removed' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rename a team or change its type.
router.patch('/:teamId', authenticate, async (req, res) => {
  try {
    if (!await requireTeamManager(req, res)) return;
    const name = String(req.body.name || '').trim();
    const type = req.body.type === undefined ? undefined : String(req.body.type || '').trim();
    if (!name || name.length > 255) return res.status(422).json({ error: 'Team name must be 1 to 255 characters' });
    if (type !== undefined && type.length > 100) return res.status(422).json({ error: 'Team type must be 100 characters or fewer' });
    await db.execute(`UPDATE teams SET name = ?${type !== undefined ? ', type = ?' : ''} WHERE id = ? AND is_deleted = FALSE`,
      [name, ...(type !== undefined ? [type || null] : []), Number(req.params.teamId)]);
    res.json({ message: 'Team updated' });
  } catch (error) { res.status(500).json({ error: 'Could not update the team' }); }
});

// People in the team's organization who are not in the team yet, for the "add member" search.
router.get('/:teamId/candidates', authenticate, async (req, res) => {
  try {
    if (!await requireTeamManager(req, res)) return;
    const q = String(req.query.q || '').trim().slice(0, 80);
    const [rows] = await db.execute(
      `SELECT TOP 20 u.id, u.name, u.email, u.role FROM users u
       JOIN teams t ON t.id = ?
       WHERE u.org_id = t.org_id AND u.is_deleted = FALSE
         AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = u.id)
         AND (? = '' OR u.name LIKE ? OR u.email LIKE ?)
       ORDER BY u.name ASC`,
      [Number(req.params.teamId), q, `%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Could not search people' }); }
});

// Change a member's role inside the team (a label such as "Lead Developer").
router.patch('/:teamId/members/:userId', authenticate, async (req, res) => {
  try {
    if (!await requireTeamManager(req, res)) return;
    const teamRole = teamRoleText(req.body.role);
    if (teamRole === null) return res.status(422).json({ error: 'Team role must be 60 characters or fewer' });
    const [result] = await db.execute('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
      [teamRole, Number(req.params.teamId), Number(req.params.userId)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Member not found in this team' });
    res.json({ message: 'Role updated' });
  } catch (error) { res.status(500).json({ error: 'Could not update the role' }); }
});

// Put someone in charge of the team. Only admins decide who leads, because it can make a member a manager.
router.put('/:teamId/leader', authenticate, async (req, res) => {
  try {
    if (!['admin', 'company_admin'].includes(req.userRole)) return res.status(403).json({ error: 'Only admins can choose a team leader' });
    if (!await canAccessTeam(req, req.params.teamId)) return res.status(403).json({ error: 'Team access denied' });
    const userId = Number(req.body.user_id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(422).json({ error: 'Pick a person' });
    const { promoted } = await setTeamLeader(Number(req.params.teamId), userId);
    res.json({ message: 'Team leader updated', promoted });
  } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not change the team leader' }); }
});

/* Team sharing: which teams see and work on which team's tasks. Only admins decide. */
router.get('/sharing/overview', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only admins can see team sharing' });
    res.json(await sharesOfOrgs(await adminOrgIds(req)));
  } catch (error) { res.status(500).json({ error: 'Could not load team sharing' }); }
});

router.get('/:teamId/sharing', authenticate, async (req, res) => {
  try {
    if (!await canAccessTeam(req, req.params.teamId)) return res.status(403).json({ error: 'Team access denied' });
    res.json(await sharesOfTeam(Number(req.params.teamId)));
  } catch (error) { res.status(500).json({ error: 'Could not load team sharing' }); }
});

// Let another team see and work on this team's tasks; both_ways shares the other team's tasks back.
router.post('/:teamId/sharing', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only admins can share a team' });
    const teamId = Number(req.params.teamId);
    const otherId = Number(req.body.team_id);
    if (!await canAccessTeam(req, teamId) || !await canAccessTeam(req, otherId)) return res.status(403).json({ error: 'Team access denied' });
    const orgId = await sameOrgTeams(teamId, otherId);
    if (!orgId) return res.status(422).json({ error: 'Pick another team of the same organization' });
    await addShare(orgId, teamId, otherId, req.userId);
    if (req.body.both_ways === true) await addShare(orgId, otherId, teamId, req.userId);
    await syncTeamShares(orgId);
    res.json(await sharesOfTeam(teamId));
  } catch (error) { res.status(500).json({ error: 'Could not share the team' }); }
});

// Stop sharing. direction: 'out' (they stop seeing this team), 'in' (this team stops seeing theirs) or 'both'.
router.delete('/:teamId/sharing/:otherId', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only admins can change team sharing' });
    const teamId = Number(req.params.teamId);
    const otherId = Number(req.params.otherId);
    if (!await canAccessTeam(req, teamId)) return res.status(403).json({ error: 'Team access denied' });
    const orgId = await sameOrgTeams(teamId, otherId);
    if (!orgId) return res.status(404).json({ error: 'Team not found' });
    const direction = ['in', 'both'].includes(req.query.direction) ? req.query.direction : 'out';
    if (direction !== 'in') await removeShare(teamId, otherId);
    if (direction !== 'out') await removeShare(otherId, teamId);
    await syncTeamShares(orgId);
    res.json(await sharesOfTeam(teamId));
  } catch (error) { res.status(500).json({ error: 'Could not change team sharing' }); }
});

// People an admin can put in a new team: everyone active in that organization.
router.get('/people/:orgId', authenticate, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only admins can pick people for a team' });
    const orgId = Number(req.params.orgId);
    if (!(await adminOrgIds(req)).includes(orgId)) return res.status(403).json({ error: 'Organization access denied' });
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.role, u.employee_id FROM users u
       WHERE u.org_id = ? AND u.is_deleted = FALSE AND u.role IN ('admin', 'manager', 'person') ORDER BY u.name ASC`,
      [orgId]
    );
    res.json(rows);
  } catch (error) { res.status(500).json({ error: 'Could not load people' }); }
});

module.exports = router;
