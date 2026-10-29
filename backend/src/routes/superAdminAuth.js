const express = require('express');
const db = require('../config/database');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const { saLog, verifySA } = require('../services/superAdminAccess');
const { KNOWN_MODULES, getModulesForOrgs, setModuleEnabled } = require('../services/orgModules');
const { syncAllTasksMembership } = require('../services/employeeAccounts');
const { listEmployees, importEmployees, buildLoginSheet, setShowAllTasks } = require('../services/employeeImport');
const { isModuleEnabled } = require('../services/orgModules');
const { seal, open } = require('../services/secretBox');
const { testInbox } = require('../utils/emailToTask');
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
    // "Show all tasks" works the moment it is turned on, with no extra step for the company admin
    // (they can still turn it off in Settings). Turning it off takes the extra access back at once.
    if (moduleKey === 'all_tasks') {
      if (req.body.enabled) await setShowAllTasks(orgId, true, null);
      else await syncAllTasksMembership(orgId);
    }
    await saLog(req.saEmail, req.saName, req.body.enabled ? 'ENABLE_MODULE' : 'DISABLE_MODULE', 'organization', orgId,
      `${req.body.enabled ? 'Enabled' : 'Disabled'} ${moduleKey} for ${org.name}`, req.ip);
    res.json({ org_id: orgId, module: moduleKey, enabled: req.body.enabled });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Employees of one organization, imported from its HRMS sheet by the platform team, so the company
// admin has nothing to set up. Needs the "Employee code login" module.
async function hrmsOrg(req, res) {
  const orgId = Number(req.params.id);
  if (!Number.isSafeInteger(orgId) || orgId < 1) { res.status(422).json({ error: 'Invalid organization' }); return null; }
  const [[org]] = await db.execute('SELECT id, name, company_code FROM organizations WHERE id = ?', [orgId]);
  if (!org) { res.status(404).json({ error: 'Organization not found' }); return null; }
  return org;
}
const needsHrms = async (org, res) => {
  if (await isModuleEnabled(org.id, 'hrms_login')) return true;
  res.status(403).json({ error: 'Turn on "Employee code login" for this organization first.', code: 'MODULE_OFF' });
  return false;
};

router.get('/organizations/:id/employees', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org) return;
    res.json({ organization: org, enabled: await isModuleEnabled(org.id, 'hrms_login'), employees: await listEmployees(org.id) });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

router.post('/organizations/:id/employees/import', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org || !await needsHrms(org, res)) return;
    const result = await importEmployees(org.id, null, req.body);
    await saLog(req.saEmail, req.saName, 'IMPORT_EMPLOYEES', 'organization', org.id,
      `Imported employees for ${org.name}: ${result.created} new, ${result.updated} updated, ${result.deactivated} turned off`, req.ip);
    res.json(result);
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

router.post('/organizations/:id/employees/login-sheet', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org || !await needsHrms(org, res)) return;
    const people = await buildLoginSheet(org.id);
    await saLog(req.saEmail, req.saName, 'LOGIN_SHEET', 'organization', org.id,
      `Downloaded the login sheet for ${org.name} (${people.filter((p) => p.password).length} new one-time passwords)`, req.ip);
    res.json({ organization: org, people });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

// "Email to task": one inbox per organization. Emails to it become tasks in the chosen team.
// The password is stored sealed and is never sent back to the browser.
const inboxView = (row) => (row ? {
  host: row.host, port: row.port, username: row.username, team_id: row.team_id, has_password: Boolean(row.secret),
  last_checked_at: row.last_checked_at, last_error: row.last_error, tasks_created: row.tasks_created,
} : null);

function readInbox(body, needsPassword) {
  const host = String(body.host || '').trim().toLowerCase();
  const username = String(body.username || '').trim();
  const port = Number(body.port || 993);
  const password = String(body.password || '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { error: 'Enter the IMAP server, for example imap.gmail.com' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'Enter a valid port (usually 993)' };
  if (!username || username.length > 255) return { error: 'Enter the inbox email address' };
  if (needsPassword && !password) return { error: 'Enter the inbox password (app password)' };
  if (password.length > 500) return { error: 'The password is too long' };
  return { inbox: { host, port, username, password } };
}

router.get('/organizations/:id/email-inbox', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org) return;
    const [[row]] = await db.execute('SELECT * FROM org_email_inboxes WHERE org_id = ?', [org.id]);
    const [teams] = await db.execute('SELECT id, name FROM teams WHERE org_id = ? AND is_deleted = 0 ORDER BY name', [org.id]);
    res.json({ organization: org, enabled: await isModuleEnabled(org.id, 'email_to_task'), inbox: inboxView(row), teams });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

router.post('/organizations/:id/email-inbox/test', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org) return;
    const [[saved]] = await db.execute('SELECT secret FROM org_email_inboxes WHERE org_id = ?', [org.id]);
    const { inbox, error } = readInbox(req.body, !saved);
    if (error) return res.status(422).json({ error });
    try {
      await testInbox({ host: inbox.host, port: inbox.port, user: inbox.username, pass: inbox.password || open(saved.secret) });
      res.json({ ok: true, message: 'Signed in to the inbox.' });
    } catch (connectError) {
      res.status(422).json({ ok: false, error: `Could not sign in: ${String(connectError.message).slice(0, 300)}` });
    }
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

router.put('/organizations/:id/email-inbox', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org) return;
    const [[saved]] = await db.execute('SELECT secret FROM org_email_inboxes WHERE org_id = ?', [org.id]);
    const { inbox, error } = readInbox(req.body, !saved);
    if (error) return res.status(422).json({ error });
    const teamId = Number(req.body.team_id);
    const [[team]] = await db.execute('SELECT id, name FROM teams WHERE id = ? AND org_id = ? AND is_deleted = 0', [teamId || 0, org.id]);
    if (!team) return res.status(422).json({ error: 'Choose the team that gets the new tasks' });
    const secret = inbox.password ? seal(inbox.password) : saved.secret;
    await db.execute(
      `MERGE org_email_inboxes WITH (HOLDLOCK) AS target
       USING (SELECT ? AS org_id) AS source ON target.org_id = source.org_id
       WHEN MATCHED THEN UPDATE SET host = ?, port = ?, username = ?, secret = ?, team_id = ?, last_error = NULL, updated_by = ?, updated_at = SYSDATETIME()
       WHEN NOT MATCHED THEN INSERT (org_id, host, port, username, secret, team_id, updated_by) VALUES (source.org_id, ?, ?, ?, ?, ?, ?);`,
      [org.id, inbox.host, inbox.port, inbox.username, secret, team.id, req.saEmail, inbox.host, inbox.port, inbox.username, secret, team.id, req.saEmail]
    );
    await saLog(req.saEmail, req.saName, 'SAVE_EMAIL_INBOX', 'organization', org.id, `Email to task inbox for ${org.name}: ${inbox.username} → team ${team.name}`, req.ip);
    const [[row]] = await db.execute('SELECT * FROM org_email_inboxes WHERE org_id = ?', [org.id]);
    res.json({ inbox: inboxView(row) });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

router.delete('/organizations/:id/email-inbox', verifySA, async (req, res) => {
  try {
    const org = await hrmsOrg(req, res);
    if (!org) return;
    await db.execute('DELETE FROM org_email_inboxes WHERE org_id = ?', [org.id]);
    await saLog(req.saEmail, req.saName, 'REMOVE_EMAIL_INBOX', 'organization', org.id, `Removed the email to task inbox for ${org.name}`, req.ip);
    res.json({ inbox: null });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
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
