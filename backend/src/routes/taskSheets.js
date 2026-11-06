const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { canAccessTeam } = require('../utils/teamAccess');
const { isModuleEnabled } = require('../services/orgModules');
const { FIELDS, readSheet, suggestMapping, readSettings, syncLink } = require('../services/sheetToTask');

const router = express.Router();
router.use(authenticate);

const fail = (status, message) => Object.assign(new Error(message), { status });
const route = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong with the sheet' }); }
};
const parseJson = (text, fallback) => { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } };
const shape = (row) => ({
  id: row.id, name: row.name, source_url: row.source_url, team_id: row.team_id, team_name: row.team_name, is_active: Boolean(row.is_active),
  mapping: parseJson(row.mapping, {}), required: parseJson(row.required_fields, []),
  last_synced_at: row.last_synced_at, last_result: parseJson(row.last_result, null), tasks_created: Number(row.tasks_created || 0),
});

// Off for everyone until the platform team turns it on for the organization.
async function requireModule(req) {
  if (!req.orgId || !await isModuleEnabled(req.orgId, 'sheet_to_task')) throw fail(403, 'Sheet to task is not turned on for your organization');
}
async function ownLink(req) {
  const [[link]] = await db.execute('SELECT * FROM task_sheet_links WHERE id = ? AND user_id = ? AND org_id = ?', [Number(req.params.id), req.userId, req.orgId]);
  if (!link) throw fail(404, 'Sheet link not found');
  return link;
}
async function checkTeam(req, teamId) {
  const id = Number(teamId);
  if (!Number.isInteger(id) || id <= 0 || !await canAccessTeam(req, id)) throw fail(422, 'Pick one of your teams');
  const [[team]] = await db.execute('SELECT org_id FROM teams WHERE id = ? AND is_deleted = FALSE', [id]);
  if (!team || Number(team.org_id) !== Number(req.orgId)) throw fail(422, 'Pick one of your teams');
  return id;
}

router.get('/status', route(async (req, res) => {
  res.json({ enabled: Boolean(req.orgId) && await isModuleEnabled(req.orgId, 'sheet_to_task'), fields: FIELDS });
}));

router.get('/', route(async (req, res) => {
  await requireModule(req);
  const [rows] = await db.execute(
    `SELECT l.*, t.name AS team_name, (SELECT COUNT(*) FROM task_sheet_rows r WHERE r.link_id = l.id AND r.task_id IS NOT NULL) AS tasks_created
     FROM task_sheet_links l LEFT JOIN teams t ON t.id = l.team_id
     WHERE l.user_id = ? AND l.org_id = ? ORDER BY l.created_at DESC`,
    [req.userId, req.orgId]
  );
  res.json(rows.map(shape));
}));

// Read a sheet before linking it: its columns, a few rows and a guess of which column is which.
router.post('/preview', route(async (req, res) => {
  await requireModule(req);
  const { headers, rows } = await readSheet(req.body.url);
  if (!headers.length) throw fail(422, 'The sheet is empty. Put column names in the first row.');
  res.json({ headers, sample: rows.slice(0, 5), rows: rows.length, suggested: suggestMapping(headers) });
}));

router.post('/', route(async (req, res) => {
  await requireModule(req);
  const name = String(req.body.name || '').trim().slice(0, 150) || 'My task sheet';
  const url = String(req.body.url || '').trim();
  if (!url || url.length > 1000) throw fail(422, 'Paste the sheet link');
  const teamId = await checkTeam(req, req.body.team_id);
  const { mapping, required } = readSettings(req.body);
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM task_sheet_links WHERE user_id = ?', [req.userId]);
  if (Number(count) >= 10) throw fail(409, 'You can link up to 10 sheets');
  const [created] = await db.execute(
    'INSERT INTO task_sheet_links (org_id, user_id, team_id, name, source_url, mapping, required_fields) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.orgId, req.userId, teamId, name, url, JSON.stringify(mapping), JSON.stringify(required)]
  );
  // Either turn the rows already in the sheet into tasks now, or start with rows added from now on.
  const result = await syncLink(created.insertId, { seedOnly: req.body.include_existing !== true });
  res.status(201).json({ id: created.insertId, result });
}));

router.put('/:id', route(async (req, res) => {
  await requireModule(req);
  const link = await ownLink(req);
  const name = String(req.body.name ?? link.name).trim().slice(0, 150) || link.name;
  const teamId = req.body.team_id ? await checkTeam(req, req.body.team_id) : link.team_id;
  const { mapping, required } = readSettings(req.body.mapping ? req.body : { mapping: parseJson(link.mapping, {}), required: parseJson(link.required_fields, []) });
  const active = req.body.is_active === undefined ? Boolean(link.is_active) : req.body.is_active === true;
  await db.execute('UPDATE task_sheet_links SET name = ?, team_id = ?, mapping = ?, required_fields = ?, is_active = ? WHERE id = ?',
    [name, teamId, JSON.stringify(mapping), JSON.stringify(required), active ? 1 : 0, link.id]);
  res.json({ message: 'Saved' });
}));

router.post('/:id/sync', route(async (req, res) => {
  await requireModule(req);
  const link = await ownLink(req);
  res.json(await syncLink(link.id));
}));

// Unlinking keeps every task already made; only the link and its row memory go.
router.delete('/:id', route(async (req, res) => {
  await requireModule(req);
  const link = await ownLink(req);
  await db.execute('DELETE FROM task_sheet_rows WHERE link_id = ?', [link.id]);
  await db.execute('DELETE FROM task_sheet_links WHERE id = ?', [link.id]);
  res.json({ message: 'Unlinked' });
}));

module.exports = router;
