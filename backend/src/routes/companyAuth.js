const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { issueSession } = require('../services/sessions');
const guard = require('../services/signInGuard');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const router = express.Router();

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Compared when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('greentask-company-placeholder', 10);

// Register company (goes to pending approval)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, mobile, company_description, expected_companies, expected_managers, expected_staff } = req.body;
    if (!name || !email || !password) return res.status(422).json({ error: 'name, email, password required' });
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(normalizedEmail)) return res.status(422).json({ error: 'Enter a valid email address' });
    if (typeof password !== 'string' || password.length < 8) return res.status(422).json({ error: 'Use a password of at least 8 characters' });
    if (password.length > 128) return res.status(422).json({ error: 'The password is too long' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      `INSERT INTO company_admins (name, email, password, mobile, company_description, expected_companies, expected_managers, expected_staff)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, normalizedEmail, hashed, mobile || null, company_description || null,
       expected_companies || 1, expected_managers || 5, expected_staff || 20]
    );
    res.status(201).json({ message: 'Registration submitted. Awaiting approval.', id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.number === 2627 || e.number === 2601) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    console.error('[company-auth/register]', e.message);
    res.status(400).json({ error: 'Could not submit the registration. Check the details and try again.' });
  }
});

// Login company admin
router.post('/login', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!normalizedEmail || !password) return res.status(422).json({ error: 'Enter your email and password' });
    // Same per-account count as the main sign-in, so both doors share one limit.
    const lockKey = guard.keyOf('email', normalizedEmail);
    const wait = guard.lockedFor(lockKey);
    if (wait) return res.status(429).json(guard.lockedMessage(wait));
    const [rows] = await db.execute('SELECT * FROM company_admins WHERE email = ?', [normalizedEmail]);
    const ca = rows[0];
    const valid = await bcrypt.compare(password, ca?.password || DUMMY_HASH);
    if (!ca || !valid) {
      guard.failed(lockKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    guard.succeeded(lockKey);
    if (ca.status === 'pending') return res.status(403).json({ error: 'Account pending approval', code: 'PENDING' });
    if (ca.status === 'rejected') return res.status(403).json({ error: 'Account rejected: ' + (ca.rejected_reason || ''), code: 'REJECTED' });

    const bootstrap = await ensureCompanyAdminBootstrap(db, ca.id);
    const orgIds = bootstrap.orgIds;

    const token = await issueSession(req, {
      id: bootstrap.linkedUserId,
      role: 'company_admin',
      company_admin_id: ca.id,
      org_id: bootstrap.primaryOrgId,
      org_ids: orgIds,
    }, req.body.remember);
    res.json({
      token, name: ca.name, email: ca.email, role: 'company_admin',
      id: bootstrap.linkedUserId,
      user_id: bootstrap.linkedUserId,
      org_id: bootstrap.primaryOrgId,
      org_ids: orgIds,
      limits: { max_companies: ca.max_companies, max_managers: ca.max_managers_per_company, max_staff: ca.max_staff_per_company }
    });
  } catch (e) {
    console.error('[company-auth/login] Error:', e.message);
    res.status(500).json({ error: 'Could not sign you in right now. Try again.' });
  }
});

module.exports = router;
