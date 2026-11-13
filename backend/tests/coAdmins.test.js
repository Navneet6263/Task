const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');
const coAdmins = require('../src/services/coAdmins');

async function server(t, router) {
  process.env.JWT_SECRET = 'co-admin-test-only';
  const app = express(); app.use(express.json()); app.use(router);
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => srv.once('listening', resolve));
  t.after(() => new Promise((resolve) => { srv.closeAllConnections(); srv.close(resolve); }));
  return (path, method = 'GET', body, token) => fetch(`http://127.0.0.1:${srv.address().port}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('an admin of one of the company organizations can be made a company admin; others cannot', async (t) => {
  const inserts = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM users u JOIN organizations o ON o.id = u.org_id')) {
      const people = { 28: { id: 28, name: 'Vikas Saxena', email: 'vikas@x.com', role: 'admin' }, 40: { id: 40, name: 'Asha', email: 'asha@x.com', role: 'manager' }, 41: { id: 41, name: 'Navneet', email: 'owner@x.com', role: 'admin' } };
      return [[params[1] === 22 && people[params[0]] ? people[params[0]] : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT email FROM company_admins')) return [[{ email: 'OWNER@x.com' }]];
    if (sql.startsWith('SELECT company_admin_id FROM company_co_admins')) return [inserts.some((p) => p[1] === params[0]) ? [{ company_admin_id: 22 }] : []];
    if (sql.startsWith('INSERT INTO company_co_admins')) { inserts.push(params); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const user = await coAdmins.addCoAdmin(22, 28, 3);
  assert.equal(user.name, 'Vikas Saxena');
  assert.deepEqual(inserts, [[22, 28, 3]]);
  await assert.rejects(coAdmins.addCoAdmin(22, 28, 3), /already a company admin/);
  await assert.rejects(coAdmins.addCoAdmin(22, 40, 3), /not an admin yet/);
  await assert.rejects(coAdmins.addCoAdmin(22, 41, 3), /already runs this company/);
  await assert.rejects(coAdmins.addCoAdmin(99, 28, 3), /not found in your workspaces/);
});

test('a co-admin signs in with their own password and gets the company admin view of that company', async (t) => {
  const hashed = await bcrypt.hash('Vikas-own-1', 4);
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT * FROM company_admins WHERE email = ?')) return [[]];
    if (sql.startsWith('SELECT * FROM users WHERE email = ?')) return [[{ id: 28, name: 'Vikas Saxena', email: 'vikas@x.com', password: hashed, role: 'admin', org_id: 4, must_change_password: 0 }]];
    if (sql.includes('FROM company_co_admins c JOIN company_admins ca')) return [[{ id: 22, max_companies: 3, max_managers_per_company: 10, max_staff_per_company: 50 }]];
    if (sql.startsWith('SELECT id FROM organizations WHERE company_admin_id = ?')) { assert.deepEqual(params, [22]); return [[{ id: 4 }, { id: 9 }]]; }
    return [[]];
  });
  const send = await server(t, require('express').Router().use('/auth', require('../src/routes/auth')));
  const response = await send('/auth/login', 'POST', { email: 'Vikas@x.com', password: 'Vikas-own-1' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.role, 'company_admin');
  assert.equal(body.co_admin, true);
  assert.deepEqual(body.org_ids, [4, 9]);
  const claims = jwt.verify(body.token, process.env.JWT_SECRET);
  assert.deepEqual([claims.id, claims.role, claims.company_admin_id, claims.co_admin, claims.org_id], [28, 'company_admin', 22, true, 4]);
  // A wrong password is still refused.
  assert.equal((await send('/auth/login', 'POST', { email: 'vikas@x.com', password: 'nope' })).status, 401);
});

test('removing a co-admin ends their company admin view at once; the owner session is not checked', async (t) => {
  let isCo = true;
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.includes('FROM company_co_admins c JOIN company_admins ca')) return [isCo ? [{ id: 22 }] : []];
    if (sql.startsWith('DELETE FROM company_co_admins')) { isCo = false; return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const { authenticate } = require('../src/middleware/auth');
  const router = express.Router();
  router.get('/me', authenticate, (req, res) => res.json({ role: req.userRole, company: req.companyAdminId }));
  const send = await server(t, router);
  const co = jwt.sign({ id: 28, role: 'company_admin', company_admin_id: 22, co_admin: true }, process.env.JWT_SECRET);
  const owner = jwt.sign({ id: 3, role: 'company_admin', company_admin_id: 22 }, process.env.JWT_SECRET);
  assert.equal((await send('/me', 'GET', null, co)).status, 200);
  await coAdmins.removeCoAdmin(22, 28);
  const after = await send('/me', 'GET', null, co);
  assert.equal(after.status, 401);
  assert.equal((await after.json()).code, 'CO_ADMIN_REMOVED');
  assert.equal((await send('/me', 'GET', null, owner)).status, 200);
});

test('organization admins rename their own organization and reset passwords there, but not the owner or themselves', async (t) => {
  const updates = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('UPDATE organizations')) { updates.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT id, name, company_code, task_prefix FROM organizations')) return [[{ id: 4, name: 'Greencall', task_prefix: 'GC' }]];
    if (sql.startsWith('SELECT id, email, org_id FROM users')) {
      const people = { 12: { id: 12, email: 'asha@x.com', org_id: 4 }, 30: { id: 30, email: 'owner@x.com', org_id: 4 } };
      return [[Number(params[1]) === 4 && people[params[0]] ? people[params[0]] : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT ca.email FROM organizations o JOIN company_admins ca')) return [[{ email: 'owner@x.com' }]];
    if (sql.startsWith('SELECT id FROM company_co_admins')) return [[]];
    if (sql.startsWith('UPDATE users SET password')) { updates.push({ sql, params }); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await server(t, require('../src/routes/admin'));
  const admin = jwt.sign({ id: 28, role: 'admin', org_id: 4 }, process.env.JWT_SECRET);
  const member = jwt.sign({ id: 12, role: 'person', org_id: 4 }, process.env.JWT_SECRET);
  const renamed = await send('/organization', 'PATCH', { name: ' Greencall  India ', task_prefix: 'gc', id: 8 }, admin);
  assert.equal(renamed.status, 200);
  assert.deepEqual(updates[0].params, ['Greencall India', 'GC', 4], 'only their own organization, whatever the body says');
  assert.equal((await send('/organization', 'PATCH', { name: 'X' }, member)).status, 403);
  const reset = await send('/users/12/reset-password', 'POST', {}, admin);
  assert.equal(reset.status, 200);
  assert.ok(await bcrypt.compare((await reset.json()).temporary_password, updates[1].params[0]));
  assert.equal((await send('/users/30/reset-password', 'POST', {}, admin)).status, 400);
  assert.equal((await send('/users/28/reset-password', 'POST', {}, admin)).status, 400);
  assert.equal((await send('/users/12/reset-password', 'POST', {}, member)).status, 403);
});
