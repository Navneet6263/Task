const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const mailer = require('../utils/mailer');
const { checkCode, createChallenge, resendCode, CODE_TTL_MINUTES, RESEND_GAP_SECONDS } = require('../services/adminOtp');
const {
  SESSION_HOURS, isMasterEmail, masterEmail, normalizeEmail, codeRecipient, keyedHash, sameText, signConsoleToken, saLog, maskEmail, passwordProblem,
} = require('../services/superAdminAccess');

// Platform console sign-in: password first, then a one-time code sent by email.
const router = express.Router();
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('greentask-console-placeholder', 10);
const masterLock = { fails: 0, until: 0 };
const INCORRECT = { error: 'Email or password is incorrect.' };
const LOCKED = { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` };

const masterPassword = () => process.env.SUPER_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : 'superadmin123');

async function deliver(account, code) {
  const email = codeRecipient(account);
  if (process.env.SA_OTP_DEV_LOG === 'true') console.log(`[sa] console code for ${account}: ${code}`);
  try { await mailer.sendConsoleCode(email, code); return true; }
  catch (error) { console.error('[sa] could not send console code', error.message); return process.env.SA_OTP_DEV_LOG === 'true'; }
}

async function checkPassword(email, password, ip) {
  if (isMasterEmail(email)) {
    if (masterLock.until > Date.now()) return { status: 429, body: LOCKED };
    const expected = masterPassword();
    if (!expected || !sameText(password, expected)) {
      masterLock.fails += 1;
      if (masterLock.fails >= MAX_FAILS) { masterLock.fails = 0; masterLock.until = Date.now() + LOCK_MINUTES * 60000; }
      await saLog(email, 'Super Admin', 'LOGIN_FAILED', null, null, 'Wrong master password', ip);
      return { status: 401, body: INCORRECT };
    }
    masterLock.fails = 0;
    return { account: { email: masterEmail(), name: 'Super Admin', isMaster: true } };
  }
  const [rows] = await db.execute(
    `SELECT id, email, name, password_hash, CASE WHEN locked_until > SYSDATETIME() THEN 1 ELSE 0 END AS locked
     FROM super_admin_users WHERE email = ? AND is_active = TRUE`, [email],
  );
  const user = rows[0];
  if (user && Number(user.locked)) return { status: 429, body: LOCKED };
  const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !matches) {
    if (user) {
      await db.execute(
        `UPDATE super_admin_users SET
           failed_logins = CASE WHEN failed_logins + 1 >= ${MAX_FAILS} THEN 0 ELSE failed_logins + 1 END,
           locked_until = CASE WHEN failed_logins + 1 >= ${MAX_FAILS} THEN DATEADD(MINUTE, ${LOCK_MINUTES}, SYSDATETIME()) ELSE locked_until END
         WHERE id = ?`, [user.id],
      );
      await saLog(email, user.name, 'LOGIN_FAILED', 'super_admin_user', user.id, 'Wrong console password', ip);
    }
    return { status: 401, body: INCORRECT };
  }
  await db.execute('UPDATE super_admin_users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [user.id]);
  return { account: { email: user.email, name: user.name || user.email, isMaster: false } };
}

router.post('/login/start', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(422).json({ error: 'Enter your email and password.' });
  try {
    const result = await checkPassword(email, password, req.ip);
    if (!result.account) return res.status(result.status).json(result.body);
    const { challenge, code } = await createChallenge(result.account.email, req.ip);
    if (!(await deliver(result.account.email, code))) {
      return res.status(502).json({ error: 'We could not email your sign-in code. Try again in a minute or contact the platform owner.' });
    }
    res.json({ challenge_id: challenge, email_hint: maskEmail(codeRecipient(result.account.email)), expires_in: CODE_TTL_MINUTES * 60, resend_in: RESEND_GAP_SECONDS });
  } catch (error) {
    console.error('[sa] login start failed', error.message);
    res.status(500).json({ error: 'Sign-in is unavailable right now. Try again shortly.' });
  }
});

const challengeOf = (req) => {
  const value = String(req.body?.challenge_id || '');
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
};

router.post('/login/verify', async (req, res) => {
  const challenge = challengeOf(req);
  if (!challenge) return res.status(422).json({ error: 'Sign in again.' });
  try {
    const result = await checkCode(challenge, String(req.body?.code || '').trim());
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    let account;
    if (isMasterEmail(result.email)) account = { email: masterEmail(), name: 'Super Admin', isMaster: true };
    else {
      const [rows] = await db.execute('SELECT id, email, name FROM super_admin_users WHERE email = ? AND is_active = TRUE', [result.email]);
      if (!rows.length) return res.status(401).json({ error: 'Your console access was removed' });
      await db.execute('UPDATE super_admin_users SET last_login_at = SYSDATETIME() WHERE id = ?', [rows[0].id]);
      account = { email: rows[0].email, name: rows[0].name || rows[0].email, isMaster: false };
    }
    await saLog(account.email, account.name, 'LOGIN', null, null, `${account.name} signed in with password and email code`, req.ip);
    res.json({ token: signConsoleToken(account), email: account.email, name: account.name, is_master: account.isMaster, expires_in: SESSION_HOURS * 3600 });
  } catch (error) {
    console.error('[sa] login verify failed', error.message);
    res.status(500).json({ error: 'Could not check the code. Try again.' });
  }
});

router.post('/login/resend', async (req, res) => {
  const challenge = challengeOf(req);
  if (!challenge) return res.status(422).json({ error: 'Sign in again.' });
  try {
    const result = await resendCode(challenge);
    if (!result.ok) return res.status(result.status).json({ error: result.error, retry_in: result.retry_in });
    if (!(await deliver(result.email, result.code))) return res.status(502).json({ error: 'We could not email a new code. Try again in a minute.' });
    res.json({ message: 'A new code is on its way.', resend_in: RESEND_GAP_SECONDS, expires_in: CODE_TTL_MINUTES * 60 });
  } catch (error) {
    console.error('[sa] resend failed', error.message);
    res.status(500).json({ error: 'Could not send a new code. Try again.' });
  }
});

// Invite links: the helper chooses their own password. Links work once and expire after 48 hours.
const LINK_ENDED = { error: 'This setup link has expired or was already used. Ask the platform owner for a new one.' };
async function inviteFor(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const [rows] = await db.execute(
    'SELECT id, email, name FROM super_admin_users WHERE invite_token_hash = ? AND invite_expires_at > SYSDATETIME() AND is_active = TRUE',
    [keyedHash(`invite:${token}`)],
  );
  return rows[0] || null;
}

router.get('/setup-password', async (req, res) => {
  try {
    const user = await inviteFor(req.query.token);
    if (!user) return res.status(410).json(LINK_ENDED);
    res.json({ email: user.email, name: user.name });
  } catch { res.status(500).json({ error: 'Could not check this link. Try again.' }); }
});

router.post('/setup-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const user = await inviteFor(token);
    if (!user) return res.status(410).json(LINK_ENDED);
    const problem = passwordProblem(req.body?.password, user.email);
    if (problem) return res.status(422).json({ error: problem });
    const hash = await bcrypt.hash(String(req.body.password), 12);
    const [result] = await db.execute(
      `UPDATE super_admin_users SET password_hash = ?, password_set_at = SYSDATETIME(), invite_token_hash = NULL, invite_expires_at = NULL,
         failed_logins = 0, locked_until = NULL WHERE id = ? AND invite_token_hash = ?`,
      [hash, user.id, keyedHash(`invite:${token}`)],
    );
    if (Number(result?.affectedRows) !== 1) return res.status(410).json(LINK_ENDED);
    await saLog(user.email, user.name, 'SET_PASSWORD', 'super_admin_user', user.id, `${user.name || user.email} set their console password`, req.ip);
    res.json({ message: 'Password saved. You can sign in now.' });
  } catch (error) {
    console.error('[sa] setup password failed', error.message);
    res.status(500).json({ error: 'Could not save the password. Try again.' });
  }
});

module.exports = router;
