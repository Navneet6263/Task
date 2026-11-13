const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

async function client(t) {
  process.env.JWT_SECRET = 'company-admin-orgs-test-only';
  const app = express(); app.use(express.json()); app.use(require('../src/routes/companyAdmin'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ id: 3, role: 'company_admin', company_admin_id: 22 }, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
// Organization 8 belongs to this company admin (22); organization 9 does not.
const owns = (sql, params) => sql.startsWith('SELECT id FROM organizations WHERE id = ? AND company_admin_id = ?') && [[Number(params[0]) === 8 && params[1] === 22 ? { id: 8 } : undefined].filter(Boolean)];

test('a company admin renames an organization and sets its task code; other organizations are refused', async (t) => {
  const updates = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    const own = owns(sql, params); if (own) return own;
    if (sql.startsWith('UPDATE organizations')) { updates.push({ sql, params }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT id, name, company_code, task_prefix FROM organizations')) return [[{ id: 8, name: 'Accountrust UK', company_code: 'ORG-ACC-1', task_prefix: 'ACT' }]];
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const ok = await send('/organizations/8', 'PATCH', { name: '  Accountrust   UK ', task_prefix: 'act', company_code: 'HACK', company_admin_id: 1 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).task_prefix, 'ACT');
  // Only the name and the task code change, and only in an organization this company admin owns.
  assert.match(updates[0].sql, /^UPDATE organizations SET name = \?, task_prefix = \? WHERE id = \? AND company_admin_id = \?$/);
  assert.deepEqual(updates[0].params, ['Accountrust UK', 'ACT', 8, 22]);
  assert.equal((await send('/organizations/9', 'PATCH', { name: 'Taken over' })).status, 404);
  assert.equal((await send('/organizations/8', 'PATCH', { task_prefix: '1AB' })).status, 422);
  assert.equal((await send('/organizations/8', 'PATCH', { task_prefix: 'TOOLONGX' })).status, 422);
  assert.equal((await send('/organizations/8', 'PATCH', { name: ' ' })).status, 422);
  assert.equal((await send('/organizations/8', 'PATCH', {})).status, 422);
  // An empty task code goes back to the default.
  await send('/organizations/8', 'PATCH', { task_prefix: '' });
  assert.deepEqual(updates[1].params, [null, 8, 22]);
  assert.equal(updates.length, 2);
});

test('a new admin gets a temporary password made for them, shown once, and must choose their own at first sign-in', async (t) => {
  let insert;
  t.mock.method(db, 'execute', async (sql, params) => {
    const own = owns(sql, params); if (own) return own;
    if (sql.startsWith('SELECT max_managers_per_company')) return [[{ max_managers_per_company: 10 }]];
    if (sql.includes('COUNT(*) as count')) return [[{ count: 2 }]];
    if (sql.startsWith('SELECT id FROM users WHERE email = ?')) return [params[0] === 'taken@x.com' ? [{ id: 4 }] : []];
    if (sql.startsWith('INSERT INTO users')) { insert = { sql, params }; return [{ insertId: 77 }]; }
    if (sql.includes('employee_id')) return [[]];
    return [[]];
  });
  const send = await client(t);
  const response = await send('/admins', 'POST', { name: ' Asha  Rao ', email: 'Asha@Example.com ', org_id: 8 });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.temporary_password, /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
  assert.equal(body.email, 'asha@example.com');
  assert.match(insert.sql, /must_change_password\)\s+VALUES \(\?, \?, \?, \?, \?, \?, \?, 1\)/);
  assert.equal(insert.params[0], 'Asha Rao');
  assert.ok(await bcrypt.compare(body.temporary_password, insert.params[2]), 'only the hash is stored');
  assert.equal(insert.params[5], 'admin');
  assert.equal((await send('/admins', 'POST', { name: 'X', email: 'taken@x.com', org_id: 8 })).status, 409);
  assert.equal((await send('/admins', 'POST', { name: 'X', email: 'not-an-email', org_id: 8 })).status, 422);
  assert.equal((await send('/admins', 'POST', { name: 'X', email: 'x@y.com', org_id: 9 })).status, 403);
});

test('reset password: made for them or typed, shown once, never for the owner, a co-admin, yourself or someone outside', async (t) => {
  const updates = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.includes('FROM users u JOIN organizations o')) {
      const people = { 12: { id: 12, email: 'asha@x.com', org_id: 8 }, 30: { id: 30, email: 'owner@x.com', org_id: 8 }, 31: { id: 31, email: 'vikas@x.com', org_id: 8 }, 3: { id: 3, email: 'me@x.com', org_id: 8 } };
      return [[params[1] === 22 && people[params[0]] ? people[params[0]] : undefined].filter(Boolean)];
    }
    if (sql.startsWith('SELECT ca.email FROM organizations o JOIN company_admins ca')) return [[{ email: 'OWNER@x.com' }]];
    if (sql.startsWith('SELECT id FROM company_co_admins WHERE user_id = ?')) return [[params[0] === 31 ? { id: 1 } : undefined].filter(Boolean)];
    if (sql.startsWith('UPDATE users SET password')) { updates.push(params); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const made = await (await send('/users/12/reset-password', 'POST')).json();
  assert.equal(made.email, 'asha@x.com');
  assert.match(made.temporary_password, /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
  assert.ok(await bcrypt.compare(made.temporary_password, updates[0][0]));
  assert.deepEqual(updates[0].slice(1), [1, 12], 'they choose their own at next sign-in');
  // Typed by the admin, and kept as it is when "ask them to change it" is off.
  const typed = await (await send('/users/12/reset-password', 'POST', { password: 'Winter2026!', must_change: false })).json();
  assert.equal(typed.temporary_password, 'Winter2026!');
  assert.ok(await bcrypt.compare('Winter2026!', updates[1][0]));
  assert.equal(updates[1][1], 0);
  assert.equal((await send('/users/12/reset-password', 'POST', { password: 'short' })).status, 422);
  assert.equal((await send('/users/30/reset-password', 'POST')).status, 400);
  assert.equal((await send('/users/31/reset-password', 'POST')).status, 400);
  assert.equal((await send('/users/3/reset-password', 'POST')).status, 400);
  assert.equal((await send('/users/50/reset-password', 'POST')).status, 404);
  assert.equal(updates.length, 2);
});
