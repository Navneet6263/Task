const bcrypt = require('bcryptjs');
const db = require('../config/database');
const {
  normalizeCode, isValidCode, placeholderEmail, isPlaceholderEmail, visibleEmail, isEmail,
  temporaryPassword, syncAllTasksMembership,
} = require('./employeeAccounts');

// Employees from an HRMS sheet, shared by the company admin's Settings and the platform console.
const ROLES = ['admin', 'manager', 'person'];
const MAX_ROWS = 2000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const isTrue = (value) => value === true || value === 1;
const text = (value, max) => {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
};

async function listEmployees(orgId) {
  const [rows] = await db.execute(
    `SELECT u.id, u.name, u.email, u.mobile, u.login_code, u.role, u.department, u.designation, u.work_location,
       u.must_change_password, u.last_active, u.created_at, m.name AS reports_to_name, m.login_code AS reports_to_code
     FROM users u LEFT JOIN users m ON m.id = u.reports_to
     WHERE u.org_id = ? AND u.is_deleted = 0 AND u.role IN ('admin', 'manager', 'person')
     ORDER BY CASE WHEN u.login_code IS NULL THEN 1 ELSE 0 END, u.login_code, u.name`,
    [orgId]
  );
  return rows.map(({ must_change_password: pending, ...row }) => ({
    ...row,
    email: visibleEmail(row.email),
    has_email: !isPlaceholderEmail(row.email),
    first_sign_in_pending: isTrue(pending),
  }));
}

// Reads and checks one sheet row; returns { row } or { reason }.
function readRow(raw) {
  const code = normalizeCode(raw?.code);
  if (!code) return { reason: 'Employee code is empty' };
  if (!isValidCode(code)) return { reason: 'Employee code has characters we cannot use' };
  const name = text(raw.name, 255);
  if (!name) return { reason: 'Name is empty' };
  const email = text(raw.email, 255)?.toLowerCase() || null;
  return {
    row: {
      code, name,
      email: email && isEmail(email) && !isPlaceholderEmail(email) ? email : null,
      mobile: text(raw.mobile, 20),
      department: text(raw.department, 150),
      designation: text(raw.designation, 150),
      location: text(raw.location, 100),
      managerCode: normalizeCode(raw.manager_code) || null,
      role: ROLES.includes(raw.role) ? raw.role : 'person',
    },
  };
}

async function freeEmployeeId(code, orgId) {
  for (const candidate of [code, `${code}-${orgId}`]) {
    const [[taken]] = await db.execute('SELECT TOP 1 id FROM users WHERE employee_id = ?', [candidate]);
    if (!taken) return candidate;
  }
  return `${code}-${orgId}-${Date.now().toString(36).toUpperCase()}`;
}

async function emailFree(email) {
  const [[user]] = await db.execute('SELECT TOP 1 id FROM users WHERE email = ?', [email]);
  const [[admin]] = await db.execute('SELECT TOP 1 id FROM company_admins WHERE email = ?', [email]);
  return !user && !admin;
}

async function findOrCreateTeam(orgId, name, createdBy, created) {
  const [[team]] = await db.execute('SELECT TOP 1 id FROM teams WHERE org_id = ? AND name = ? AND is_deleted = 0', [orgId, name]);
  if (team) return team.id;
  const code = `TM${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const [result] = await db.execute(
    'INSERT INTO teams (name, type, team_code, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
    [name, 'Department', code, createdBy, orgId]
  );
  created.push(name);
  return result.insertId;
}

const addMember = (teamId, userId, role) => db.execute(
  'INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', [teamId, userId, role]
);

// The platform console has no user of its own; new teams are recorded under the organization's admin.
async function orgAdminUserId(orgId) {
  const [[admin]] = await db.execute(
    `SELECT TOP 1 u.id FROM users u WHERE u.is_deleted = 0 AND u.role = 'admin'
       AND (u.org_id = ? OR EXISTS (SELECT 1 FROM user_org_access oa WHERE oa.user_id = u.id AND oa.org_id = ?))
     ORDER BY u.id`,
    [orgId, orgId]
  );
  return admin?.id || null;
}

// Import or refresh employees from the HRMS sheet. Matches on employee code, so running the same
// sheet again updates people instead of duplicating them. New people get a one-time password.
// actorId: the admin doing it (never demoted or turned off by their own import), or null.
async function importEmployees(orgId, actorId, body) {
  const input = Array.isArray(body.rows) ? body.rows : [];
  if (!input.length) throw fail(422, 'The sheet has no employees');
  if (input.length > MAX_ROWS) throw fail(422, `Import at most ${MAX_ROWS} employees at a time`);
  const teamMode = ['one', 'department', 'none'].includes(body.teams) ? body.teams : 'none';
  const teamOwner = actorId || await orgAdminUserId(orgId);
  if (teamMode !== 'none' && !teamOwner) throw fail(422, 'This organization has no admin yet, so teams cannot be created. Choose "Don\'t change teams".');

  const rows = [];
  const skipped = [];
  const seen = new Set();
  input.forEach((raw, index) => {
    const { row, reason } = readRow(raw);
    if (!row) return skipped.push({ line: index + 1, code: normalizeCode(raw?.code) || '', reason });
    if (seen.has(row.code)) return skipped.push({ line: index + 1, code: row.code, reason: 'Same employee code appears twice' });
    seen.add(row.code);
    rows.push(row);
  });

  const [existing] = await db.execute(
    'SELECT id, email, login_code, role FROM users WHERE org_id = ? AND is_deleted = 0', [orgId]
  );
  const byCode = new Map(existing.filter((u) => u.login_code).map((u) => [normalizeCode(u.login_code), u]));
  const byEmail = new Map(existing.map((u) => [String(u.email).toLowerCase(), u]));

  const idByCode = new Map();
  const passwords = [];
  const emailSkipped = [];
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const match = byCode.get(row.code) || (row.email && byEmail.get(row.email));
    if (match) {
      // Never change the role of the admin doing the import, so they cannot lock themselves out.
      const role = actorId && Number(match.id) === Number(actorId) ? match.role : row.role;
      const wantsEmail = row.email && isPlaceholderEmail(match.email);
      const takeEmail = wantsEmail && await emailFree(row.email);
      if (wantsEmail && !takeEmail) emailSkipped.push({ code: row.code, email: row.email });
      await db.execute(
        `UPDATE users SET name = ?, login_code = ?, mobile = COALESCE(?, mobile), department = ?, designation = ?, work_location = ?,
           role = ?${takeEmail ? ', email = ?' : ''}, updated_at = SYSDATETIME() WHERE id = ?`,
        [row.name, row.code, row.mobile, row.department, row.designation, row.location, role, ...(takeEmail ? [row.email] : []), match.id]
      );
      idByCode.set(row.code, match.id);
      updated += 1;
      continue;
    }
    const password = temporaryPassword();
    const freeEmail = row.email && await emailFree(row.email);
    if (row.email && !freeEmail) emailSkipped.push({ code: row.code, email: row.email });
    const email = freeEmail ? row.email : placeholderEmail(row.code, orgId);
    const [result] = await db.execute(
      `INSERT INTO users (name, email, password, mobile, employee_id, role, org_id, login_code, must_change_password, department, designation, work_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [row.name, email, await bcrypt.hash(password, 10), row.mobile, await freeEmployeeId(row.code, orgId), row.role, orgId, row.code,
        row.department, row.designation, row.location]
    );
    idByCode.set(row.code, result.insertId);
    passwords.push({ code: row.code, name: row.name, password, email: isPlaceholderEmail(email) ? '' : email });
    created += 1;
  }

  // Reporting managers from the sheet (they may be people already in the app).
  byCode.forEach((user, code) => { if (!idByCode.has(code)) idByCode.set(code, user.id); });
  for (const row of rows) {
    const managerId = row.managerCode && row.managerCode !== row.code ? idByCode.get(row.managerCode) || null : null;
    await db.execute('UPDATE users SET reports_to = ? WHERE id = ?', [managerId, idByCode.get(row.code)]);
  }

  // Teams: one team for everyone, or one per department. A manager joins the teams of the people
  // who report to them, so they always see their people's tasks.
  const teamsCreated = [];
  if (teamMode === 'one') {
    let teamId = Number(body.team_id) || null;
    if (teamId) {
      const [[team]] = await db.execute('SELECT id FROM teams WHERE id = ? AND org_id = ? AND is_deleted = 0', [teamId, orgId]);
      if (!team) teamId = null;
    }
    if (!teamId) teamId = await findOrCreateTeam(orgId, text(body.team_name, 255) || 'All staff', teamOwner, teamsCreated);
    for (const row of rows) await addMember(teamId, idByCode.get(row.code), row.role === 'person' ? 'Member' : 'Manager');
  } else if (teamMode === 'department') {
    const teamByDept = new Map();
    for (const row of rows) {
      const dept = row.department || 'General';
      if (!teamByDept.has(dept)) teamByDept.set(dept, await findOrCreateTeam(orgId, dept, teamOwner, teamsCreated));
      await addMember(teamByDept.get(dept), idByCode.get(row.code), row.role === 'person' ? 'Member' : 'Manager');
    }
    for (const row of rows) {
      const managerId = row.managerCode ? idByCode.get(row.managerCode) : null;
      if (managerId) await addMember(teamByDept.get(row.department || 'General'), managerId, 'Reporting Manager');
    }
  }

  // People who left: imported earlier but missing from this sheet. Admins and the importer stay.
  let deactivated = 0;
  if (body.deactivate_missing === true) {
    const gone = existing.filter((u) => u.login_code && !seen.has(normalizeCode(u.login_code)) && u.role !== 'admin' && Number(u.id) !== Number(actorId));
    for (const user of gone) {
      await db.execute('UPDATE users SET is_deleted = 1, deleted_at = SYSDATETIME() WHERE id = ? AND org_id = ?', [user.id, orgId]);
      deactivated += 1;
    }
  }

  await syncAllTasksMembership(orgId);
  return { created, updated, deactivated, skipped, teams_created: teamsCreated, passwords, email_skipped: emailSkipped };
}

// A new one-time password for someone who lost theirs. They must change it after signing in.
async function resetEmployeePassword(orgId, userId) {
  const [[user]] = await db.execute(
    "SELECT id, name, email, login_code FROM users WHERE id = ? AND org_id = ? AND is_deleted = 0 AND role IN ('admin', 'manager', 'person')",
    [userId, orgId]
  );
  if (!user) throw fail(404, 'Employee not found in this organization');
  const password = temporaryPassword();
  await db.execute('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?', [await bcrypt.hash(password, 10), user.id]);
  return { code: user.login_code || '', name: user.name, email: visibleEmail(user.email), password };
}

// Everyone imported from the HRMS, with email and password, ready to hand out. Passwords are stored
// only as hashes, so people who have not signed in yet get a NEW one-time password now (any older
// sheet stops working for them). People who already chose their own password keep it.
async function buildLoginSheet(orgId, { exceptUserId = null } = {}) {
  const people = (await listEmployees(orgId)).filter((p) => p.login_code);
  const out = [];
  for (const person of people) {
    let password = null;
    if (person.first_sign_in_pending && Number(person.id) !== Number(exceptUserId)) {
      password = temporaryPassword();
      await db.execute('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ? AND org_id = ?', [await bcrypt.hash(password, 10), person.id, orgId]);
    }
    out.push({
      code: person.login_code, name: person.name, role: person.role, department: person.department || '',
      reports_to: person.reports_to_name || '', email: person.email, password, signed_in: !person.first_sign_in_pending,
    });
  }
  return out;
}

async function setShowAllTasks(orgId, on, updatedBy) {
  await db.execute(
    `MERGE org_task_settings WITH (HOLDLOCK) AS target
     USING (SELECT ? AS org_id) AS source ON target.org_id = source.org_id
     WHEN MATCHED THEN UPDATE SET show_all_tasks = ?, updated_by = ?, updated_at = SYSDATETIME()
     WHEN NOT MATCHED THEN INSERT (org_id, show_all_tasks, updated_by) VALUES (source.org_id, ?, ?);`,
    [orgId, on, updatedBy, on, updatedBy]
  );
  return syncAllTasksMembership(orgId);
}

module.exports = { listEmployees, importEmployees, resetEmployeePassword, buildLoginSheet, setShowAllTasks, orgAdminUserId };
