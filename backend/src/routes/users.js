const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const { accountFlags, visibleEmail, isEmail, isPlaceholderEmail } = require('../services/employeeAccounts');
const { sendEmailCode } = require('../utils/mailer');
const { authenticate } = require('../middleware/auth');
const { ensureUserOrgAccessTable } = require('../utils/orgAccess');
const router = express.Router();

router.get('/search', authenticate, async (req, res) => {
  try {
    const { email } = req.query;
    const [users] = await db.execute(
      'SELECT id, name, email, avatar FROM users WHERE email LIKE ? AND id != ? AND org_id = ? LIMIT 10',
      [`%${email}%`, req.userId, req.orgId]
    );
    res.json(users);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.get('/org-access', authenticate, async (req, res) => {
  try {
    if (req.userRole === 'company_admin') {
      const [organizations] = await db.execute(
        `SELECT id, name, company_code, created_at
         FROM organizations
         WHERE company_admin_id = ?
         ORDER BY created_at DESC`,
        [req.companyAdminId]
      );
      return res.json({ active_org_id: req.orgId, organizations });
    }

    await ensureUserOrgAccessTable(db);
    const orgIds = req.orgIds || (req.orgId ? [req.orgId] : []);
    if (orgIds.length === 0) return res.json({ active_org_id: null, organizations: [] });

    const placeholders = orgIds.map(() => '?').join(',');
    const [organizations] = await db.execute(
      `SELECT id, name, company_code, created_at
       FROM organizations
       WHERE id IN (${placeholders})
       ORDER BY name ASC`,
      orgIds
    );
    return res.json({ active_org_id: req.orgId, organizations });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT u.id, u.name, u.email, u.mobile, u.employee_id, u.role, u.avatar, u.created_at,
         u.login_code, u.must_change_password, u.department, u.designation, u.work_location, m.name AS reports_to_name
       FROM users u LEFT JOIN users m ON m.id = u.reports_to WHERE u.id = ?`,
      [req.userId]
    );
    if (!users[0]) return res.status(404).json({ error: 'User not found' });
    const me = { ...users[0], ...accountFlags(users[0]), email: visibleEmail(users[0].email) };
    if (req.userRole === 'company_admin') {
      return res.json({ ...me, role: 'company_admin' });
    }
    res.json(me);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, mobile } = req.body;
    await db.execute('UPDATE users SET name = ?, mobile = ? WHERE id = ?', [name, mobile || null, req.userId]);
    res.json({ message: 'Profile updated' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { current, newPass } = req.body;
    const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [req.userId]);
    const valid = await bcrypt.compare(current, users[0].password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPass, 10);
    await db.execute('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [hashed, req.userId]);
    res.json({ message: 'Password changed' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// First sign-in with a password from the admin's sheet: the person must choose their own.
// Allowed only while the account is flagged, so it never skips the current-password check otherwise.
router.post('/me/first-password', authenticate, async (req, res) => {
  try {
    const next = String(req.body.password || '');
    if (next.length < 8) return res.status(422).json({ error: 'Use at least 8 characters.' });
    const [[user]] = await db.execute('SELECT password, must_change_password FROM users WHERE id = ? AND is_deleted = FALSE', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(user.must_change_password === true || user.must_change_password === 1)) {
      return res.status(409).json({ error: 'Your password is already set. Change it from Settings → Password & security.' });
    }
    if (await bcrypt.compare(next, user.password)) return res.status(422).json({ error: 'Choose a new password, not the one from the sheet.' });
    await db.execute('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [await bcrypt.hash(next, 10), req.userId]);
    res.json({ message: 'Password set' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// Adding or changing the sign-in email: a 6-digit code goes to the new address and must come back.
const EMAIL_CODE_MINUTES = 10;
const EMAIL_CODE_TRIES = 5;
const emailCodeHash = (userId, email, code) => crypto.createHmac('sha256', String(process.env.JWT_SECRET || ''))
  .update(`email-code:${userId}:${email}:${code}`).digest('hex');

async function emailTaken(email, userId) {
  const [[user]] = await db.execute('SELECT TOP 1 id FROM users WHERE email = ? AND id <> ?', [email, userId]);
  const [[admin]] = await db.execute('SELECT TOP 1 id FROM company_admins WHERE email = ?', [email]);
  return Boolean(user || admin);
}

router.post('/me/email/start', authenticate, async (req, res) => {
  try {
    if (req.userRole === 'company_admin') return res.status(403).json({ error: 'Company admins change their email with GreenTask support.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEmail(email) || isPlaceholderEmail(email)) return res.status(422).json({ error: 'Enter a valid email address.' });
    const [[user]] = await db.execute('SELECT name, email FROM users WHERE id = ? AND is_deleted = FALSE', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email === email) return res.status(422).json({ error: 'This is already your email.' });
    if (await emailTaken(email, req.userId)) return res.status(409).json({ error: 'This email is already used by another account.' });
    const [[pending]] = await db.execute('SELECT DATEDIFF(SECOND, sent_at, SYSDATETIME()) AS since_sent FROM user_email_otps WHERE user_id = ?', [req.userId]);
    if (pending && Number(pending.since_sent) < 60) return res.status(429).json({ error: `Wait ${60 - Number(pending.since_sent)} seconds before asking for another code.` });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await db.execute('DELETE FROM user_email_otps WHERE user_id = ?', [req.userId]);
    await db.execute(
      `INSERT INTO user_email_otps (user_id, email, code_hash, expires_at) OUTPUT INSERTED.user_id AS insertId
       VALUES (?, ?, ?, DATEADD(MINUTE, ${EMAIL_CODE_MINUTES}, SYSDATETIME()))`,
      [req.userId, email, emailCodeHash(req.userId, email, code)]
    );
    try {
      await sendEmailCode(email, user.name, code);
    } catch (mailError) {
      console.error('[email-code] send failed', mailError.message);
      await db.execute('DELETE FROM user_email_otps WHERE user_id = ?', [req.userId]);
      return res.status(502).json({ error: 'We could not send the code right now. Try again in a few minutes.' });
    }
    res.json({ message: `We sent a 6-digit code to ${email}.`, email });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

router.post('/me/email/verify', authenticate, async (req, res) => {
  try {
    if (req.userRole === 'company_admin') return res.status(403).json({ error: 'Company admins change their email with GreenTask support.' });
    const code = String(req.body.code || '').trim();
    const [[row]] = await db.execute(
      'SELECT email, code_hash, attempts, CASE WHEN expires_at > SYSDATETIME() THEN 0 ELSE 1 END AS expired FROM user_email_otps WHERE user_id = ?',
      [req.userId]
    );
    if (!row || Number(row.expired)) return res.status(410).json({ error: 'This code has expired. Ask for a new one.' });
    if (Number(row.attempts) >= EMAIL_CODE_TRIES) return res.status(429).json({ error: 'Too many wrong codes. Ask for a new one.' });
    const expected = Buffer.from(row.code_hash, 'hex');
    const given = Buffer.from(emailCodeHash(req.userId, row.email, code), 'hex');
    if (!/^\d{6}$/.test(code) || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      await db.execute('UPDATE user_email_otps SET attempts = attempts + 1 WHERE user_id = ?', [req.userId]);
      const left = EMAIL_CODE_TRIES - Number(row.attempts) - 1;
      return res.status(401).json({ error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.' });
    }
    if (await emailTaken(row.email, req.userId)) return res.status(409).json({ error: 'This email is already used by another account.' });
    await db.execute('UPDATE users SET email = ? WHERE id = ?', [row.email, req.userId]);
    await db.execute('DELETE FROM user_email_otps WHERE user_id = ?', [req.userId]);
    res.json({ message: 'Email saved. You can now sign in with it too.', email: row.email });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
