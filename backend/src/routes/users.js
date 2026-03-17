const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
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
      'SELECT id, name, email, mobile, employee_id, role, avatar, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    if (!users[0]) return res.status(404).json({ error: 'User not found' });
    if (req.userRole === 'company_admin') {
      return res.json({ ...users[0], role: 'company_admin' });
    }
    res.json(users[0]);
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
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.userId]);
    res.json({ message: 'Password changed' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
