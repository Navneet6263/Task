const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { ensureCompanyAdminBootstrap, generateCompanyCode } = require('../utils/companyAdminBootstrap');

// Company admin accounts as the platform team manages them: create one, hand a company over to a new
// person, remove an empty account, or give a fresh temporary password.
const fail = (status, message) => Object.assign(new Error(message), { status });
const cleanEmail = (value) => String(value || '').trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Long enough for an account that controls whole companies, still easy to read out on a call.
const strongTemporaryPassword = () => {
  const raw = crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).padEnd(10, '7');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

function readPerson(body) {
  const name = String(body?.name || '').trim();
  const email = cleanEmail(body?.email);
  const mobile = String(body?.mobile || '').trim() || null;
  if (!name || name.length > 255) throw fail(422, 'Enter the person\'s name');
  if (!EMAIL.test(email) || email.length > 255) throw fail(422, 'Enter a valid email address');
  if (mobile && mobile.length > 20) throw fail(422, 'Mobile number is too long');
  return { name, email, mobile };
}

async function emailTakenByCompanyAdmin(email) {
  const [[row]] = await db.execute('SELECT id FROM company_admins WHERE email = ?', [email]);
  return Boolean(row);
}

// A new company with its own admin, approved straight away, and its first organization.
async function createCompanyAdmin(body, limits) {
  const person = readPerson(body);
  const companyName = String(body?.company_name || '').trim();
  if (!companyName || companyName.length > 200) throw fail(422, 'Enter the company name');
  if (await emailTakenByCompanyAdmin(person.email)) throw fail(409, 'This email already runs a company');
  // Someone who already works somewhere in the app would lose that account, so they need another email.
  const [[user]] = await db.execute('SELECT id FROM users WHERE email = ?', [person.email]);
  if (user) throw fail(409, 'This email already has an account in GreenTask. Use another email.');

  const password = strongTemporaryPassword();
  const [created] = await db.execute(
    `INSERT INTO company_admins (name, email, password, mobile, company_description, status, approved_at, max_companies, max_managers_per_company, max_staff_per_company)
     VALUES (?, ?, ?, ?, ?, 'approved', NOW(), ?, ?, ?)`,
    [person.name, person.email, await bcrypt.hash(password, 10), person.mobile, `Company Name: ${companyName}`,
      limits.max_companies, limits.max_managers_per_company, limits.max_staff_per_company]
  );
  const slug = `${companyName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')}-${Date.now()}`;
  await db.execute('INSERT INTO organizations (name, slug, company_code, company_admin_id) VALUES (?, ?, ?, ?)',
    [companyName, slug, await generateCompanyCode(db, companyName), created.insertId]);
  await ensureCompanyAdminBootstrap(db, created.insertId);
  return { id: created.insertId, email: person.email, password };
}

// Hand every organization of one company admin to a new person. The old account is closed; the old
// person either stays as a normal admin in the company or loses access.
async function handOverCompany(oldId, body) {
  const person = readPerson(body);
  const [[old]] = await db.execute('SELECT * FROM company_admins WHERE id = ?', [oldId]);
  if (!old) throw fail(404, 'Company admin not found');
  if (old.status !== 'approved') throw fail(409, 'Only an approved company can be handed over');
  if (person.email === cleanEmail(old.email)) throw fail(422, 'The new admin needs a different email');
  if (await emailTakenByCompanyAdmin(person.email)) throw fail(409, 'This email already runs a company');
  const [orgs] = await db.execute('SELECT id FROM organizations WHERE company_admin_id = ?', [oldId]);
  const orgIds = orgs.map((org) => Number(org.id));
  // An existing account may take over only if it belongs to this company; it keeps its history.
  const [[existing]] = await db.execute('SELECT id, org_id, is_deleted FROM users WHERE email = ?', [person.email]);
  if (existing && (existing.is_deleted || !orgIds.includes(Number(existing.org_id)))) {
    throw fail(409, 'This email has an account in another company. Use another email.');
  }

  const password = strongTemporaryPassword();
  const [moved] = await db.execute(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     DECLARE @new_id INT;
     INSERT INTO company_admins (name, email, password, mobile, company_description, expected_companies, expected_managers, expected_staff,
       status, approved_at, max_companies, max_managers_per_company, max_staff_per_company)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', GETDATE(), ?, ?, ?);
     SET @new_id = SCOPE_IDENTITY();
     UPDATE organizations SET company_admin_id = @new_id WHERE company_admin_id = ?;
     DELETE FROM company_admins WHERE id = ?;
     COMMIT;
     SELECT @new_id AS insertId;`,
    [person.name, person.email, await bcrypt.hash(password, 10), person.mobile, old.company_description,
      old.expected_companies, old.expected_managers, old.expected_staff,
      old.max_companies, old.max_managers_per_company, old.max_staff_per_company, oldId, oldId]
  );
  const newId = Number(moved.insertId);
  const bootstrap = await ensureCompanyAdminBootstrap(db, newId);
  const keepOld = body?.keep_old_as_admin === true;
  if (!keepOld) {
    await db.execute('UPDATE users SET is_deleted = TRUE, deleted_at = NOW() WHERE email = ? AND id <> ? AND is_deleted = FALSE',
      [cleanEmail(old.email), bootstrap.linkedUserId]);
  }
  return { id: newId, email: person.email, password, existing_account: Boolean(existing), old_kept: keepOld };
}

// Only an account without organizations can go: a request never approved, or one emptied by a hand-over.
async function removeCompanyAdmin(id) {
  const [[ca]] = await db.execute('SELECT id, name, email, status FROM company_admins WHERE id = ?', [id]);
  if (!ca) throw fail(404, 'Company admin not found');
  const [[{ orgs }]] = await db.execute('SELECT COUNT(*) AS orgs FROM organizations WHERE company_admin_id = ?', [id]);
  if (Number(orgs) > 0) throw fail(409, 'This company still has organizations. Hand it over to a new admin instead.');
  await db.execute('DELETE FROM company_admins WHERE id = ?', [id]);
  return ca;
}

// A fresh temporary password for a company admin, also on their linked workspace account.
async function resetCompanyAdminPassword(id) {
  const [[ca]] = await db.execute('SELECT id, name, email, status FROM company_admins WHERE id = ?', [id]);
  if (!ca) throw fail(404, 'Company admin not found');
  if (ca.status !== 'approved') throw fail(409, 'Approve the company first');
  const password = strongTemporaryPassword();
  const hashed = await bcrypt.hash(password, 10);
  await db.execute('UPDATE company_admins SET password = ? WHERE id = ?', [hashed, id]);
  await db.execute('UPDATE users SET password = ? WHERE email = ? AND is_deleted = FALSE', [hashed, cleanEmail(ca.email)]);
  return { ...ca, password };
}

module.exports = { strongTemporaryPassword, createCompanyAdmin, handOverCompany, removeCompanyAdmin, resetCompanyAdminPassword };
