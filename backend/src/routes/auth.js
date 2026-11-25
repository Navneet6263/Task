const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const { companyOfCoAdmin } = require('../services/coAdmins');
const { getAccessibleOrgIds } = require('../utils/orgAccess');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const { ensureUniqueEmployeeId } = require('../utils/employeeId');
const mailer = require('../utils/mailer');
const { normalizeCode, accountFlags, syncQuietly } = require('../services/employeeAccounts');
const { isModuleEnabled } = require('../services/orgModules');
const { issueSession, revokeUserSessions } = require('../services/sessions');
const guard = require('../services/signInGuard');
const router = express.Router();

// In-memory OTP & Token stores: { email → { otp/token, expiresAt } }
const otpStore = new Map();
const tokenStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const OTP_TRIES = 5;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reset links always point at our own site. Never build them from the request (Origin header):
// anyone could then make us email a real reset link that opens their site.
const appUrl = () => String(process.env.APP_FRONTEND_URL || process.env.FRONTEND_URL || 'https://task.greencall.in').trim().replace(/\/+$/, '');
// The same answer whether or not the email has an account, so nobody can test which emails are signed up.
const RESET_SENT = 'If an account uses this email, we have sent it a reset link. It works for 15 minutes.';
const OTP_SENT = 'If an account uses this email, we have sent it a code. It works for 10 minutes.';
const sameCode = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
async function accountExists(email) {
  const [users] = await db.execute('SELECT id FROM users WHERE email = ? AND is_deleted = FALSE LIMIT 1', [email]);
  const [cas] = await db.execute('SELECT id FROM company_admins WHERE email = ? LIMIT 1', [email]);
  return users.length > 0 || cas.length > 0;
}


const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

// Compared when no account matches, so a wrong code takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Employee-code sign-in, only for organizations where the super admin turned it on.
// The company code is optional; it is needed only if the same code and password fit two companies.
async function findEmployeeAccount(rawCode, rawCompanyCode, password) {
  const code = normalizeCode(rawCode);
  const companyCode = String(rawCompanyCode || '').trim().toUpperCase();
  if (!code || !password) return { status: 422, error: 'Enter your employee code and password' };
  const [rows] = await db.execute(
    `SELECT TOP 5 u.* FROM users u
     JOIN organizations o ON o.id = u.org_id
     JOIN org_modules m ON m.org_id = u.org_id AND m.module_key = 'hrms_login' AND m.is_enabled = 1
     WHERE u.login_code = ? AND u.is_deleted = 0${companyCode ? ' AND o.company_code = ?' : ''}`,
    companyCode ? [code, companyCode] : [code]
  );
  if (!rows.length) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { status: 401, error: 'Wrong employee code or password' };
  }
  // The wrong-password count is per account, so the same code in another company is never locked with it.
  // A locked account is not even compared, so a right guess during the lock tells nothing.
  const keyOf = (row) => guard.keyOf('user', row.id);
  const lockedBefore = rows.filter((row) => guard.lockedFor(keyOf(row)));
  const open = rows.filter((row) => !lockedBefore.includes(row));
  const matches = [];
  for (const row of open) if (await bcrypt.compare(password, row.password)) matches.push(row);
  if (matches.length > 1) return { status: 409, code: 'COMPANY_CODE_REQUIRED', error: 'Add your company code to sign in' };
  if (matches.length) { guard.succeeded(keyOf(matches[0])); return { user: matches[0] }; }
  open.forEach((row) => guard.failed(keyOf(row)));
  const wait = Math.max(0, ...lockedBefore.map((row) => guard.lockedFor(keyOf(row))));
  if (wait) return { status: 429, ...guard.lockedMessage(wait, 'Ask your admin for a new one-time password if you forgot it.') };
  return { status: 401, error: 'Wrong employee code or password' };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, mobile, employee_id, role, team_code } = req.body;
    // Signing up only ever joins a team as an employee. A new company goes through "Register company",
    // which a platform admin approves; managers and admins are added by their company admin.
    if (role === 'manager') {
      return res.status(403).json({ error: 'To start a new company, use Register company. A platform admin approves it. To join as a manager, ask your company admin to add you.' });
    }
    const userRole = 'person';
    const normalizedEmail = normalizeEmail(email);
    if (!String(name || '').trim() || String(name).length > 150) return res.status(422).json({ error: 'Enter your name' });
    if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 255) return res.status(422).json({ error: 'Enter a valid email address' });
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) return res.status(422).json({ error: `Use a password of at least ${MIN_PASSWORD} characters` });
    if (password.length > 128) return res.status(422).json({ error: 'The password is too long' });
    const [taken] = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (taken.length) return res.status(409).json({ error: 'An account with this email already exists. Sign in, or reset your password.' });
    const hashed = await bcrypt.hash(password, 10);
    const safeEmployeeId = await ensureUniqueEmployeeId(db, employee_id, 'EMP');
    let resolvedOrgId = null;
    let joinTeamId = null;

    // PERSON: must provide team_code → get org from team
    if (userRole === 'person') {
      if (!team_code) return res.status(400).json({ error: 'Team Code is required for employees' });
      const [teams] = await db.execute('SELECT id, org_id FROM teams WHERE team_code = ? AND is_deleted = FALSE', [String(team_code).trim().toUpperCase()]);
      if (teams.length === 0) return res.status(400).json({ error: 'Invalid Team Code' });
      // Companies on employee-code sign-in create every account themselves, so a join code lets no one in.
      if (await isModuleEnabled(teams[0].org_id, 'hrms_login')) {
        return res.status(403).json({ error: 'Your company creates accounts for you. Ask your admin for your sign-in details.' });
      }
      resolvedOrgId = teams[0].org_id;
      joinTeamId = teams[0].id;
    }

    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, mobile, employee_id, role, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, normalizedEmail, hashed, mobile || null, safeEmployeeId, userRole, resolvedOrgId]
    );
    const userId = result.insertId;

    // Person: join team
    if (userRole === 'person') {
      await db.execute('INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', [joinTeamId, userId, 'Member']);
    }

    // Get org info for response
    let orgInfo = null;
    if (resolvedOrgId) {
      const [orgs] = await db.execute('SELECT name, company_code FROM organizations WHERE id = ?', [resolvedOrgId]);
      orgInfo = orgs[0] || null;
    }

    const orgIds = await getAccessibleOrgIds(db, userId, resolvedOrgId);
    const token = await issueSession(req, { id: userId, role: userRole, org_id: resolvedOrgId, org_ids: orgIds }, false);
    res.json({
      token,
      id: userId,
      name,
      email: normalizedEmail,
      role: userRole,
      org_id: resolvedOrgId,
      org_ids: orgIds,
      org_name: orgInfo?.name,
      company_code: orgInfo?.company_code,
    });
  } catch (error) {
    console.error('[register]', error.message);
    res.status(400).json({ error: 'Could not create the account. Check the details and try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (req.body.employee_code !== undefined) {
      const found = await findEmployeeAccount(req.body.employee_code, req.body.company_code, password);
      if (!found.user) return res.status(found.status).json({ error: found.error, ...(found.code ? { code: found.code } : {}) });
      const employee = found.user;
      const employeeOrgIds = await getAccessibleOrgIds(db, employee.id, employee.org_id);
      const employeeToken = await issueSession(req, { id: employee.id, role: employee.role, org_id: employee.org_id, org_ids: employeeOrgIds }, req.body.remember);
      syncQuietly(employee.org_id);
      const flags = accountFlags(employee);
      return res.json({
        token: employeeToken,
        id: employee.id,
        name: employee.name,
        email: flags.needs_email ? '' : employee.email,
        role: employee.role,
        org_id: employee.org_id,
        org_ids: employeeOrgIds,
        ...flags,
      });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) return res.status(422).json({ error: 'Enter your email and password' });
    const lockKey = guard.keyOf('email', normalizedEmail);
    const wait = guard.lockedFor(lockKey);
    if (wait) return res.status(429).json(guard.lockedMessage(wait));

    const [companyAdmins] = await db.execute(
      'SELECT * FROM company_admins WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    const companyAdmin = companyAdmins[0] || null;

    const respondAsCompanyAdmin = async (ca) => {
      const bootstrap = await ensureCompanyAdminBootstrap(db, ca.id);
      const token = await issueSession(req, {
        id: bootstrap.linkedUserId,
        role: 'company_admin',
        company_admin_id: ca.id,
        org_id: bootstrap.primaryOrgId,
        org_ids: bootstrap.orgIds,
      }, req.body.remember);
      return res.json({
        token,
        id: bootstrap.linkedUserId,
        name: ca.name,
        email: ca.email,
        role: 'company_admin',
        org_id: bootstrap.primaryOrgId,
        org_ids: bootstrap.orgIds,
        limits: {
          max_companies: ca.max_companies,
          max_managers: ca.max_managers_per_company,
          max_staff: ca.max_staff_per_company,
        },
      });
    };

    if (companyAdmin) {
      const companyPasswordValid = await bcrypt.compare(password, companyAdmin.password);
      if (companyPasswordValid) {
        if (companyAdmin.status === 'pending') {
          return res.status(403).json({ error: 'Account pending approval', code: 'PENDING' });
        }
        if (companyAdmin.status === 'rejected') {
          return res.status(403).json({ error: `Account rejected: ${companyAdmin.rejected_reason || ''}`, code: 'REJECTED' });
        }
        if (companyAdmin.status === 'approved') {
          guard.succeeded(lockKey);
          return await respondAsCompanyAdmin(companyAdmin); // await: a failure here must reach the catch below
        }
      }
    }

    const [users] = await db.execute('SELECT * FROM users WHERE email = ? AND is_deleted = FALSE', [normalizedEmail]);
    const user = users[0];
    // Compared even when no account matches, so a wrong email takes as long as a wrong password.
    const valid = await bcrypt.compare(password, user?.password || DUMMY_HASH);
    if (!user || !valid) {
      guard.failed(lockKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    guard.succeeded(lockKey);

    if (companyAdmin && companyAdmin.status === 'approved') {
      // The owner signed in with the password of their linked login, not the company copy (it was changed from
      // Settings before both copies were kept in step). Make the company copy match, or the bootstrap below
      // would copy the old password back and the next sign-in would fail.
      if (user.password !== companyAdmin.password) {
        await db.execute('UPDATE company_admins SET password = ? WHERE id = ?', [user.password, companyAdmin.id]);
        companyAdmin.password = user.password;
      }
      return await respondAsCompanyAdmin(companyAdmin); // await: a failure here must reach the catch below
    }

    // A co-admin signs in with their own account and gets the company admin view of that company.
    const coCompany = await companyOfCoAdmin(user.id);
    if (coCompany) {
      const [coOrgs] = await db.execute('SELECT id FROM organizations WHERE company_admin_id = ? ORDER BY id ASC', [coCompany.id]);
      const coOrgIds = coOrgs.map((org) => org.id);
      const primary = coOrgIds.includes(user.org_id) ? user.org_id : coOrgIds[0];
      const coToken = await issueSession(req, { id: user.id, role: 'company_admin', company_admin_id: coCompany.id, co_admin: true, org_id: primary, org_ids: coOrgIds }, req.body.remember);
      return res.json({
        token: coToken, id: user.id, name: user.name, email: normalizedEmail, role: 'company_admin', co_admin: true,
        org_id: primary, org_ids: coOrgIds,
        limits: { max_companies: coCompany.max_companies, max_managers: coCompany.max_managers_per_company, max_staff: coCompany.max_staff_per_company },
        ...accountFlags(user),
      });
    }

    const orgIds = await getAccessibleOrgIds(db, user.id, user.org_id);
    const token = await issueSession(req, { id: user.id, role: user.role, org_id: user.org_id, org_ids: orgIds }, req.body.remember);
    res.json({
      token,
      id: user.id,
      name: user.name,
      email: normalizedEmail,
      role: user.role,
      org_id: user.org_id,
      org_ids: orgIds,
      ...accountFlags(user),
    });
  } catch (error) {
    console.error('[login]', error.message);
    res.status(500).json({ error: 'Could not sign you in right now. Try again.' });
  }
});

// ── Step 1 (Link flow): Send Password Reset Link to Email ──
router.post('/send-reset-link', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(normalizedEmail)) return res.status(422).json({ error: 'Enter a valid email address' });
    res.json({ message: RESET_SENT });
    // Sent after answering, so a slow mail server does not reveal whether the account exists.
    if (!(await accountExists(normalizedEmail))) return;
    const token = crypto.randomBytes(32).toString('hex');
    tokenStore.set(token, { email: normalizedEmail, expiresAt: Date.now() + LINK_TTL_MS });
    const resetUrl = `${appUrl()}/forgot-password?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
    await mailer.sendResetLink(normalizedEmail, resetUrl);
  } catch (error) {
    console.error('[send-reset-link]', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Could not send the reset link. Try again in a minute.' });
  }
});

// ── Step 1 (OTP flow): Send OTP to email ──
router.post('/send-reset-otp', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!EMAIL_RE.test(normalizedEmail)) return res.status(422).json({ error: 'Enter a valid email address' });
    res.json({ message: OTP_SENT });
    if (!(await accountExists(normalizedEmail))) return;
    const otp = String(crypto.randomInt(100000, 1000000));
    otpStore.set(normalizedEmail, { otp, expiresAt: Date.now() + OTP_TTL_MS, tries: 0 });
    await mailer.sendResetOtp(normalizedEmail, otp);
  } catch (error) {
    console.error('[send-reset-otp]', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Could not send the code. Try again in a minute.' });
  }
});

// ── Step 2: Verify Token / OTP + set new password ──
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, otp } = req.body;
    let normalizedEmail = normalizeEmail(email);
    const nextPassword = typeof req.body.password === 'string' ? req.body.password : '';

    if (nextPassword.length < MIN_PASSWORD) {
      return res.status(422).json({ error: `Use a password of at least ${MIN_PASSWORD} characters` });
    }
    if (nextPassword.length > 128) return res.status(422).json({ error: 'The password is too long' });

    // ── Token or OTP Validation ──
    if (token) {
      const key = String(token).trim();
      const stored = tokenStore.get(key);
      if (!stored || Date.now() > stored.expiresAt) {
        tokenStore.delete(key);
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      }
      normalizedEmail = stored.email;
      tokenStore.delete(key); // consumed
    } else if (otp) {
      if (!normalizedEmail) return res.status(422).json({ error: 'Email is required' });
      const stored = otpStore.get(normalizedEmail);
      if (!stored || Date.now() > stored.expiresAt) {
        otpStore.delete(normalizedEmail);
        return res.status(400).json({ error: 'This code is invalid or has expired. Please request a new one.' });
      }
      if (!sameCode(stored.otp, String(otp).trim())) {
        stored.tries += 1;
        // A few wrong guesses end the code, so it cannot be guessed.
        if (stored.tries >= OTP_TRIES) {
          otpStore.delete(normalizedEmail);
          return res.status(400).json({ error: 'Too many wrong codes. Please request a new one.' });
        }
        return res.status(400).json({ error: 'Wrong code. Check the email and try again.' });
      }
      otpStore.delete(normalizedEmail); // consumed
    } else {
      return res.status(422).json({ error: 'Reset link token or OTP is required' });
    }

    const hashed = await bcrypt.hash(nextPassword, 10);
    const [companyAdmins] = await db.execute('SELECT id FROM company_admins WHERE email = ?', [normalizedEmail]);
    if (companyAdmins.length > 0) {
      await db.execute('UPDATE company_admins SET password = ? WHERE email = ?', [hashed, normalizedEmail]);
      await db.execute('UPDATE users SET password = ?, must_change_password = 0 WHERE email = ?', [hashed, normalizedEmail]);
    } else {
      await db.execute('UPDATE users SET password = ?, must_change_password = 0 WHERE email = ? AND is_deleted = FALSE', [hashed, normalizedEmail]);
    }
    const [accounts] = await db.execute('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (!accounts.length && !companyAdmins.length) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    // A new password signs this account out everywhere: whoever knew the old one is out too.
    for (const account of accounts) await revokeUserSessions(account.id, { reason: 'password_reset' });
    guard.succeeded(guard.keyOf('email', normalizedEmail));
    res.json({ message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    console.error('[reset-password]', error.message);
    res.status(500).json({ error: 'Could not update the password. Try again.' });
  }
});


module.exports = router;
