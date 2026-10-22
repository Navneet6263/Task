const router = require('express').Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { currentOrgRole, fail } = require('../utils/orgMember');

const COLORS = ['none', 'green', 'blue', 'amber', 'red'];
const MAX_BODY = 50000;
const COLUMNS = `id, title, body, color, is_pinned, version, CONVERT(VARCHAR(19), created_at, 126) AS created_at, CONVERT(VARCHAR(19), updated_at, 126) AS updated_at`;

const route = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) {
    if (!error.status) console.error('[notes]', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to complete request. Please retry.' });
  }
};
const shape = (row) => ({ ...row, is_pinned: row.is_pinned === true || row.is_pinned === 1 });

router.use(authenticate, route(async (req, res, next) => { await currentOrgRole(req); next(); }));

function fields(body) {
  const title = String(body.title || '').trim();
  const text = String(body.body || '');
  if (title.length > 200) throw fail(422, 'Title must be 200 characters or fewer');
  if (text.length > MAX_BODY) throw fail(422, `A note can hold up to ${MAX_BODY.toLocaleString('en-US')} characters`);
  if (!title && !text.trim()) throw fail(422, 'Write something before saving');
  return { title, body: text, color: COLORS.includes(body.color) ? body.color : 'none' };
}

// Only ever the caller's own notes in the active organization.
router.get('/', route(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const [rows] = await db.execute(
    `SELECT TOP 500 ${COLUMNS} FROM user_notes WHERE user_id = ? AND org_id = ? AND is_deleted = 0
     ${q ? 'AND (title LIKE ? OR body LIKE ?)' : ''} ORDER BY is_pinned DESC, updated_at DESC`,
    [req.userId, req.orgId, ...(q ? [`%${q}%`, `%${q}%`] : [])]
  );
  res.json(rows.map(shape));
}));

router.post('/', route(async (req, res) => {
  const note = fields(req.body);
  const [result] = await db.execute('INSERT INTO user_notes (org_id, user_id, title, body, color) VALUES (?, ?, ?, ?, ?)', [req.orgId, req.userId, note.title, note.body, note.color]);
  const [[row]] = await db.execute(`SELECT ${COLUMNS} FROM user_notes WHERE id = ?`, [result.insertId]);
  res.status(201).json(shape(row));
}));

// Saves only if nobody (e.g. another tab) saved a newer version in between.
router.put('/:id', route(async (req, res) => {
  const note = fields(req.body);
  const version = Number(req.body.version);
  if (!Number.isSafeInteger(version) || version < 1) throw fail(422, 'Missing note version');
  const [result] = await db.execute(
    `UPDATE user_notes SET title = ?, body = ?, color = ?, version = version + 1, updated_at = SYSDATETIME()
     WHERE id = ? AND user_id = ? AND org_id = ? AND is_deleted = 0 AND version = ?`,
    [note.title, note.body, note.color, Number(req.params.id), req.userId, req.orgId, version]
  );
  if (!result.affectedRows) throw fail(409, 'This note was changed somewhere else. Reload it before saving.');
  const [[row]] = await db.execute(`SELECT ${COLUMNS} FROM user_notes WHERE id = ?`, [Number(req.params.id)]);
  res.json(shape(row));
}));

router.patch('/:id/pin', route(async (req, res) => {
  const [result] = await db.execute('UPDATE user_notes SET is_pinned = ? WHERE id = ? AND user_id = ? AND org_id = ? AND is_deleted = 0',
    [req.body.pinned === true, Number(req.params.id), req.userId, req.orgId]);
  if (!result.affectedRows) throw fail(404, 'Note not found');
  res.json({ id: Number(req.params.id), is_pinned: req.body.pinned === true });
}));

router.delete('/:id', route(async (req, res) => {
  const [result] = await db.execute('UPDATE user_notes SET is_deleted = 1, updated_at = SYSDATETIME() WHERE id = ? AND user_id = ? AND org_id = ? AND is_deleted = 0',
    [Number(req.params.id), req.userId, req.orgId]);
  if (!result.affectedRows) throw fail(404, 'Note not found');
  res.json({ id: Number(req.params.id) });
}));

module.exports = router;
