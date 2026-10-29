const express = require('express');
const { createTransporter } = require('../utils/mailer');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { currentOrgRole, fail } = require('../utils/orgMember');
const { isModuleEnabled } = require('../services/orgModules');

const router = express.Router();
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_RECIPIENTS = 20;
const PAGE_SIZE = 25;
const isLead = (role) => ['admin', 'manager'].includes(role);

const route = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) {
    if (!error.status) console.error('[communications]', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to complete request. Please retry.', ...(error.fields ? { fields: error.fields } : {}) });
  }
};

router.use(authenticate, route(async (req, res, next) => { req.orgRole = await currentOrgRole(req); next(); }));

// Mail goes out from GreenTask's own mail server, so only organizations the super admin
// turned the Communications module on for can use any of it.
router.get('/status', route(async (req, res) => {
  res.json({ enabled: await isModuleEnabled(req.orgId, 'communications') });
}));
router.use(route(async (req, res, next) => {
  if (!await isModuleEnabled(req.orgId, 'communications')) {
    return res.status(403).json({ error: 'Communications is not turned on for your company. Ask GreenTask to enable it.', code: 'MODULE_OFF' });
  }
  next();
}));

// "a@x.com, b@y.com; c@z.com" → validated, de-duplicated list.
function recipients(value, label, required) {
  const list = [...new Set(String(value || '').split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(Boolean))];
  if (required && !list.length) throw fail(422, `${label} needs at least one email address`, { [label.toLowerCase()]: 'Add at least one email address.' });
  const bad = list.find((email) => !EMAIL.test(email) || email.length > 254);
  if (bad) throw fail(422, `"${bad}" is not a valid email address`, { [label.toLowerCase()]: `"${bad}" is not a valid email address.` });
  if (list.length > MAX_RECIPIENTS) throw fail(422, `${label} can have at most ${MAX_RECIPIENTS} addresses`);
  return list;
}

function text(value, label, max) {
  const result = String(value || '').trim();
  if (!result) throw fail(422, `${label} is required`, { [label.toLowerCase()]: `${label} is required.` });
  if (result.length > max) throw fail(422, `${label} must be ${max} characters or fewer`);
  return result;
}

router.post('/send', route(async (req, res) => {
  const to = recipients(req.body.to, 'To', true);
  const cc = recipients(req.body.cc, 'CC', false);
  const subject = text(req.body.subject, 'Subject', 200);
  const body = text(req.body.text || req.body.body, 'Message', 20000);
  const taskId = Number.isSafeInteger(Number(req.body.task_id)) && Number(req.body.task_id) > 0 ? Number(req.body.task_id) : null;
  const templateName = req.body.template_name ? String(req.body.template_name).slice(0, 120) : null;
  let status = 'SENT', error = null, messageId = null;
  try {
    const transporter = createTransporter('task');
    const info = await transporter.sendMail({ from: process.env.FROM_EMAIL || process.env.SMTP_USER, to: to.join(', '), ...(cc.length ? { cc: cc.join(', ') } : {}), subject, text: body });
    messageId = info.messageId;
  } catch (sendError) {
    status = 'FAILED';
    error = String(sendError.message || 'Send failed').slice(0, 500);
    console.error('[communications] send failed', error);
  }
  try {
    await db.execute(
      'INSERT INTO communication_logs (org_id, sent_by, to_list, cc_list, subject, body, task_id, template_name, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.orgId, req.userId, to.join(', '), cc.join(', ') || null, subject, body, taskId, templateName, status, error]
    );
  } catch (logError) { console.error('[communications] log failed', logError.message); }
  if (status === 'FAILED') throw fail(502, 'The email could not be sent. Check the SMTP settings on the server and try again.');
  res.json({ message: 'Email sent successfully', messageId });
}));

// Admins and managers see the whole organization's sent mail; everyone else sees their own.
router.get('/history', route(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const all = isLead(req.orgRole) && req.query.mine !== 'true';
  const where = `l.org_id = ?${all ? '' : ' AND l.sent_by = ?'}`;
  const params = [req.orgId, ...(all ? [] : [req.userId])];
  const [rows] = await db.execute(
    `SELECT l.id, l.to_list, l.cc_list, l.subject, LEFT(l.body, 240) AS preview, l.task_id, l.template_name, l.status, l.error,
       CONVERT(VARCHAR(19), l.created_at, 126) AS created_at, l.sent_by, u.name AS sent_by_name
     FROM communication_logs l LEFT JOIN users u ON u.id = l.sent_by
     WHERE ${where} ORDER BY l.id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
    [...params, (page - 1) * PAGE_SIZE, PAGE_SIZE]
  );
  const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM communication_logs l WHERE ${where}`, params);
  res.json({ data: rows, page, page_size: PAGE_SIZE, total: Number(count.total), scope: all ? 'organization' : 'mine' });
}));

router.get('/history/:id', route(async (req, res) => {
  const [[row]] = await db.execute(
    `SELECT l.*, CONVERT(VARCHAR(19), l.created_at, 126) AS created_at, u.name AS sent_by_name
     FROM communication_logs l LEFT JOIN users u ON u.id = l.sent_by WHERE l.id = ? AND l.org_id = ?`,
    [Number(req.params.id), req.orgId]
  );
  if (!row || (!isLead(req.orgRole) && Number(row.sent_by) !== Number(req.userId))) throw fail(404, 'Email not found');
  res.json(row);
}));

/* Organization templates: anyone can add; the author or a lead can edit or delete. */
router.get('/templates', route(async (req, res) => {
  const [rows] = await db.execute(
    `SELECT t.id, t.name, t.subject, t.body, t.created_by, u.name AS created_by_name, CONVERT(VARCHAR(19), t.updated_at, 126) AS updated_at
     FROM communication_templates t LEFT JOIN users u ON u.id = t.created_by WHERE t.org_id = ? AND t.is_deleted = 0 ORDER BY t.name ASC`,
    [req.orgId]
  );
  res.json(rows.map((row) => ({ ...row, can_edit: isLead(req.orgRole) || Number(row.created_by) === Number(req.userId) })));
}));

const templateFields = (body) => ({ name: text(body.name, 'Name', 120), subject: text(body.subject, 'Subject', 200), body: text(body.body, 'Message', 20000) });
const duplicate = (error) => [2601, 2627].includes(error?.number);

router.post('/templates', route(async (req, res) => {
  const t = templateFields(req.body);
  try {
    const [result] = await db.execute('INSERT INTO communication_templates (org_id, name, subject, body, created_by) VALUES (?, ?, ?, ?, ?)', [req.orgId, t.name, t.subject, t.body, req.userId]);
    res.status(201).json({ id: result.insertId });
  } catch (error) { if (duplicate(error)) throw fail(409, 'A template with this name already exists'); throw error; }
}));

async function editableTemplate(req) {
  const [[row]] = await db.execute('SELECT id, created_by FROM communication_templates WHERE id = ? AND org_id = ? AND is_deleted = 0', [Number(req.params.id), req.orgId]);
  if (!row) throw fail(404, 'Template not found');
  if (!isLead(req.orgRole) && Number(row.created_by) !== Number(req.userId)) throw fail(403, 'Only the author or a manager can change this template');
  return row;
}

router.put('/templates/:id', route(async (req, res) => {
  const row = await editableTemplate(req);
  const t = templateFields(req.body);
  try {
    await db.execute('UPDATE communication_templates SET name = ?, subject = ?, body = ?, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?', [t.name, t.subject, t.body, row.id, req.orgId]);
    res.json({ id: row.id });
  } catch (error) { if (duplicate(error)) throw fail(409, 'A template with this name already exists'); throw error; }
}));

router.delete('/templates/:id', route(async (req, res) => {
  const row = await editableTemplate(req);
  await db.execute('UPDATE communication_templates SET is_deleted = 1, updated_at = SYSDATETIME() WHERE id = ? AND org_id = ?', [row.id, req.orgId]);
  res.json({ id: row.id });
}));

module.exports = router;
