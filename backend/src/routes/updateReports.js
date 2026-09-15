const router = require('express').Router();
const { db, memberClause, fail, textField, positive, pageNumber, route } = require('./updatesSupport');

router.get('/assignees', route(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const [rows] = await db.execute(`SELECT TOP 50 u.id, u.name, u.role FROM users u
    WHERE u.is_deleted = FALSE AND ${memberClause} AND u.name LIKE ?
    ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.name, u.id`, [req.orgId, req.orgId, `%${query}%`]);
  res.json(rows);
}));

router.post('/', route(async (req, res) => {
  const updateId = positive(req.body.update_id), assignee = positive(req.body.assigned_to, 'assignee');
  const title = textField(req.body, 'title', 160), description = textField(req.body, 'description', 5000);
  const steps = textField(req.body, 'steps', 5000, false), key = textField(req.body, 'request_key', 80);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw fail(422, 'Invalid request key');
  const priority = req.body.priority || 'MEDIUM';
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(priority)) throw fail(422, 'Invalid priority');
  const updateVersion = positive(req.body.update_version, 'update version');
  const receiptQuery = `SELECT id, update_id, update_version, assigned_to, title, description, steps, priority
    FROM update_report_tasks WHERE org_id = ? AND reported_by = ? AND request_key = ?`;
  const receiptParams = [req.orgId, req.userId, key];
  const sendReceipt = row => {
    if (Number(row.update_id) !== updateId || Number(row.update_version) !== updateVersion || Number(row.assigned_to) !== assignee
      || row.title !== title || row.description !== description || row.steps !== steps || row.priority !== priority)
      throw fail(409, 'This submission already succeeded with different details. Reopen Updates to start a new report.');
    return res.json({ id: row.id, message: 'Private report already submitted' });
  };
  // Only return a receipt to the reporter; even the creator has no report-reading privilege.
  const [[existing]] = await db.execute(receiptQuery, receiptParams);
  if (existing) return sendReceipt(existing);
  const [[update]] = await db.execute('SELECT id, title, version FROM workspace_updates WHERE id = ?', [updateId]);
  if (!update) throw fail(404, 'Update not found');
  if (updateVersion !== Number(update.version))
    throw fail(409, 'This update has changed. Reopen Updates and report against the latest version.');
  const [[member]] = await db.execute(`SELECT u.id FROM users u WHERE u.id = ? AND u.is_deleted = FALSE AND ${memberClause}`,
    [assignee, req.orgId, req.orgId]);
  if (!member) throw fail(422, 'Select an active user in this organization');
  try {
    const [result] = await db.execute(`INSERT INTO update_report_tasks
      (org_id, update_id, update_title, update_version, reported_by, assigned_to, request_key, title, description, steps, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.orgId, update.id, update.title, update.version, req.userId, assignee, key, title, description, steps, priority]);
    res.status(201).json({ id: result.insertId, message: 'Private bug task sent to the selected assignee' });
  } catch (error) {
    // Unique receipt key prevents duplicate tasks if a successful submission is retried.
    if (![2601, 2627].includes(error.number)) throw error;
    const [[receipt]] = await db.execute(receiptQuery, receiptParams);
    if (!receipt) throw error;
    sendReceipt(receipt);
  }
}));

router.get('/', route(async (req, res) => {
  const page = pageNumber(req), status = String(req.query.status || '');
  if (status && !['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'].includes(status)) throw fail(422, 'Invalid status');
  const scope = `r.org_id = ? AND r.assigned_to = ?${status ? ' AND r.status = ?' : ''}`;
  const params = [req.orgId, req.userId, ...(status ? [status] : [])];
  const [rows] = await db.execute(`SELECT r.*, u.name AS reporter_name,
    CONVERT(VARCHAR(33), r.created_at, 126) + 'Z' AS created_utc,
    CONVERT(VARCHAR(33), r.updated_at, 126) + 'Z' AS updated_utc FROM update_report_tasks r
    LEFT JOIN users u ON u.id = r.reported_by WHERE ${scope}
    ORDER BY r.id DESC OFFSET ? ROWS FETCH NEXT 20 ROWS ONLY`, [...params, (page - 1) * 20]);
  const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM update_report_tasks r WHERE ${scope}`, params);
  res.json({ data: rows.map(({ created_utc, updated_utc, ...row }) => ({ ...row,
    created_at: created_utc, updated_at: updated_utc })), total: count.total, page });
}));

router.get('/:id', route(async (req, res) => {
  const [[row]] = await db.execute(`SELECT *, CONVERT(VARCHAR(33), created_at, 126) + 'Z' AS created_utc,
    CONVERT(VARCHAR(33), updated_at, 126) + 'Z' AS updated_utc FROM update_report_tasks
    WHERE id = ? AND org_id = ? AND assigned_to = ?`, [positive(req.params.id), req.orgId, req.userId]);
  if (!row) throw fail(404, 'Report not found');
  const { created_utc, updated_utc, ...report } = row;
  res.json({ ...report, created_at: created_utc, updated_at: updated_utc });
}));

router.patch('/:id', route(async (req, res) => {
  const id = positive(req.params.id), version = positive(req.body.version, 'version');
  if (!['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'].includes(req.body.status)) throw fail(422, 'Invalid status');
  if (Object.keys(req.body).some(key => !['status', 'version', 'resolution_note'].includes(key)))
    throw fail(422, 'Only status and resolution note can be changed');
  const note = textField(req.body, 'resolution_note', 3000, false);
  const [result] = await db.execute(`UPDATE update_report_tasks SET status = ?, resolution_note = ?,
    version = version + 1, updated_at = SYSUTCDATETIME()
    WHERE id = ? AND org_id = ? AND assigned_to = ? AND version = ?`,
  [req.body.status, note, id, req.orgId, req.userId, version]);
  if (!result.affectedRows) throw fail(409, 'Report changed or is unavailable. Refresh and try again.');
  res.json({ version: version + 1 });
}));
module.exports = router;
