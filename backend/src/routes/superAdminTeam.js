const crypto = require('crypto');
const express = require('express');
const db = require('../config/database');
const mailer = require('../utils/mailer');
const { EMAIL_RE, isMasterEmail, normalizeEmail, keyedHash, saLog, verifySA, requireMaster } = require('../services/superAdminAccess');

// Console helpers. Only the master admin can give or remove access; helpers set their own password
// from a one-time invite link, and resending a link replaces their current password.
const router = express.Router();
const INVITE_HOURS = 48;

const setupUrl = (req, token) => `${String(req.headers.origin || process.env.APP_FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/sa-setup?token=${token}`;

// Creates a fresh invite token (only its hash is stored) and emails it. If email fails, the master gets the link to share.
async function issueInvite(req, user) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.execute(
    `UPDATE super_admin_users SET invite_token_hash = ?, invite_expires_at = DATEADD(HOUR, ${INVITE_HOURS}, SYSDATETIME()),
       password_hash = NULL, password_set_at = NULL, failed_logins = 0, locked_until = NULL WHERE id = ?`,
    [keyedHash(`invite:${token}`), user.id],
  );
  const url = setupUrl(req, token);
  try {
    await mailer.sendConsoleInvite(user.email, user.name, url);
    return { invite_sent: true };
  } catch (error) {
    console.error('[sa] invite email failed', error.message);
    return { invite_sent: false, setup_url: url };
  }
}

router.get('/sub-users', verifySA, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, email, name, is_active, created_at, last_login_at, invite_expires_at,
         CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS has_password,
         CASE WHEN invite_expires_at > SYSDATETIME() THEN 1 ELSE 0 END AS invite_valid
       FROM super_admin_users ORDER BY created_at DESC`,
    );
    res.json(rows.map((row) => ({ ...row, has_password: Boolean(Number(row.has_password)), invite_valid: Boolean(Number(row.invite_valid)) })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/sub-users', verifySA, requireMaster, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || '').trim().slice(0, 120) || null;
    if (!EMAIL_RE.test(email)) return res.status(422).json({ error: 'Enter a valid email address' });
    if (isMasterEmail(email)) return res.status(422).json({ error: 'This email already has master access' });
    const [[existing]] = await db.execute('SELECT id, is_active, name FROM super_admin_users WHERE email = ?', [email]);
    if (existing && Number(existing.is_active)) return res.status(409).json({ error: 'This person already has console access' });
    let id = existing?.id;
    if (existing) await db.execute('UPDATE super_admin_users SET is_active = TRUE, name = COALESCE(?, name) WHERE id = ?', [name, id]);
    else id = (await db.execute('INSERT INTO super_admin_users (email, name) VALUES (?, ?)', [email, name]))[0].insertId;
    const invite = await issueInvite(req, { id, email, name: name || existing?.name });
    await saLog(req.saEmail, req.saName, 'ADD_SUB_USER', 'super_admin_user', id, `Gave console access to ${email}`, req.ip);
    res.json({ message: 'Access given', id, ...invite });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/sub-users/:id/invite', verifySA, requireMaster, async (req, res) => {
  try {
    const [[user]] = await db.execute('SELECT id, email, name FROM super_admin_users WHERE id = ? AND is_active = TRUE', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'This person does not have console access' });
    const invite = await issueInvite(req, user);
    await saLog(req.saEmail, req.saName, 'RESEND_INVITE', 'super_admin_user', user.id, `Sent a new setup link to ${user.email}`, req.ip);
    res.json({ message: 'Setup link sent', ...invite });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/sub-users/:id', verifySA, requireMaster, async (req, res) => {
  try {
    const [[user]] = await db.execute('SELECT email FROM super_admin_users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    await db.execute(
      'UPDATE super_admin_users SET is_active = FALSE, password_hash = NULL, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ?',
      [req.params.id],
    );
    await saLog(req.saEmail, req.saName, 'REMOVE_SUB_USER', 'super_admin_user', req.params.id, `Removed console access for ${user.email}`, req.ip);
    res.json({ message: 'Removed' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
