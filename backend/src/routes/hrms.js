const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { currentOrgRole } = require('../utils/orgMember');
const { isModuleEnabled } = require('../services/orgModules');
const { showAllTasksOn } = require('../services/employeeAccounts');
const { listEmployees, importEmployees, resetEmployeePassword, buildLoginSheet, setShowAllTasks } = require('../services/employeeImport');
const router = express.Router();

// Employees from an HRMS sheet (employee-code sign-in) and the "everyone sees all tasks" switch.
// Each part works only where the super admin turned its module on for the organization.
const sendError = (res, error) => res.status(error.status || 400).json({ error: error.message });

async function requireAdmin(req, res) {
  const role = await currentOrgRole(req);
  if (role !== 'admin') { res.status(403).json({ error: 'Only admins can manage employees' }); return false; }
  return true;
}

async function requireModule(req, res, key, label) {
  if (await isModuleEnabled(req.orgId, key)) return true;
  res.status(403).json({ error: `${label} is not turned on for this organization. Ask GreenTask to enable it.`, code: 'MODULE_OFF' });
  return false;
}

router.get('/status', authenticate, async (req, res) => {
  try {
    if (!req.orgId) return res.json({ hrms_login: false, all_tasks: false, show_all_tasks: false, can_manage: false });
    const role = await currentOrgRole(req);
    const [hrmsLogin, allTasks, [[org]]] = await Promise.all([
      isModuleEnabled(req.orgId, 'hrms_login'),
      isModuleEnabled(req.orgId, 'all_tasks'),
      db.execute('SELECT company_code FROM organizations WHERE id = ?', [req.orgId]),
    ]);
    res.json({
      hrms_login: hrmsLogin,
      all_tasks: allTasks,
      show_all_tasks: allTasks ? await showAllTasksOn(req.orgId) : false,
      can_manage: role === 'admin',
      company_code: org?.company_code || null,
    });
  } catch (error) { sendError(res, error); }
});

router.get('/employees', authenticate, async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    res.json(await listEmployees(req.orgId));
  } catch (error) { sendError(res, error); }
});

router.post('/import', authenticate, async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    if (!await requireModule(req, res, 'hrms_login', 'Employee code sign-in')) return;
    res.json(await importEmployees(req.orgId, req.userId, req.body));
  } catch (error) { sendError(res, error); }
});

// Everyone with email and password in one sheet; new one-time passwords for those not signed in yet.
router.post('/login-sheet', authenticate, async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    if (!await requireModule(req, res, 'hrms_login', 'Employee code sign-in')) return;
    res.json(await buildLoginSheet(req.orgId, { exceptUserId: req.userId }));
  } catch (error) { sendError(res, error); }
});

router.post('/employees/:id/reset-password', authenticate, async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    if (!await requireModule(req, res, 'hrms_login', 'Employee code sign-in')) return;
    if (Number(req.params.id) === Number(req.userId)) return res.status(422).json({ error: 'Change your own password from Settings → Password & security.' });
    res.json(await resetEmployeePassword(req.orgId, Number(req.params.id)));
  } catch (error) { sendError(res, error); }
});

router.put('/settings', authenticate, async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    if (!await requireModule(req, res, 'all_tasks', 'Show all tasks')) return;
    if (typeof req.body.show_all_tasks !== 'boolean') return res.status(422).json({ error: 'show_all_tasks must be true or false' });
    const sync = await setShowAllTasks(req.orgId, req.body.show_all_tasks, req.userId);
    res.json({ show_all_tasks: req.body.show_all_tasks, ...sync });
  } catch (error) { sendError(res, error); }
});

module.exports = router;
