const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { ensureCompanyAdminBootstrap } = require('../utils/companyAdminBootstrap');
const router = express.Router();

// Register company (goes to pending approval)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, mobile, company_description, expected_companies, expected_managers, expected_staff } = req.body;
    if (!name || !email || !password) return res.status(422).json({ error: 'name, email, password required' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      `INSERT INTO company_admins (name, email, password, mobile, company_description, expected_companies, expected_managers, expected_staff)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashed, mobile || null, company_description || null,
       expected_companies || 1, expected_managers || 5, expected_staff || 20]
    );
    res.status(201).json({ message: 'Registration submitted. Awaiting approval.', id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.number === 2627 || e.number === 2601) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    res.status(400).json({ error: e.message });
  }
});

// Login company admin
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM company_admins WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const ca = rows[0];
    const valid = await bcrypt.compare(password, ca.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    if (ca.status === 'pending') return res.status(403).json({ error: 'Account pending approval', code: 'PENDING' });
    if (ca.status === 'rejected') return res.status(403).json({ error: 'Account rejected: ' + (ca.rejected_reason || ''), code: 'REJECTED' });

    const bootstrap = await ensureCompanyAdminBootstrap(db, ca.id);
    const orgIds = bootstrap.orgIds;

    const token = jwt.sign(
      {
        id: bootstrap.linkedUserId,
        role: 'company_admin',
        company_admin_id: ca.id,
        org_id: bootstrap.primaryOrgId,
        org_ids: orgIds,
      },
      process.env.JWT_SECRET
    );
    res.json({
      token, name: ca.name, email: ca.email, role: 'company_admin',
      user_id: bootstrap.linkedUserId,
      org_id: bootstrap.primaryOrgId,
      org_ids: orgIds,
      limits: { max_companies: ca.max_companies, max_managers: ca.max_managers_per_company, max_staff: ca.max_staff_per_company }
    });
  } catch (e) {
    console.error('[company-auth/login] Error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
