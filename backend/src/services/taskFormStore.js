const db = require('../config/database');
const { normalizeLayout } = require('./taskFormLayout');

// The saved layout for an organization, or null when it still uses the classic form.
// A stored layout that no longer validates is ignored (classic form) instead of breaking task creation.
async function getOrgLayout(orgId) {
  if (!orgId) return null;
  let row;
  try { [[row]] = await db.execute('SELECT definition, version FROM task_form_layouts WHERE org_id = ?', [orgId]); }
  catch (error) { console.error('[task-form] layout lookup failed', error.message); return null; }
  if (!row) return null;
  try { return { ...normalizeLayout(JSON.parse(row.definition)), version: Number(row.version) }; }
  catch (error) { console.error('[task-form] stored layout is invalid for org', orgId, error.message); return null; }
}


const parseCustom = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

module.exports = { getOrgLayout, parseCustom };
