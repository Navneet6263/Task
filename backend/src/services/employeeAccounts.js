const crypto = require('crypto');
const db = require('../config/database');
const { isModuleEnabled } = require('./orgModules');

// Employees imported from an HRMS sheet often have no email. Their account gets a placeholder
// address on a reserved domain (.invalid never delivers) until they add their own.
const PLACEHOLDER_DOMAIN = 'no-email.invalid';

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
const isValidCode = (code) => /^[A-Z0-9][A-Z0-9_.\-/]{0,49}$/.test(code);
const placeholderEmail = (code, orgId) => `${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}.${orgId}@${PLACEHOLDER_DOMAIN}`;
const isPlaceholderEmail = (email) => String(email || '').toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`);
const visibleEmail = (email) => (isPlaceholderEmail(email) ? '' : email || '');
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '')) && String(value).length <= 255;

// Easy to read out loud or type: no 0/O or 1/I/L. Example: KMPT-4827.
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
function temporaryPassword() {
  const letters = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
  return `${letters}-${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
}

// Fields every login response carries so the app can ask for a new password or an email first.
const accountFlags = (user) => ({
  must_change_password: Boolean(user.must_change_password === true || user.must_change_password === 1),
  needs_email: isPlaceholderEmail(user.email),
  login_code: user.login_code || null,
});

// "Show all tasks": the super admin turned the module on AND the company admin switched it on.
async function showAllTasksOn(orgId) {
  if (!orgId || !await isModuleEnabled(orgId, 'all_tasks')) return false;
  const [[row]] = await db.execute('SELECT show_all_tasks FROM org_task_settings WHERE org_id = ?', [orgId]);
  return Boolean(row && (row.show_all_tasks === true || row.show_all_tasks === 1));
}

const memberOfOrg = `(u.org_id = t.org_id OR EXISTS (SELECT 1 FROM user_org_access oa WHERE oa.user_id = u.id AND oa.org_id = t.org_id))`;

// Task access follows team membership everywhere in the app, so "everyone sees all tasks" puts every
// active member in every team of the organization. Those memberships are marked auto_added; when the
// switch goes off they are removed again, except where the person has tasks in that team.
async function syncAllTasksMembership(orgId) {
  if (!orgId) return { added: 0, removed: 0 };
  if (await showAllTasksOn(orgId)) {
    const [result] = await db.execute(
      `INSERT INTO team_members (team_id, user_id, role, auto_added)
       SELECT t.id, u.id, 'Member', 1
       FROM teams t JOIN users u ON ${memberOfOrg}
       WHERE t.org_id = ? AND t.is_deleted = 0 AND u.is_deleted = 0 AND u.role IN ('admin', 'manager', 'person')
         AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = u.id)`,
      [orgId]
    );
    return { added: Number(result?.affectedRows || 0), removed: 0 };
  }
  await db.execute(
    `UPDATE tm SET auto_added = 0 FROM team_members tm JOIN teams t ON t.id = tm.team_id
     WHERE t.org_id = ? AND tm.auto_added = 1
       AND EXISTS (SELECT 1 FROM tasks k WHERE k.team_id = tm.team_id AND k.is_deleted = 0 AND (k.assigned_to = tm.user_id OR k.assigned_by = tm.user_id))`,
    [orgId]
  );
  const [result] = await db.execute(
    'DELETE tm FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.org_id = ? AND tm.auto_added = 1',
    [orgId]
  );
  return { added: 0, removed: Number(result?.affectedRows || 0) };
}

// Background safety net: keeps new people and new teams in step, and cleans up orgs switched off.
async function syncAllTasksEverywhere() {
  const [rows] = await db.execute(
    `SELECT DISTINCT org_id FROM (
       SELECT s.org_id FROM org_task_settings s
       JOIN org_modules m ON m.org_id = s.org_id AND m.module_key = 'all_tasks' AND m.is_enabled = 1
       WHERE s.show_all_tasks = 1
       UNION
       SELECT t.org_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.auto_added = 1
     ) x`
  );
  for (const row of rows) await syncAllTasksMembership(row.org_id);
}

// Never let a background sync break the request that triggered it.
const syncQuietly = (orgId) => syncAllTasksMembership(orgId).catch((error) => console.error('[all-tasks] sync failed', error.message));

module.exports = {
  PLACEHOLDER_DOMAIN, normalizeCode, isValidCode, placeholderEmail, isPlaceholderEmail, visibleEmail, isEmail,
  temporaryPassword, accountFlags, showAllTasksOn, syncAllTasksMembership, syncAllTasksEverywhere, syncQuietly,
};
