const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { getAccessibleOrgIds } = require('../utils/orgAccess');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const { ensureUniqueEmployeeId } = require('../utils/employeeId');
const { sendResetOtp, sendResetLink } = require('../utils/mailer');
const router = express.Router();

// In-memory OTP & Token stores: { email → { otp/token, expiresAt } }
const otpStore = new Map();
const tokenStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes


const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, mobile, employee_id, role, team_code, company_code, company_name } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const hashed = await bcrypt.hash(password, 10);
    const userRole = ['admin', 'manager', 'person'].includes(role) ? role : 'person';
    const safeEmployeeId = await ensureUniqueEmployeeId(
      db,
      employee_id,
      userRole === 'manager' ? 'MGR' : 'EMP'
    );
    let resolvedOrgId = null;

    // PERSON: must provide team_code → get org from team
    if (userRole === 'person') {
      if (!team_code) return res.status(400).json({ error: 'Team Code is required for employees' });
      const [teams] = await db.execute('SELECT id, org_id FROM teams WHERE team_code = ?', [team_code]);
      if (teams.length === 0) return res.status(400).json({ error: 'Invalid Team Code' });
      resolvedOrgId = teams[0].org_id;
    }

    // MANAGER: must provide company_code to join existing org
    if (userRole === 'manager') {
      if (!company_code && !company_name) return res.status(400).json({ error: 'Company Code or Company Name required' });
      if (company_code) {
        const [orgs] = await db.execute('SELECT id FROM organizations WHERE company_code = ?', [company_code]);
        if (orgs.length === 0) return res.status(400).json({ error: 'Invalid Company Code' });
        resolvedOrgId = orgs[0].id;
      } else {
        // New company — create org
        const slug = company_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
        const code = 'ORG-' + company_name.substring(0, 4).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
        const [orgResult] = await db.execute(
          'INSERT INTO organizations (name, slug, company_code) VALUES (?, ?, ?)',
          [company_name, slug, code]
        );
        resolvedOrgId = orgResult.insertId;
      }
    }

    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, mobile, employee_id, role, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, normalizedEmail, hashed, mobile || null, safeEmployeeId, userRole, resolvedOrgId]
    );
    const userId = result.insertId;

    // Person: join team
    if (userRole === 'person') {
      const [teams] = await db.execute('SELECT id FROM teams WHERE team_code = ?', [team_code]);
      await db.execute('INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', [teams[0].id, userId, 'Member']);
    }

    // Manager: create their own team
    if (userRole === 'manager') {
      const tmCode = 'TM' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const [teamResult] = await db.execute(
        'INSERT INTO teams (name, type, team_code, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
        [`${name}'s Team`, 'General', tmCode, userId, resolvedOrgId]
      );
      await db.execute(
        'INSERT INTO team_members (team_id, user_id, role, is_reporting_manager) VALUES (?, ?, ?, ?)',
        [teamResult.insertId, userId, 'Reporting Manager', true]
      );
    }

    // Get org info for response
    let orgInfo = null;
    if (resolvedOrgId) {
      const [orgs] = await db.execute('SELECT name, company_code FROM organizations WHERE id = ?', [resolvedOrgId]);
      orgInfo = orgs[0] || null;
    }

    const orgIds = await getAccessibleOrgIds(db, userId, resolvedOrgId);
    const token = jwt.sign({ id: userId, role: userRole, org_id: resolvedOrgId, org_ids: orgIds }, process.env.JWT_SECRET);
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
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const [companyAdmins] = await db.execute(
      'SELECT * FROM company_admins WHERE email = ? LIMIT 1',
      [normalizedEmail]
    );
    const companyAdmin = companyAdmins[0] || null;

    const respondAsCompanyAdmin = async (ca) => {
      const bootstrap = await ensureCompanyAdminBootstrap(db, ca.id);
      const token = jwt.sign(
        {
          id: bootstrap.linkedUserId,
          role: 'company_admin',
          company_admin_id: ca.id,
          org_id: bootstrap.primaryOrgId,
          org_ids: bootstrap.orgIds,
        },
        process.env.JWT_SECRET
      );
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
          return respondAsCompanyAdmin(companyAdmin);
        }
      }
    }

    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (companyAdmin && companyAdmin.status === 'approved') {
      return respondAsCompanyAdmin(companyAdmin);
    }

    const orgIds = await getAccessibleOrgIds(db, user.id, user.org_id);
    const token = jwt.sign({ id: user.id, role: user.role, org_id: user.org_id, org_ids: orgIds }, process.env.JWT_SECRET);
    res.json({
      token,
      id: user.id,
      name: user.name,
      email: normalizedEmail,
      role: user.role,
      org_id: user.org_id,
      org_ids: orgIds,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Step 1 (Link flow): Send Password Reset Link to Email ──
router.post('/send-reset-link', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!normalizedEmail) return res.status(422).json({ error: 'Email is required' });

    // Check if email exists (users or company_admins)
    const [users] = await db.execute('SELECT id FROM users WHERE email = ? AND is_deleted = FALSE LIMIT 1', [normalizedEmail]);
    const [cas]   = await db.execute('SELECT id FROM company_admins WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (!users.length && !cas.length) return res.status(404).json({ error: 'No account found for this email' });

    // Generate 64-char crypto token
    const token = crypto.randomBytes(32).toString('hex');
    tokenStore.set(token, { email: normalizedEmail, expiresAt: Date.now() + LINK_TTL_MS });

    const frontendOrigin = req.headers.origin || process.env.APP_FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendOrigin}/forgot-password?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendResetLink(normalizedEmail, resetUrl);
    res.json({ message: 'Password reset link sent to your email. Valid for 15 minutes.' });
  } catch (error) {
    console.error('[send-reset-link]', error.message);
    res.status(500).json({ error: 'Failed to send reset link. Check email configuration.' });
  }
});

// ── Step 1 (OTP flow): Send OTP to email ──
router.post('/send-reset-otp', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!normalizedEmail) return res.status(422).json({ error: 'Email is required' });

    // Check if email exists (users or company_admins)
    const [users] = await db.execute('SELECT id FROM users WHERE email = ? AND is_deleted = FALSE LIMIT 1', [normalizedEmail]);
    const [cas]   = await db.execute('SELECT id FROM company_admins WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (!users.length && !cas.length) return res.status(404).json({ error: 'No account found for this email' });

    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    otpStore.set(normalizedEmail, { otp, expiresAt: Date.now() + OTP_TTL_MS });

    await sendResetOtp(normalizedEmail, otp);
    res.json({ message: 'OTP sent to your email. Valid for 10 minutes.' });
  } catch (error) {
    console.error('[send-reset-otp]', error.message);
    res.status(500).json({ error: 'Failed to send OTP. Check email configuration.' });
  }
});

// ── Step 2: Verify Token / OTP + set new password ──
router.post('/reset-password', async (req, res) => {
  try {
    const { email, password, token, otp } = req.body;
    let normalizedEmail = String(email || '').trim().toLowerCase();
    const nextPassword = String(password || '');

    if (!nextPassword) {
      return res.status(422).json({ error: 'New password is required' });
    }

    // ── Token or OTP Validation ──
    if (token) {
      const stored = tokenStore.get(String(token).trim());
      if (!stored) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
      if (Date.now() > stored.expiresAt) {
        tokenStore.delete(String(token).trim());
        return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
      }
      normalizedEmail = stored.email;
      tokenStore.delete(String(token).trim()); // consumed
    } else if (otp) {
      if (!normalizedEmail) return res.status(422).json({ error: 'Email is required' });
      const stored = otpStore.get(normalizedEmail);
      if (!stored) return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(normalizedEmail);
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
      }
      if (stored.otp !== String(otp).trim()) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }
      otpStore.delete(normalizedEmail); // consumed
    } else {
      return res.status(422).json({ error: 'Reset link token or OTP is required' });
    }

    if (nextPassword.length < 4) {
      return res.status(422).json({ error: 'Password must be at least 4 characters' });
    }

    const hashed = await bcrypt.hash(nextPassword, 10);
    let updated = false;

    const [companyAdmins] = await db.execute(
      'SELECT id FROM company_admins WHERE email = ?',
      [normalizedEmail]
    );
    if (companyAdmins.length > 0) {
      await db.execute('UPDATE company_admins SET password = ? WHERE email = ?', [hashed, normalizedEmail]);
      await db.execute('UPDATE users SET password = ? WHERE email = ?', [hashed, normalizedEmail]);
      updated = true;
    } else {
      const [users] = await db.execute(
        'SELECT id FROM users WHERE email = ? AND is_deleted = FALSE',
        [normalizedEmail]
      );
      if (users.length > 0) {
        await db.execute('UPDATE users SET password = ? WHERE email = ? AND is_deleted = FALSE', [hashed, normalizedEmail]);
        updated = true;
      }
    }

    if (!updated) return res.status(404).json({ error: 'No account found for this email' });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});



module.exports = router;
