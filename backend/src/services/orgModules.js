const db = require('../config/database');

// Paid add-on modules that can be switched on per organization by the super admin.
// Organizations without a row keep the standard product unchanged.
// hrms_login: employees sign in with their HRMS employee code; admins import them from the HRMS sheet.
// all_tasks: the company admin may let everyone see and get every task, whatever their team.
// communications: sending email to clients through GreenTask's own mail server.
// email_to_task: emails to the organization's inbox become tasks (inbox set in the platform console).
const KNOWN_MODULES = ['timesheet', 'hrms_login', 'all_tasks', 'communications', 'email_to_task'];

const isTrue = (value) => value === true || value === 1;

async function isModuleEnabled(orgId, moduleKey) {
  if (!orgId || !KNOWN_MODULES.includes(moduleKey)) return false;
  const [[row]] = await db.execute(
    'SELECT is_enabled FROM org_modules WHERE org_id = ? AND module_key = ?',
    [orgId, moduleKey]
  );
  return Boolean(row && isTrue(row.is_enabled));
}

async function getModulesForOrgs(orgIds) {
  const ids = (orgIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
  const result = Object.fromEntries(ids.map((id) => [id, Object.fromEntries(KNOWN_MODULES.map((key) => [key, false]))]));
  if (!ids.length) return result;
  const [rows] = await db.execute(
    `SELECT org_id, module_key, is_enabled FROM org_modules WHERE org_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  rows.forEach((row) => {
    if (result[row.org_id] && KNOWN_MODULES.includes(row.module_key)) result[row.org_id][row.module_key] = isTrue(row.is_enabled);
  });
  return result;
}

async function setModuleEnabled(orgId, moduleKey, enabled, updatedBy) {
  await db.execute(
    `MERGE org_modules WITH (HOLDLOCK) AS target
     USING (SELECT ? AS org_id, ? AS module_key) AS source
     ON target.org_id = source.org_id AND target.module_key = source.module_key
     WHEN MATCHED THEN UPDATE SET is_enabled = ?, updated_by = ?, updated_at = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (org_id, module_key, is_enabled, updated_by) VALUES (source.org_id, source.module_key, ?, ?);`,
    [orgId, moduleKey, enabled, updatedBy, enabled, updatedBy]
  );
}

module.exports = { KNOWN_MODULES, isModuleEnabled, getModulesForOrgs, setModuleEnabled };
