const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, mobile, employee_id, role, team_code, company_code, company_name } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const userRole = ['admin', 'manager', 'person'].includes(role) ? role : 'person';
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
      [name, email, hashed, mobile || null, employee_id || null, userRole, resolvedOrgId]
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

    const token = jwt.sign({ id: userId, role: userRole, org_id: resolvedOrgId }, process.env.JWT_SECRET);
    res.json({ token, name, email, role: userRole, org_id: resolvedOrgId, org_name: orgInfo?.name, company_code: orgInfo?.company_code });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, role: user.role, org_id: user.org_id }, process.env.JWT_SECRET);
    res.json({ token, name: user.name, email: user.email, role: user.role, org_id: user.org_id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
