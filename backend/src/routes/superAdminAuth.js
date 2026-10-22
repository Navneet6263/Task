const express = require('express');
const db = require('../config/database');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const { saLog, verifySA } = require('../services/superAdminAccess');
const { KNOWN_MODULES, getModulesForOrgs, setModuleEnabled } = require('../services/orgModules');
const router = express.Router();

// Sign-in (password + email code), password setup, and helper access live in their own routers.
router.use(require('./superAdminLogin'));
router.use(require('./superAdminTeam'));

const LIMIT_KEYS = ['max_companies', 'max_managers_per_company', 'max_staff_per_company'];
const LIMIT_DEFAULTS = { max_companies: 3, max_managers_per_company: 10, max_staff_per_company: 50 };
// Account limits must be whole numbers between 1 and 100000. Missing values use the defaults.
function readLimits(body, defaults) {
  const limits = {};
  for (const key of LIMIT_KEYS) {
    const value = Number(body?.[key] ?? defaults?.[key]);
    if (!Number.isInteger(value) || value < 1 || value > 100000) return { error: `${key.replace(/_/g, ' ')} must be a whole number from 1 to 100000` };
    limits[key] = value;
  }
  return { limits };
}

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
    // Separate query so the detail view still loads if the modules table is missing.
    let modules = {};
    try { modules = await getModulesForOrgs(orgs.map((org) => org.id)); } catch (error) { console.error('[sa] modules lookup failed', error.message); }
    res.json({ ...ca, organizations: orgs.map((org) => ({ ...org, modules: modules[org.id] || {} })) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Turn a paid add-on module on or off for one organization.
router.patch('/organizations/:id/modules/:moduleKey', verifySA, async (req, res) => {
  try {
    const orgId = Number(req.params.id);
    const { moduleKey } = req.params;
    if (!Number.isSafeInteger(orgId) || orgId < 1) return res.status(422).json({ error: 'Invalid organization' });
    if (!KNOWN_MODULES.includes(moduleKey)) return res.status(422).json({ error: 'Unknown module' });
    if (typeof req.body.enabled !== 'boolean') return res.status(422).json({ error: 'enabled must be true or false' });
    const [[org]] = await db.execute('SELECT id, name FROM organizations WHERE id = ?', [orgId]);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    await setModuleEnabled(orgId, moduleKey, req.body.enabled, req.saEmail);
    await saLog(req.saEmail, req.saName, req.body.enabled ? 'ENABLE_MODULE' : 'DISABLE_MODULE', 'organization', orgId,
      `${req.body.enabled ? 'Enabled' : 'Disabled'} ${moduleKey} for ${org.name}`, req.ip);
    res.json({ org_id: orgId, module: moduleKey, enabled: req.body.enabled });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/company-admins/:id/approve', verifySA, async (req, res) => {
  try {
    const { limits, error } = readLimits(req.body, LIMIT_DEFAULTS);
    if (error) return res.status(422).json({ error });
    const { max_companies, max_managers_per_company, max_staff_per_company } = limits;
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
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(422).json({ error: 'A reason is required to reject a company' });
    if (reason.length > 1000) return res.status(422).json({ error: 'Keep the reason under 1000 characters' });
    const [[ca]] = await db.execute('SELECT name, email FROM company_admins WHERE id = ?', [req.params.id]);
    if (!ca) return res.status(404).json({ error: 'Company admin not found' });
    await db.execute("UPDATE company_admins SET status='rejected', rejected_reason=? WHERE id=?", [reason, req.params.id]);
    await saLog(req.saEmail, req.saName, 'REJECT_COMPANY', 'company_admin', req.params.id,
      `Rejected: ${ca?.name} (${ca?.email}) | Reason: ${reason}`, req.ip);
    res.json({ message: 'Rejected' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Update limits
router.patch('/company-admins/:id/limits', verifySA, async (req, res) => {
  try {
    const { limits, error } = readLimits(req.body);
    if (error) return res.status(422).json({ error });
    const { max_companies, max_managers_per_company, max_staff_per_company } = limits;
    const [[ca]] = await db.execute('SELECT name FROM company_admins WHERE id = ?', [req.params.id]);
    if (!ca) return res.status(404).json({ error: 'Company admin not found' });
    await db.execute(
      'UPDATE company_admins SET max_companies=?, max_managers_per_company=?, max_staff_per_company=? WHERE id=?',
      [max_companies, max_managers_per_company, max_staff_per_company, req.params.id]
    );
    await saLog(req.saEmail, req.saName, 'UPDATE_LIMITS', 'company_admin', req.params.id,
      `Updated limits for ${ca?.name}: companies=${max_companies}, managers=${max_managers_per_company}, staff=${max_staff_per_company}`, req.ip);
    res.json({ message: 'Limits updated' });
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
    params.push(Math.min(500, Math.max(1, parseInt(limit, 10) || 100)));
    const [logs] = await db.execute(query, params);
    res.json(logs);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = { router, verifySA, saLog };
