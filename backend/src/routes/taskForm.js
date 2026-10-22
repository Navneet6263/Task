const router = require('express').Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { currentOrgRole } = require('../utils/orgMember');
const { normalizeLayout, templateList } = require('../services/taskFormLayout');
const { getOrgLayout, parseCustom } = require('../services/taskFormStore');

// The organization's "Create task" form. Everyone reads it; admins and managers design it.
router.use(authenticate);
const canDesign = (role) => role === 'admin' || role === 'manager';
const route = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (!error.status) console.error('[task-form]', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not complete the request. Try again.', ...(error.fields ? { fields: error.fields } : {}) });
  }
};

router.get('/', route(async (req, res) => {
  const role = await currentOrgRole(req);
  const layout = await getOrgLayout(req.orgId);
  res.json({ layout, version: layout?.version || 0, can_edit: canDesign(role), templates: templateList() });
}));

router.put('/', route(async (req, res) => {
  const role = await currentOrgRole(req);
  if (!canDesign(role)) return res.status(403).json({ error: 'Only admins and managers can change the task form' });
  const layout = normalizeLayout(req.body?.layout);
  const definition = JSON.stringify(layout);
  const expected = Number(req.body?.version || 0);
  const [[existing]] = await db.execute('SELECT version FROM task_form_layouts WHERE org_id = ?', [req.orgId]);
  if ((existing ? Number(existing.version) : 0) !== expected) {
    return res.status(409).json({ error: 'Someone else changed the form while you were editing. Reload to see their version.' });
  }
  if (existing) {
    const [result] = await db.execute(
      `UPDATE task_form_layouts SET template = ?, definition = ?, version = version + 1, updated_by = ?, updated_at = SYSDATETIME()
       WHERE org_id = ? AND version = ?`,
      [layout.template, definition, req.userId || null, req.orgId, expected]
    );
    if (!result.affectedRows) return res.status(409).json({ error: 'Someone else changed the form while you were editing. Reload to see their version.' });
  } else {
    // This table is keyed by org_id (no id column), so say what to return instead of the default INSERTED.id.
    await db.execute('INSERT INTO task_form_layouts (org_id, template, definition, updated_by) OUTPUT INSERTED.org_id AS insertId VALUES (?, ?, ?, ?)', [req.orgId, layout.template, definition, req.userId || null]);
  }
  res.json({ layout, version: expected + 1 });
}));

// Back to the classic form. Values already saved on tasks are kept.
router.delete('/', route(async (req, res) => {
  const role = await currentOrgRole(req);
  if (!canDesign(role)) return res.status(403).json({ error: 'Only admins and managers can change the task form' });
  await db.execute('DELETE FROM task_form_layouts WHERE org_id = ?', [req.orgId]);
  res.json({ layout: null, version: 0 });
}));

// Hours logged on tasks in a date range, flattened with each task's custom answers so reports
// can group by client, person, or any form question. Managers and admins only.
const REPORT_LIMIT = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
router.get('/time-report', route(async (req, res) => {
  const role = await currentOrgRole(req);
  if (!canDesign(role)) return res.status(403).json({ error: 'Only managers and admins can see time reports' });
  const { from, to } = req.query;
  if (!DATE_RE.test(String(from)) || !DATE_RE.test(String(to))) return res.status(422).json({ error: 'Pick a valid from and to date' });
  if (from > to) return res.status(422).json({ error: 'From date must be before the to date' });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366) return res.status(422).json({ error: 'Pick a range of one year or less' });
  const [rows] = await db.execute(
    `SELECT l.id, CONVERT(VARCHAR(10), l.work_date, 23) AS work_date, l.hours, l.note, l.user_id, u.name AS user_name,
       t.id AS entry_id, t.title AS task_title, t.client_name, t.custom_fields, te.name AS team_name
     FROM task_time_logs l
     JOIN tasks t ON t.id = l.task_id AND t.org_id = l.org_id
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN teams te ON te.id = t.team_id
     WHERE l.org_id = ? AND l.is_deleted = 0 AND t.is_deleted = 0 AND l.work_date >= ? AND l.work_date <= ?
     ORDER BY l.work_date ASC, l.id ASC
     OFFSET 0 ROWS FETCH NEXT ${REPORT_LIMIT + 1} ROWS ONLY`,
    [req.orgId, from, to]
  );
  const data = rows.slice(0, REPORT_LIMIT).map(({ custom_fields: custom, ...row }) => {
    const answers = Object.fromEntries(Object.entries(parseCustom(custom)).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)));
    return { ...answers, ...row, hours: Number(row.hours) };
  });
  res.json({ from, to, truncated: rows.length > REPORT_LIMIT, rows: data });
}));

module.exports = router;
