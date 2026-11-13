const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const accounts = require('../src/services/companyAccounts');

const LIMITS = { max_companies: 3, max_managers_per_company: 10, max_staff_per_company: 50 };

test('temporary passwords for company admins are long and readable', () => {
  const password = accounts.strongTemporaryPassword();
  assert.match(password, /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
  assert.notEqual(password, accounts.strongTemporaryPassword());
});

test('a new company refuses an email that already has an account, so nobody loses theirs', async (t) => {
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT id FROM company_admins')) return [[]];
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 5 }]];
    throw Error(`Unexpected query: ${sql.slice(0, 50)}`);
  });
  await assert.rejects(accounts.createCompanyAdmin({ name: 'Asha', email: 'asha@example.com', company_name: 'Acme' }, LIMITS), /already has an account/);
  await assert.rejects(accounts.createCompanyAdmin({ name: 'Asha', email: 'bad', company_name: 'Acme' }, LIMITS), /valid email/);
});

test('a hand-over moves every organization in one transaction and closes the old login', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM company_admins')) return [[{ id: 4, email: 'old@example.com', status: 'approved', max_companies: 3, max_managers_per_company: 10, max_staff_per_company: 50 }]];
    if (sql.startsWith('SELECT id FROM company_admins')) return [[]];
    if (sql.startsWith('SELECT id FROM organizations WHERE company_admin_id')) return [[{ id: 4 }]];
    if (sql.startsWith('SELECT id, org_id, is_deleted FROM users')) return [[]];
    if (sql.startsWith('SET XACT_ABORT ON')) return [{ insertId: 30 }];
    if (sql.startsWith('SELECT id, name, email, password, mobile FROM company_admins')) return [[{ id: 30, name: 'New', email: 'new@example.com', password: 'h' }]];
    if (sql.startsWith('SELECT id FROM organizations WHERE company_admin_id = ? ORDER BY')) return [[{ id: 4 }]];
    if (sql.startsWith('SELECT id, is_deleted, employee_id FROM users')) return [[]];
    if (sql.startsWith('SELECT id FROM users WHERE employee_id') || sql.includes('employee_id = ?')) return [[]];
    if (sql.startsWith('INSERT INTO users')) return [{ insertId: 99 }];
    return [{ affectedRows: 1 }];
  });
  const result = await accounts.handOverCompany(4, { name: 'New', email: 'NEW@example.com' });
  assert.equal(result.id, 30);
  assert.equal(result.email, 'new@example.com');
  const move = calls.find((c) => c.sql.startsWith('SET XACT_ABORT ON'));
  assert.match(move.sql, /UPDATE organizations SET company_admin_id = @new_id WHERE company_admin_id = \?/);
  assert.match(move.sql, /DELETE FROM company_admins WHERE id = \?/);
  // Co-admins move with the company.
  assert.match(move.sql, /UPDATE company_co_admins SET company_admin_id = @new_id WHERE company_admin_id = \?/);
  assert.ok(await bcrypt.compare(result.password, move.params[2]), 'only the hash is stored');
  const closed = calls.find((c) => c.sql.startsWith('UPDATE users SET is_deleted = TRUE'));
  assert.deepEqual(closed.params, ['old@example.com', 99]);
});

test('a company that still has organizations cannot be deleted, only handed over', async (t) => {
  const deleted = [];
  let orgs = 2;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, name, email, status FROM company_admins')) return [[{ id: 4, name: 'A', email: 'a@x.com', status: 'pending' }]];
    if (sql.startsWith('SELECT COUNT(*) AS orgs')) return [[{ orgs }]];
    if (sql.startsWith('DELETE')) { deleted.push([sql.split(' ')[2], ...params]); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 50)}`);
  });
  await assert.rejects(accounts.removeCompanyAdmin(4), /Hand it over/);
  assert.equal(deleted.length, 0);
  orgs = 0;
  await accounts.removeCompanyAdmin(4);
  // Its co-admins go with it.
  assert.deepEqual(deleted, [['company_co_admins', 4], ['company_admins', 4]]);
});
