const db = require('../config/database');

// Organization client list. Task forms read it; managers and admins maintain it in Settings.
const MANAGERS = ['admin', 'manager', 'company_admin'];
const isManagerRole = (role) => MANAGERS.includes(role);
const fail = (status, message, fields) => Object.assign(new Error(message), { status, ...(fields ? { fields } : {}) });
const isDuplicateKey = (error) => [2601, 2627].includes(error?.number) || [2601, 2627].includes(error?.originalError?.info?.number);

function cleanName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw fail(422, 'Type the client name first', { name: 'Client name is required' });
  if (name.length > 255) throw fail(422, 'Client name must be at most 255 characters', { name: 'Too long' });
  return name;
}

// Client names already typed on tasks join the list once, so nothing has to be re-entered.
// Never blocks the caller.
async function syncFromTasks(orgId, userId) {
  try {
    await db.execute(
      `INSERT INTO org_clients (org_id, name, created_by, source)
       SELECT ?, src.name, ?, 'task' FROM (
         SELECT DISTINCT LTRIM(RTRIM(client_name)) AS name FROM tasks
         WHERE org_id = ? AND is_deleted = 0 AND client_name IS NOT NULL AND LEN(LTRIM(RTRIM(client_name))) BETWEEN 1 AND 255
       ) src
       WHERE NOT EXISTS (SELECT 1 FROM org_clients c WHERE c.org_id = ? AND c.name = src.name)`,
      [orgId, userId || null, orgId, orgId]
    );
  } catch (error) {
    if (!isDuplicateKey(error)) console.error('[clients] could not copy task clients', error.message);
  }
}

async function pickOnly(orgId) {
  try {
    const [[row]] = await db.execute('SELECT pick_only FROM org_client_settings WHERE org_id = ?', [orgId]);
    return Boolean(row && Number(row.pick_only));
  } catch { return false; }
}

// Checks the client name on a task being saved and returns the name to store.
// Pick-only organizations: employees must choose an active client from the list.
// Otherwise (and always for managers/admins) a new name is added to the list.
async function resolveTaskClient(orgId, rawName, role, userId) {
  const typed = String(rawName ?? '').trim().replace(/\s+/g, ' ');
  if (!typed) return null;
  const name = typed.slice(0, 255);
  let existing = null;
  try { [[existing]] = await db.execute('SELECT id, name, is_active FROM org_clients WHERE org_id = ? AND name = ?', [orgId, name]); }
  catch (error) { console.error('[clients] lookup failed', error.message); return name; }
  const manager = isManagerRole(role);
  const restricted = !manager && await pickOnly(orgId);
  if (existing) {
    if (restricted && !Number(existing.is_active)) throw fail(422, `${existing.name} is no longer an active client. Pick another one.`, { client_name: 'Inactive client' });
    return existing.name;
  }
  if (restricted) throw fail(422, 'Pick a client from the list. Your manager or admin adds client names.', { client_name: 'Pick a client from the list' });
  try { await db.execute("INSERT INTO org_clients (org_id, name, created_by, source) VALUES (?, ?, ?, 'task')", [orgId, name, userId || null]); }
  catch (error) { if (!isDuplicateKey(error)) console.error('[clients] could not add client', error.message); }
  return name;
}

module.exports = { MANAGERS, isManagerRole, fail, isDuplicateKey, cleanName, syncFromTasks, pickOnly, resolveTaskClient };
