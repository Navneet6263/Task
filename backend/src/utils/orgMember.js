const db = require('../config/database');

// A user belongs to an organization through users.org_id or an explicit org access grant.
const memberClause = `(u.org_id = ? OR EXISTS
  (SELECT 1 FROM user_org_access oa WHERE oa.user_id = u.id AND oa.org_id = ?))`;

const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });

// Live database check, so a stale JWT never keeps access after a user is removed or demoted.
// Returns the user's current role ('admin' for company admins of this organization).
async function currentOrgRole(req) {
  if (!req.orgId) throw fail(403, 'Select an organization first');
  if (req.userRole === 'company_admin') {
    const [[org]] = await db.execute('SELECT id FROM organizations WHERE id = ? AND company_admin_id = ?', [req.orgId, req.companyAdminId]);
    if (!org) throw fail(403, 'Organization access denied');
    return 'admin';
  }
  const [[user]] = await db.execute(
    `SELECT u.id, u.role FROM users u WHERE u.id = ? AND u.is_deleted = FALSE AND ${memberClause}`,
    [req.userId, req.orgId, req.orgId]
  );
  if (!user) throw fail(403, 'Organization access denied');
  return user.role;
}

async function orgMembers(orgId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.name, u.role FROM users u
     WHERE u.is_deleted = FALSE AND u.role IN ('admin', 'manager', 'person') AND ${memberClause}
     ORDER BY u.name ASC`,
    [orgId, orgId]
  );
  return rows;
}

module.exports = { memberClause, fail, currentOrgRole, orgMembers };
