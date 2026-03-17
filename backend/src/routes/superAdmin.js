const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const router = express.Router();

// Super admin only middleware
const superAdminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Super admin only' });
  next();
};
router.use(authenticate, superAdminOnly);

// Dashboard: all company_admins with their org counts
router.get('/dashboard', async (req, res) => {
  try {
    const [admins] = await db.execute(
      `SELECT ca.*,
        (SELECT COUNT(*) FROM organizations WHERE company_admin_id = ca.id) as org_count,
        (SELECT COUNT(*) FROM users u JOIN organizations o ON u.org_id = o.id WHERE o.company_admin_id = ca.id AND u.role = 'manager') as manager_count,
        (SELECT COUNT(*) FROM users u JOIN organizations o ON u.org_id = o.id WHERE o.company_admin_id = ca.id AND u.role = 'person') as staff_count
       FROM company_admins ca ORDER BY ca.created_at DESC`
    );
    const [[{ pending }]] = await db.execute("SELECT COUNT(*) as pending FROM company_admins WHERE status = 'pending'");
    res.json({ admins, pending_count: pending });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Get single company_admin detail with their orgs
router.get('/company-admins/:id', async (req, res) => {
  try {
    const [[ca]] = await db.execute('SELECT * FROM company_admins WHERE id = ?', [req.params.id]);
    if (!ca) return res.status(404).json({ error: 'Not found' });
    const [orgs] = await db.execute(
      `SELECT o.*,
        (SELECT COUNT(*) FROM users WHERE org_id = o.id AND role = 'manager') as manager_count,
        (SELECT COUNT(*) FROM users WHERE org_id = o.id AND role = 'person') as staff_count
       FROM organizations o WHERE o.company_admin_id = ?`,
      [req.params.id]
    );
    delete ca.password;
    res.json({ ...ca, organizations: orgs });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Approve company admin + set limits
router.patch('/company-admins/:id/approve', async (req, res) => {
  try {
    const { max_companies = 3, max_managers_per_company = 10, max_staff_per_company = 50 } = req.body;
    const companyAdminId = Number(req.params.id);
    const [[exists]] = await db.execute('SELECT id FROM company_admins WHERE id = ?', [companyAdminId]);
    if (!exists) return res.status(404).json({ error: 'Company admin not found' });

    await db.execute(
      `UPDATE company_admins SET status = 'approved', approved_at = NOW(),
       max_companies = ?, max_managers_per_company = ?, max_staff_per_company = ?
       WHERE id = ?`,
      [max_companies, max_managers_per_company, max_staff_per_company, companyAdminId]
    );
    const bootstrap = await ensureCompanyAdminBootstrap(db, companyAdminId);
    res.json({ message: 'Approved', bootstrap });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Reject
router.patch('/company-admins/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    await db.execute(
      "UPDATE company_admins SET status = 'rejected', rejected_reason = ? WHERE id = ?",
      [reason || 'Not approved', req.params.id]
    );
    res.json({ message: 'Rejected' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update limits
router.patch('/company-admins/:id/limits', async (req, res) => {
  try {
    const { max_companies, max_managers_per_company, max_staff_per_company } = req.body;
    await db.execute(
      'UPDATE company_admins SET max_companies = ?, max_managers_per_company = ?, max_staff_per_company = ? WHERE id = ?',
      [max_companies, max_managers_per_company, max_staff_per_company, req.params.id]
    );
    res.json({ message: 'Limits updated' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
