const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const router = express.Router();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@navtask.com';

// Middleware: verify super admin JWT
const verifySA = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
    req.saEmail = decoded.email;
    req.saName = decoded.name;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

// Log helper
async function saLog(email, name, action, targetType, targetId, description, ip) {
  try {
    await db.execute(
      'INSERT INTO super_admin_logs (actor_email, actor_name, action, target_type, target_id, description, ip_address) VALUES (?,?,?,?,?,?,?)',
      [email, name || email, action, targetType || null, targetId || null, description || null, ip || null]
    );
  } catch {}
}

// Step 1: Enter email → verify if allowed
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(422).json({ error: 'email required' });

    // Check if super admin master email or sub-user
    const isMaster = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    if (isMaster) {
      return res.json({ allowed: true, name: 'Super Admin', is_master: true });
    }

    const [rows] = await db.execute(
      'SELECT * FROM super_admin_users WHERE email = ? AND is_active = TRUE', [email]
    );
    if (rows.length === 0) return res.status(403).json({ error: 'Email not authorized' });

    return res.json({ allowed: true, name: rows[0].name || email, is_master: false });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Step 2: Login (email only — no password for sub-users, master uses env password)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const isMaster = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    if (isMaster) {
      const masterPass = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';
      if (password !== masterPass) return res.status(401).json({ error: 'Invalid password' });
      const token = jwt.sign({ email, name: 'Super Admin', role: 'super_admin', is_master: true }, process.env.JWT_SECRET);
      await saLog(email, 'Super Admin', 'LOGIN', null, null, 'Super Admin logged in', req.ip);
      return res.json({ token, email, name: 'Super Admin', is_master: true });
    }

    // Sub-user: just email verify (no password)
    const [rows] = await db.execute('SELECT * FROM super_admin_users WHERE email = ? AND is_active = TRUE', [email]);
    if (rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

    const token = jwt.sign({ email, name: rows[0].name, role: 'super_admin', is_master: false }, process.env.JWT_SECRET);
    await saLog(email, rows[0].name, 'LOGIN', null, null, `${rows[0].name || email} logged in`, req.ip);
    return res.json({ token, email, name: rows[0].name, is_master: false });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Dashboard stats
router.get('/dashboard', verifySA, async (req, res) => {
  try {
    const [admins] = await db.execute(
      `SELECT ca.*, 
        (SELECT COUNT(*) FROM organizations WHERE company_admin_id = ca.id) as org_count,
        (SELECT COUNT(*) FROM users u JOIN organizations o ON u.org_id = o.id WHERE o.company_admin_id = ca.id) as total_users
       FROM company_admins ca ORDER BY ca.created_at DESC`
    );
    const [[{ pending }]] = await db.execute("SELECT COUNT(*) as pending FROM company_admins WHERE status='pending'");
    const [[{ total_orgs }]] = await db.execute('SELECT COUNT(*) as total_orgs FROM organizations');
    const [[{ total_users }]] = await db.execute('SELECT COUNT(*) as total_users FROM users WHERE is_deleted=FALSE');

    await saLog(req.saEmail, req.saName, 'VIEW_DASHBOARD', null, null, 'Viewed super admin dashboard', req.ip);
    res.json({ admins, pending_count: pending, total_orgs, total_users });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Get company admin detail
router.get('/company-admins/:id', verifySA, async (req, res) => {
  try {
    const [[ca]] = await db.execute('SELECT * FROM company_admins WHERE id = ?', [req.params.id]);
    if (!ca) return res.status(404).json({ error: 'Not found' });
    const [orgs] = await db.execute(
      `SELECT o.*, 
        (SELECT COUNT(*) FROM users WHERE org_id=o.id AND role='manager') as manager_count,
        (SELECT COUNT(*) FROM users WHERE org_id=o.id AND role='person') as staff_count
       FROM organizations o WHERE o.company_admin_id = ?`, [req.params.id]
    );
    delete ca.password;
    res.json({ ...ca, organizations: orgs });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Approve
router.patch('/company-admins/:id/approve', verifySA, async (req, res) => {
  try {
    const { max_companies = 3, max_managers_per_company = 10, max_staff_per_company = 50 } = req.body;
    const companyAdminId = Number(req.params.id);
    const [[ca]] = await db.execute('SELECT id, name, email FROM company_admins WHERE id = ?', [companyAdminId]);
    if (!ca) return res.status(404).json({ error: 'Company admin not found' });

    await db.execute(
      `UPDATE company_admins SET status='approved', approved_at=NOW(), max_companies=?, max_managers_per_company=?, max_staff_per_company=? WHERE id=?`,
      [max_companies, max_managers_per_company, max_staff_per_company, companyAdminId]
    );

    const bootstrap = await ensureCompanyAdminBootstrap(db, companyAdminId);

    await saLog(req.saEmail, req.saName, 'APPROVE_COMPANY', 'company_admin', req.params.id,
      `Approved company admin: ${ca?.name} (${ca?.email}) | Limits: companies=${max_companies}, managers=${max_managers_per_company}, staff=${max_staff_per_company} | Bootstrap user=${bootstrap.linkedUserId}, primary_org=${bootstrap.primaryOrgId}`, req.ip);
    res.json({
      message: 'Approved',
      bootstrap: {
        user_id: bootstrap.linkedUserId,
        primary_org_id: bootstrap.primaryOrgId,
      },
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Reject
router.patch('/company-admins/:id/reject', verifySA, async (req, res) => {
  try {
    const { reason } = req.body;
    const [[ca]] = await db.execute('SELECT name, email FROM company_admins WHERE id = ?', [req.params.id]);
    await db.execute("UPDATE company_admins SET status='rejected', rejected_reason=? WHERE id=?", [reason || 'Not approved', req.params.id]);
    await saLog(req.saEmail, req.saName, 'REJECT_COMPANY', 'company_admin', req.params.id,
      `Rejected: ${ca?.name} (${ca?.email}) | Reason: ${reason}`, req.ip);
    res.json({ message: 'Rejected' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update limits
router.patch('/company-admins/:id/limits', verifySA, async (req, res) => {
  try {
    const { max_companies, max_managers_per_company, max_staff_per_company } = req.body;
    const [[ca]] = await db.execute('SELECT name FROM company_admins WHERE id = ?', [req.params.id]);
    await db.execute(
      'UPDATE company_admins SET max_companies=?, max_managers_per_company=?, max_staff_per_company=? WHERE id=?',
      [max_companies, max_managers_per_company, max_staff_per_company, req.params.id]
    );
    await saLog(req.saEmail, req.saName, 'UPDATE_LIMITS', 'company_admin', req.params.id,
      `Updated limits for ${ca?.name}: companies=${max_companies}, managers=${max_managers_per_company}, staff=${max_staff_per_company}`, req.ip);
    res.json({ message: 'Limits updated' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Sub-users management (master only)
router.get('/sub-users', verifySA, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, email, name, is_active, created_at FROM super_admin_users ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/sub-users', verifySA, async (req, res) => {
  try {
    if (!req.saEmail || req.saEmail.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Only master super admin can add sub-users' });
    }
    const { email, name } = req.body;
    await db.execute('INSERT IGNORE INTO super_admin_users (email, name) VALUES (?, ?)', [email, name || null]);
    await saLog(req.saEmail, req.saName, 'ADD_SUB_USER', 'super_admin_user', null, `Added sub-user: ${email}`, req.ip);
    res.json({ message: 'Sub-user added' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/sub-users/:id', verifySA, async (req, res) => {
  try {
    const [[u]] = await db.execute('SELECT email FROM super_admin_users WHERE id = ?', [req.params.id]);
    await db.execute('UPDATE super_admin_users SET is_active = FALSE WHERE id = ?', [req.params.id]);
    await saLog(req.saEmail, req.saName, 'REMOVE_SUB_USER', 'super_admin_user', req.params.id, `Removed sub-user: ${u?.email}`, req.ip);
    res.json({ message: 'Removed' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Activity logs
router.get('/logs', verifySA, async (req, res) => {
  try {
    const { actor, limit = 100 } = req.query;
    let query = 'SELECT * FROM super_admin_logs';
    const params = [];
    if (actor) { query += ' WHERE actor_email = ?'; params.push(actor); }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const [logs] = await db.execute(query, params);
    res.json(logs);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = { router, verifySA, saLog };
