const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const db = require('../src/config/database');
const socketService = require('../src/websocket');

test('WebSocket rejects unauthorized joins, untrusted previews and revoked membership', async t => {
  class FakeServer extends EventEmitter { constructor() { super(); this.clients = new Set(); } }
  t.mock.method(WebSocket, 'Server', FakeServer);
  process.env.JWT_SECRET = 'workspace-websocket-test-secret';
  let memberAllowed = false;
  t.mock.method(db, 'execute', async sql => {
    if (sql.includes('SELECT t.org_id')) return [[{ org_id: 1, company_admin_id: 30, user_id: memberAllowed ? 10 : 99 }]];
    return memberAllowed ? [[{ id: 1 }]] : [[]];
  });
  const server = socketService.init({});
  const socket = new EventEmitter(); socket.readyState = WebSocket.OPEN; socket.sent = [];
  socket.send = message => socket.sent.push(JSON.parse(message));
  socket.close = () => socket.emit('close'); socket.terminate = socket.close; socket.ping = () => {};
  const token = jwt.sign({ id: 10, role: 'member', org_id: 1 }, process.env.JWT_SECRET);
  server.clients.add(socket); server.emit('connection', socket, { url: `/?token=${token}` });
  t.after(() => { socket.close(); server.emit('close'); });
  socket.emit('message', JSON.stringify({ type: 'join', teamId: 2 }));
  await new Promise(setImmediate);
  await socketService.broadcast(2, 'task_updated', { id: 8 });
  assert.equal(socket.sent.length, 0);
  memberAllowed = true;
  socket.emit('message', JSON.stringify({ type: 'join', teamId: 2 }));
  await new Promise(setImmediate);
  await socketService.broadcast(2, 'task_updated', { id: 8 });
  assert.equal(socket.sent.length, 1);
  socket.emit('message', JSON.stringify({ type: 'chat_preview', teamId: 2, threadId: 3, clientTempId: 'fake', userName: 'Impersonation', message: 'Untrusted' }));
  await new Promise(setImmediate);
  assert.equal(socket.sent.length, 1);
  memberAllowed = false;
  await socketService.broadcast(2, 'task_updated', { id: 9 });
  assert.equal(socket.sent.length, 1);
});
