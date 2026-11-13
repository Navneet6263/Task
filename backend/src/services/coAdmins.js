const db = require('../config/database');

// Co-admins: more people who run a company next to its company admin. A co-admin is an existing admin
// account in one of the company's organizations; they sign in with their own email and password and get
// the company admin view (create organizations, add admins, and so on). The company itself still has one
// owner (company_admins), so Super Admin limits, hand-over and approval stay exactly as they were.

async function ensureCoAdminSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.company_co_admins', 'U') IS NULL
      CREATE TABLE dbo.company_co_admins (
        id INT IDENTITY PRIMARY KEY,
        company_admin_id INT NOT NULL REFERENCES dbo.company_admins(id),
        user_id INT NOT NULL REFERENCES dbo.users(id),
        created_by INT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT uq_company_co_admins_user UNIQUE (user_id));
  `);
}

const fail = (status, message) => Object.assign(new Error(message), { status });

// The approved company a signed-in user runs as a co-admin, or null.
async function companyOfCoAdmin(userId) {
  const [[row]] = await db.execute(
    `SELECT ca.id, ca.max_companies, ca.max_managers_per_company, ca.max_staff_per_company
     FROM company_co_admins c JOIN company_admins ca ON ca.id = c.company_admin_id
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id = ? AND ca.status = 'approved' AND u.is_deleted = 0 AND u.role = 'admin'`,
    [userId]);
  return row || null;
}

// A removed co-admin must lose the company view at once, not when their 30-day session ends.
// Checked on every request that carries a co-admin session, with a short cache.
const CACHE_MS = 30 * 1000;
const cache = new Map();
async function stillCoAdmin(userId, companyAdminId) {
  const key = `${userId}:${companyAdminId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const company = await companyOfCoAdmin(userId);
  const ok = Boolean(company) && Number(company.id) === Number(companyAdminId);
  cache.set(key, { ok, at: Date.now() });
  return ok;
}
const forget = (userId) => { [...cache.keys()].filter((k) => k.startsWith(`${userId}:`)).forEach((k) => cache.delete(k)); };

async function listCoAdmins(companyAdminId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.name, u.email, u.org_id, o.name AS org_name, c.created_at
     FROM company_co_admins c JOIN users u ON u.id = c.user_id LEFT JOIN organizations o ON o.id = u.org_id
     WHERE c.company_admin_id = ? AND u.is_deleted = 0 ORDER BY u.name ASC`,
    [companyAdminId]);
  return rows;
}

// Only an admin of one of this company's organizations can become a co-admin.
async function addCoAdmin(companyAdminId, userId, byUserId) {
  const [[user]] = await db.execute(
    `SELECT u.id, u.name, u.email, u.role FROM users u JOIN organizations o ON o.id = u.org_id
     WHERE u.id = ? AND u.is_deleted = 0 AND o.company_admin_id = ?`,
    [userId, companyAdminId]);
  if (!user) throw fail(404, 'Person not found in your organizations');
  if (user.role !== 'admin') throw fail(422, `${user.name} is not an admin yet. Make them an admin first, then a company admin.`);
  const [[owner]] = await db.execute('SELECT email FROM company_admins WHERE id = ?', [companyAdminId]);
  if (owner && String(owner.email).toLowerCase() === String(user.email).toLowerCase()) throw fail(409, `${user.name} already runs this company`);
  const [[taken]] = await db.execute('SELECT company_admin_id FROM company_co_admins WHERE user_id = ?', [userId]);
  if (taken) throw fail(409, `${user.name} is already a company admin`);
  await db.execute('INSERT INTO company_co_admins (company_admin_id, user_id, created_by) VALUES (?, ?, ?)', [companyAdminId, userId, byUserId || null]);
  forget(userId);
  return user;
}

async function removeCoAdmin(companyAdminId, userId) {
  const [result] = await db.execute('DELETE FROM company_co_admins WHERE company_admin_id = ? AND user_id = ?', [companyAdminId, userId]);
  forget(userId);
  if (!Number(result.affectedRows)) throw fail(404, 'This person is not a company admin');
}

const isCoAdmin = async (userId) => {
  const [[row]] = await db.execute('SELECT id FROM company_co_admins WHERE user_id = ?', [userId]);
  return Boolean(row);
};

module.exports = { ensureCoAdminSchema, companyOfCoAdmin, stillCoAdmin, listCoAdmins, addCoAdmin, removeCoAdmin, isCoAdmin, forgetCoAdmin: forget };
