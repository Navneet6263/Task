const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const { resolveTaskClient } = require('../src/services/orgClients');

async function client(t, identity) {
  process.env.JWT_SECRET = 'clients-test-only';
  const app = express(); app.use(express.json()); app.use(require('../src/routes/clients'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('employees see only active names and cannot change the list', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 5, role: 'person' }]];
    if (sql.startsWith('INSERT INTO org_clients')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id, name, is_active FROM org_clients WHERE org_id = ? AND is_active = 1')) return [[{ id: 1, name: 'Riverside', is_active: 1 }]];
    if (sql.startsWith('SELECT pick_only')) return [[{ pick_only: 1 }]];
    writes.push(sql); return [{ affectedRows: 1 }];
  });
  const send = await client(t, { id: 5, role: 'person', org_id: 3 });
  const list = await (await send('/')).json();
  assert.deepEqual(list, { pick_only: true, can_manage: false, clients: [{ id: 1, name: 'Riverside', is_active: true }] });
  assert.equal((await send('/', 'POST', { name: 'New Co' })).status, 403);
  assert.equal((await send('/1', 'PATCH', { is_active: false })).status, 403);
  assert.equal((await send('/settings', 'PUT', { pick_only: false })).status, 403);
  assert.equal(writes.length, 0);
});

test('renaming a client also renames it on the organization tasks', async (t) => {
  const writes = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT u.id, u.role FROM users u')) return [[{ id: 5, role: 'manager' }]];
    if (sql.startsWith('SELECT id, name, is_active FROM org_clients WHERE id = ?')) return [[{ id: 4, name: 'Riversde', is_active: 1 }]];
    writes.push({ sql, params });
    return [{ affectedRows: sql.startsWith('UPDATE tasks') ? 6 : 1 }];
  });
  const send = await client(t, { id: 5, role: 'manager', org_id: 3 });
  assert.equal((await send('/', 'POST', { name: '   ' })).status, 422);
  const body = await (await send('/4', 'PATCH', { name: 'Riverside  Motors' })).json();
  assert.equal(body.renamed_tasks, 6);
  const taskUpdate = writes.find((w) => w.sql.startsWith('UPDATE tasks'));
  assert.deepEqual(taskUpdate.params, ['Riverside Motors', 3, 'Riversde'], 'spaces tidied and limited to this organization');
});

test('pick-only lists stop employees from typing a new client, but managers add it to the list', async (t) => {
  const inserts = [];
  let pick = 1;
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT id, name, is_active FROM org_clients WHERE org_id = ? AND name = ?')) {
      return [params[1].toLowerCase() === 'riverside motors' ? [{ id: 1, name: 'Riverside Motors', is_active: 1 }] : params[1] === 'Old Co' ? [{ id: 2, name: 'Old Co', is_active: 0 }] : []];
    }
    if (sql.startsWith('SELECT pick_only')) return [[{ pick_only: pick }]];
    if (sql.startsWith('INSERT INTO org_clients')) { inserts.push(params); return [{ affectedRows: 1 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 40)}`);
  });
  assert.equal(await resolveTaskClient(3, 'riverside motors', 'person', 5), 'Riverside Motors', 'stored with the list spelling');
  await assert.rejects(resolveTaskClient(3, 'Brand New', 'person', 5), /Your manager or admin adds client names/);
  await assert.rejects(resolveTaskClient(3, 'Old Co', 'person', 5), /no longer an active client/);
  assert.equal(await resolveTaskClient(3, 'Brand New', 'manager', 5), 'Brand New');
  assert.equal(inserts.length, 1);
  pick = 0;
  assert.equal(await resolveTaskClient(3, 'Another', 'person', 5), 'Another', 'open lists accept new names from anyone');
  assert.equal(await resolveTaskClient(3, '   ', 'person', 5), null);
});
