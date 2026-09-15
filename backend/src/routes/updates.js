const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { db, fail, textField, positive, pageNumber, route, requireActiveMember, requirePublisher } = require('./updatesSupport');
router.use(authenticate, requireActiveMember);
router.use('/reports', require('./updateReports'));

router.get('/summary', route(async (req, res) => {
  const [[counts]] = await db.execute(`SELECT
    (SELECT COUNT(*) FROM workspace_updates w LEFT JOIN workspace_update_reads r
      ON r.update_id = w.id AND r.user_id = ? WHERE (r.version IS NULL OR r.version < w.version)) AS unread,
    (SELECT COUNT(*) FROM update_report_tasks WHERE org_id = ? AND assigned_to = ? AND status != 'DONE') AS reports`,
  [req.userId, req.orgId, req.userId]);
  res.json({ ...counts, can_publish: req.canPublishUpdates });
}));

router.get('/', route(async (req, res) => {
  const page = pageNumber(req);
  const [rows] = await db.execute(`SELECT w.*,
    CONVERT(VARCHAR(33), w.published_at, 126) + 'Z' AS published_utc,
    CONVERT(VARCHAR(33), w.updated_at, 126) + 'Z' AS updated_utc,
    CASE WHEN r.version >= w.version THEN 1 ELSE 0 END AS is_read
    FROM workspace_updates w LEFT JOIN workspace_update_reads r ON r.update_id = w.id AND r.user_id = ?
    ORDER BY w.published_at DESC, w.id DESC OFFSET ? ROWS FETCH NEXT 20 ROWS ONLY`, [req.userId, (page - 1) * 20]);
  const [[count]] = await db.execute('SELECT COUNT(*) AS total FROM workspace_updates');
  res.json({ data: rows.map(({ published_utc, updated_utc, ...row }) => ({ ...row,
    published_at: published_utc, updated_at: updated_utc,
    can_edit: req.canPublishUpdates && Number(row.created_by) === Number(req.userId),
  })), page, total: count.total, can_publish: req.canPublishUpdates });
}));

function fields(body) {
  return [textField(body, 'title', 160), textField(body, 'summary', 3000),
    textField(body, 'why_text', 3000), textField(body, 'how_text', 5000), textField(body, 'performance_text', 3000, false)];
}
router.post('/', requirePublisher, route(async (req, res) => {
  const [result] = await db.execute(`INSERT INTO workspace_updates
    (title, summary, why_text, how_text, performance_text, org_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [...fields(req.body), req.orgId, req.userId]);
  res.status(201).json({ id: result.insertId });
}));

router.put('/:id', requirePublisher, route(async (req, res) => {
  const id = positive(req.params.id), version = positive(req.body.version, 'version');
  const [result] = await db.execute(`UPDATE workspace_updates SET title = ?, summary = ?, why_text = ?, how_text = ?,
    performance_text = ?, version = version + 1, updated_at = SYSUTCDATETIME()
    WHERE id = ? AND created_by = ? AND version = ?`, [...fields(req.body), id, req.userId, version]);
  if (!result.affectedRows) throw fail(409, 'Update changed or is unavailable. Refresh before editing.');
  res.json({ id, version: version + 1 });
}));

router.post('/:id/read', route(async (req, res) => {
  const id = positive(req.params.id), version = positive(req.body.version, 'version');
  await db.execute(`MERGE workspace_update_reads WITH (HOLDLOCK) AS target
    USING (SELECT id AS update_id, ? AS user_id, ? AS version FROM workspace_updates WHERE id = ? AND version = ?) AS source
    ON target.update_id = source.update_id AND target.user_id = source.user_id
    WHEN MATCHED THEN UPDATE SET version = CASE WHEN target.version > source.version THEN target.version ELSE source.version END
    WHEN NOT MATCHED THEN INSERT (update_id, user_id, version) VALUES (source.update_id, source.user_id, source.version);`,
  [req.userId, version, id, version]);
  res.json({ message: 'Update marked as read' });
}));
module.exports = router;
