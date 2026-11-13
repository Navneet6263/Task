const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { generateCompanyCode } = require('../utils/companyAdminBootstrap');
const { ensureUniqueEmployeeId } = require('../utils/employeeId');
const { ensureUserOrgAccessTable } = require('../utils/orgAccess');
const { pickedLeads, applyLeadsForRole, leadsFor } = require('../services/teamLeads');
const { strongTemporaryPassword } = require('../services/companyAccounts');
const coAdmins = require('../services/coAdmins');
const { resetUserPassword } = require('../services/passwordReset');

const router = express.Router();

const companyAdminOnly = (req, res, next) => {
  if (req.userRole !== 'company_admin') {
    return res.status(403).json({ error: 'Company admin access required' });
  }
  if (!req.companyAdminId) {
    return res.status(403).json({ error: 'Company admin identity missing in token' });
  }
  next();
};

router.use(authenticate, companyAdminOnly);

const slugify = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const getCompanyOrgIds = async (companyAdminId) => {
  const [orgs] = await db.execute(
    'SELECT id FROM organizations WHERE company_admin_id = ? ORDER BY id ASC',
    [companyAdminId]
  );
  return orgs.map((org) => org.id);
};

const orgBelongsToCompanyAdmin = async (companyAdminId, orgId) => {
  const [[org]] = await db.execute(
    'SELECT id FROM organizations WHERE id = ? AND company_admin_id = ? LIMIT 1',
    [orgId, companyAdminId]
  );
  return Boolean(org);
};

const inClause = (ids) => ids.map(() => '?').join(',');

router.get('/overview', async (req, res) => {
  try {
    const [[companyAdmin]] = await db.execute(
      `SELECT id, name, email, status, approved_at, max_companies, max_managers_per_company, max_staff_per_company
       FROM company_admins WHERE id = ?`,
      [req.companyAdminId]
    );
    if (!companyAdmin) return res.status(404).json({ error: 'Company admin not found' });

    const orgIds = await getCompanyOrgIds(req.companyAdminId);
    if (orgIds.length === 0) {
      return res.json({
        company_admin: companyAdmin,
        limits: {
          max_companies: companyAdmin.max_companies,
          max_managers_per_company: companyAdmin.max_managers_per_company,
          max_staff_per_company: companyAdmin.max_staff_per_company,
        },
        stats: { organizations: 0, users: 0, admins: 0, managers: 0, staff: 0 },
      });
    }

    const placeholders = inClause(orgIds);
    const [[usersSummary]] = await db.execute(
      `SELECT
         COUNT(*) as total_users,
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
         SUM(CASE WHEN role = 'manager' THEN 1 ELSE 0 END) as managers,
         SUM(CASE WHEN role = 'person' THEN 1 ELSE 0 END) as staff
       FROM users
       WHERE is_deleted = FALSE AND org_id IN (${placeholders})`,
      orgIds
    );

    res.json({
      company_admin: companyAdmin,
      limits: {
        max_companies: companyAdmin.max_companies,
        max_managers_per_company: companyAdmin.max_managers_per_company,
        max_staff_per_company: companyAdmin.max_staff_per_company,
      },
      stats: {
        organizations: orgIds.length,
        users: Number(usersSummary.total_users || 0),
        admins: Number(usersSummary.admins || 0),
        managers: Number(usersSummary.managers || 0),
        staff: Number(usersSummary.staff || 0),
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/organizations', async (req, res) => {
  try {
    const [orgs] = await db.execute(
      `SELECT o.*,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.is_deleted = FALSE) as user_count,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.is_deleted = FALSE AND u.role = 'admin') as admin_count,
        (SELECT COUNT(*) FROM teams t WHERE t.org_id = o.id AND t.is_deleted = FALSE) as team_count
       FROM organizations o
       WHERE o.company_admin_id = ?
       ORDER BY o.created_at DESC`,
      [req.companyAdminId]
    );
    res.json(orgs);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/organizations', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ error: 'Workspace name required' });

    const [[limits]] = await db.execute(
      'SELECT max_companies FROM company_admins WHERE id = ?',
      [req.companyAdminId]
    );
    const [[current]] = await db.execute(
      'SELECT COUNT(*) as count FROM organizations WHERE company_admin_id = ?',
      [req.companyAdminId]
    );

    if (limits && Number(current.count) >= Number(limits.max_companies || 0)) {
      return res.status(403).json({ error: 'Workspace limit reached for this company account' });
    }

    const cleanName = String(name).trim();
    const slug = `${slugify(cleanName)}-${Date.now()}`;
    const code = await generateCompanyCode(db, cleanName);

    const [result] = await db.execute(
      `INSERT INTO organizations (name, slug, company_code, company_admin_id)
       VALUES (?, ?, ?, ?)`,
      [cleanName, slug, code, req.companyAdminId]
    );

    res.status(201).json({
      id: result.insertId,
      name: cleanName,
      company_code: code,
      company_admin_id: req.companyAdminId,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Edit an organization: its name and the letters in front of task numbers (ACC-142).
// The company code never changes here: people already use it to join.
const PREFIX_RE = /^[A-Z][A-Z0-9]{1,5}$/;
router.patch('/organizations/:id', async (req, res) => {
  try {
    const orgId = Number(req.params.id);
    if (!orgId || !(await orgBelongsToCompanyAdmin(req.companyAdminId, orgId))) return res.status(404).json({ error: 'Workspace not found' });
    const sets = [];
    const params = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name ?? '').trim().replace(/\s+/g, ' ');
      if (name.length < 2) return res.status(422).json({ error: 'Type the workspace name', fields: { name: 'Name is required' } });
      if (name.length > 120) return res.status(422).json({ error: 'Workspace name must be at most 120 characters', fields: { name: 'Too long' } });
      sets.push('name = ?'); params.push(name);
    }
    if (req.body?.task_prefix !== undefined) {
      const prefix = String(req.body.task_prefix ?? '').trim().toUpperCase();
      if (prefix && !PREFIX_RE.test(prefix)) {
        return res.status(422).json({ error: 'Task code must be 2 to 6 letters or numbers, starting with a letter', fields: { task_prefix: '2 to 6 letters or numbers' } });
      }
      sets.push('task_prefix = ?'); params.push(prefix || null);
    }
    if (!sets.length) return res.status(422).json({ error: 'Nothing to change' });
    await db.execute(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ? AND company_admin_id = ?`, [...params, orgId, req.companyAdminId]);
    const [[org]] = await db.execute('SELECT id, name, company_code, task_prefix FROM organizations WHERE id = ?', [orgId]);
    res.json(org);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const orgIds = await getCompanyOrgIds(req.companyAdminId);
    if (orgIds.length === 0) return res.json([]);

    const orgFilter = req.query.org_id ? Number(req.query.org_id) : null;
    if (orgFilter && !orgIds.includes(orgFilter)) {
      return res.status(403).json({ error: 'Workspace access denied' });
    }

    const roleFilter = req.query.role ? String(req.query.role) : '';
    const allowedRoles = ['admin', 'manager', 'person'];
    if (roleFilter && !allowedRoles.includes(roleFilter)) {
      return res.status(422).json({ error: 'Invalid role filter' });
    }

    const targetOrgIds = orgFilter ? [orgFilter] : orgIds;
    const placeholders = inClause(targetOrgIds);
    let sql = `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.org_id, u.created_at,
      o.name as org_name, o.company_code
      FROM users u
      JOIN organizations o ON o.id = u.org_id
      WHERE u.is_deleted = FALSE AND u.org_id IN (${placeholders})`;
    const params = [...targetOrgIds];

    if (roleFilter) {
      sql += ' AND u.role = ?';
      params.push(roleFilter);
    }

    sql += ' ORDER BY u.created_at DESC';

    const [users] = await db.execute(sql, params);
    const leads = await leadsFor(users.map((u) => u.id));
    res.json(users.map((u) => ({ ...u, leads: leads[u.id] || [] })));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/users/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.json([]);

    const orgIds = await getCompanyOrgIds(req.companyAdminId);
    if (orgIds.length === 0) return res.json([]);

    const placeholders = inClause(orgIds);
    const like = `%${query}%`;
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.role, u.org_id, o.name as org_name
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.is_deleted = FALSE
         AND u.org_id IN (${placeholders})
         AND u.role IN ('admin', 'manager')
         AND (u.name LIKE ? OR u.email LIKE ?)
       ORDER BY u.name ASC
       LIMIT 25`,
      [...orgIds, like, like]
    );

    res.json(rows);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// A new organization admin. The password is made here and shown once; they choose their own at first sign-in.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
router.post('/admins', async (req, res) => {
  try {
    const { org_id, mobile, employee_id } = req.body || {};
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!name || !email || !org_id) return res.status(422).json({ error: 'Name, email and workspace are required' });
    if (!EMAIL_RE.test(email)) return res.status(422).json({ error: 'Type a valid email address', fields: { email: 'Not a valid email' } });

    const orgId = Number(org_id);
    if (!orgId || !(await orgBelongsToCompanyAdmin(req.companyAdminId, orgId))) {
      return res.status(403).json({ error: 'Workspace access denied' });
    }

    const [[limits]] = await db.execute(
      'SELECT max_managers_per_company FROM company_admins WHERE id = ?',
      [req.companyAdminId]
    );
    const [[existingAdmins]] = await db.execute(
      `SELECT COUNT(*) as count
       FROM users
       WHERE org_id = ? AND is_deleted = FALSE AND role IN ('admin', 'manager')`,
      [orgId]
    );

    if (limits && Number(existingAdmins.count) >= Number(limits.max_managers_per_company || 0)) {
      return res.status(403).json({ error: 'Manager and admin limit reached for this workspace' });
    }

    const [[taken]] = await db.execute('SELECT id FROM users WHERE email = ? AND is_deleted = FALSE', [email]);
    if (taken) return res.status(409).json({ error: `${email} already has an account. Pick them from "Someone already here" instead.`, fields: { email: 'Already has an account' } });

    const password = String(req.body?.password || '') || strongTemporaryPassword();
    if (password.length < 8) return res.status(422).json({ error: 'The password must be at least 8 characters', fields: { password: 'At least 8 characters' } });
    const hashed = await bcrypt.hash(password, 10);
    const safeEmployeeId = await ensureUniqueEmployeeId(db, employee_id, 'ADM');
    const [result] = await db.execute(
      `INSERT INTO users (name, email, password, mobile, employee_id, role, org_id, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, email, hashed, mobile || null, safeEmployeeId, 'admin', orgId]
    );

    res.status(201).json({
      message: 'Organization admin created',
      id: result.insertId,
      role: 'admin',
      org_id: orgId,
      email,
      // Shown once on screen; only the hash is stored.
      temporary_password: password,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' || error.number === 2627 || error.number === 2601) {
      return res.status(400).json({ error: 'Email or employee id already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

// A new password for someone in one of your organizations: typed here or made for them, shown once.
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const [[target]] = await db.execute(
      `SELECT u.id, u.email, u.org_id FROM users u JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ? AND u.is_deleted = FALSE AND o.company_admin_id = ?`,
      [Number(req.params.id), req.companyAdminId]
    );
    if (!target) return res.status(404).json({ error: 'User not found in your workspaces' });
    if (Number(target.id) === Number(req.userId)) return res.status(400).json({ error: 'Change your own password from your profile.' });
    res.json(await resetUserPassword(target, { password: req.body?.password, mustChange: req.body?.must_change !== false }));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, ...(error.fields ? { fields: error.fields } : {}) });
  }
});

// Company admins: the owner and the co-admins who run the company with them.
router.get('/company-admins', async (req, res) => {
  try {
    const [[owner]] = await db.execute('SELECT id, name, email FROM company_admins WHERE id = ?', [req.companyAdminId]);
    res.json({ owner, co_admins: await coAdmins.listCoAdmins(req.companyAdminId), me: req.userId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/company-admins', async (req, res) => {
  try {
    const user = await coAdmins.addCoAdmin(req.companyAdminId, Number(req.body?.user_id), req.userId);
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.delete('/company-admins/:userId', async (req, res) => {
  try {
    await coAdmins.removeCoAdmin(req.companyAdminId, Number(req.params.userId));
    res.json({ message: 'Removed as company admin' });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

const coAdminGuard = async (userId, res) => {
  if (!(await coAdmins.isCoAdmin(userId))) return false;
  res.status(409).json({ error: 'This person is a company admin. Remove them under Company admins first.' });
  return true;
};

router.put('/users/:id/role', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const { role } = req.body;
    const allowedRoles = ['admin', 'manager', 'person'];
    if (!allowedRoles.includes(role)) return res.status(422).json({ error: 'Invalid role' });

    const [[target]] = await db.execute(
      `SELECT u.id, u.org_id, u.role, u.email
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ? AND u.is_deleted = FALSE AND o.company_admin_id = ?`,
      [targetUserId, req.companyAdminId]
    );
    if (!target) return res.status(404).json({ error: 'User not found in your workspaces' });
    if (role !== 'admin' && await coAdminGuard(targetUserId, res)) return;

    const [[companyAdmin]] = await db.execute(
      'SELECT email FROM company_admins WHERE id = ?',
      [req.companyAdminId]
    );
    if (companyAdmin && target.email === companyAdmin.email && role !== 'admin') {
      return res.status(400).json({ error: 'Primary company admin account must remain admin' });
    }

    if (['admin', 'manager'].includes(role) && !['admin', 'manager'].includes(target.role)) {
      const [[limits]] = await db.execute(
        'SELECT max_managers_per_company FROM company_admins WHERE id = ?',
        [req.companyAdminId]
      );
      const [[count]] = await db.execute(
        `SELECT COUNT(*) as count
         FROM users
         WHERE org_id = ? AND is_deleted = FALSE AND role IN ('admin', 'manager')`,
        [target.org_id]
      );
      if (limits && Number(count.count) >= Number(limits.max_managers_per_company || 0)) {
        return res.status(403).json({ error: 'Manager and admin limit reached for this workspace' });
      }
    }

    const leadIds = await pickedLeads(target.org_id, role, req.body);
    await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
    await applyLeadsForRole(targetUserId, role, leadIds);
    res.json({ message: 'Role updated' });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const [[target]] = await db.execute(
      `SELECT u.id, u.email
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ? AND u.is_deleted = FALSE AND o.company_admin_id = ?`,
      [targetUserId, req.companyAdminId]
    );

    if (!target) return res.status(404).json({ error: 'User not found in your workspaces' });
    if (await coAdminGuard(targetUserId, res)) return;

    const [[companyAdmin]] = await db.execute(
      'SELECT email FROM company_admins WHERE id = ?',
      [req.companyAdminId]
    );
    if (companyAdmin && target.email === companyAdmin.email) {
      return res.status(400).json({ error: 'Primary company admin account cannot be deleted' });
    }

    await db.execute(
      'UPDATE users SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?',
      [targetUserId]
    );
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/users/:id/org-access', async (req, res) => {
  try {
    await ensureUserOrgAccessTable(db);
    const targetUserId = Number(req.params.id);

    const [[user]] = await db.execute(
      `SELECT u.id, u.name, u.email, u.role, u.org_id
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ? AND u.is_deleted = FALSE AND o.company_admin_id = ?`,
      [targetUserId, req.companyAdminId]
    );
    if (!user) return res.status(404).json({ error: 'User not found in your workspaces' });

    const [orgs] = await db.execute(
      `SELECT o.id, o.name, o.company_code,
        CASE
          WHEN o.id = ? THEN TRUE
          WHEN uoa.id IS NOT NULL THEN TRUE
          ELSE FALSE
        END as has_access,
        CASE WHEN o.id = ? THEN TRUE ELSE FALSE END as is_primary
       FROM organizations o
       LEFT JOIN user_org_access uoa ON uoa.org_id = o.id AND uoa.user_id = ?
       WHERE o.company_admin_id = ?
       ORDER BY o.name ASC`,
      [user.org_id, user.org_id, targetUserId, req.companyAdminId]
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        primary_org_id: user.org_id,
      },
      organizations: orgs,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/org-access', async (req, res) => {
  try {
    await ensureUserOrgAccessTable(db);
    const targetUserId = Number(req.body.user_id);
    const targetOrgId = Number(req.body.org_id);
    if (!targetUserId || !targetOrgId) {
      return res.status(422).json({ error: 'user_id and org_id are required' });
    }

    if (!(await orgBelongsToCompanyAdmin(req.companyAdminId, targetOrgId))) {
      return res.status(403).json({ error: 'Workspace access denied' });
    }

    const [[user]] = await db.execute(
      `SELECT u.id, u.role, u.org_id
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ? AND u.is_deleted = FALSE AND o.company_admin_id = ?`,
      [targetUserId, req.companyAdminId]
    );
    if (!user) return res.status(404).json({ error: 'User not found in your workspaces' });
    if (!['admin', 'manager'].includes(user.role)) {
      return res.status(400).json({ error: 'Only admin or manager can be assigned to multiple workspaces' });
    }
    if (Number(user.org_id) === targetOrgId) {
      return res.status(400).json({ error: 'Primary workspace is already assigned' });
    }

    await db.execute(
      'INSERT IGNORE INTO user_org_access (user_id, org_id, created_by) VALUES (?, ?, ?)',
      [targetUserId, targetOrgId, req.userId]
    );

    res.json({ message: 'Organization access assigned' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/org-access/:userId/:orgId', async (req, res) => {
  try {
    await ensureUserOrgAccessTable(db);
    const targetUserId = Number(req.params.userId);
    const targetOrgId = Number(req.params.orgId);

    const [[user]] = await db.execute(
      `SELECT u.id, u.org_id
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = ? AND u.is_deleted = FALSE AND o.company_admin_id = ?`,
      [targetUserId, req.companyAdminId]
    );
    if (!user) return res.status(404).json({ error: 'User not found in your workspaces' });
    if (Number(user.org_id) === targetOrgId) {
      return res.status(400).json({ error: 'Primary workspace access cannot be removed' });
    }

    await db.execute(
      'DELETE FROM user_org_access WHERE user_id = ? AND org_id = ?',
      [targetUserId, targetOrgId]
    );

    res.json({ message: 'Organization access removed' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
