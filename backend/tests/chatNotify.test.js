const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');

test('a team chat message reaches every team member as a notice, not only people with that chat open', async (t) => {
  process.env.JWT_SECRET = 'chat-notify-test-only';
  const sent = [];
  const fakeWs = { broadcast: () => {}, sendToUser: (id, event, data) => sent.push({ id, event, data }) };
  t.mock.method(db, 'execute', async (sql, params) => {
    if (sql.startsWith('SELECT DISTINCT tm.user_id')) {
      assert.match(sql, /auto_added/, 'real members only');
      assert.match(sql, /user_org_access/, 'who still work in that workspace');
      return [[{ user_id: 10 }, { user_id: 11 }, { user_id: 12 }]];
    }
    if (sql.startsWith('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?')) return [[{ id: 1 }]];
    if (sql.includes('FROM team_members tm') && sql.includes('JOIN teams t ON t.id = tm.team_id')) return [[{ id: 1 }]];
    if (sql.includes('FROM team_discussion_threads t') && sql.includes('WHERE t.id = ?')) return [[{ id: 5, team_id: 2, is_default: 1, thread_type: 'group' }]];
    if (sql.trim().startsWith('INSERT INTO team_messages')) return [{ insertId: 900 }];
    if (sql.includes('FROM team_messages m') && sql.includes('WHERE m.id = ?')) return [[{ id: 900, team_id: 2, thread_id: 5, message: 'Client call moved to   4 pm', user_id: 10, user_name: 'Asha' }]];
    if (sql.startsWith('SELECT t.name, t.org_id')) return [[{ name: 'Sales', org_id: 4, workspace: 'GreenCall' }]];
    if (sql.startsWith('SELECT DISTINCT tm.user_id')) return [[{ user_id: 10 }, { user_id: 11 }, { user_id: 12 }]];
    return [[]];
  });
  const app = express(); app.use(express.json()); app.set('ws', fakeWs); app.use(require('../src/routes/chat'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign({ id: 10, role: 'person', org_id: 4 }, process.env.JWT_SECRET);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/2`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ thread_id: 5, message: 'Client call moved to   4 pm' }),
  });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const notices = sent.filter((s) => s.event === 'chat_notify');
  assert.deepEqual(notices.map((n) => n.id), [11, 12], 'everyone but the sender');
  assert.deepEqual(notices[0].data, {
    team_id: 2, thread_id: 5, message_id: 900, direct: false, team_name: 'Sales', workspace: 'GreenCall', org_id: 4, from: 'Asha', preview: 'Client call moved to 4 pm',
  });
});
