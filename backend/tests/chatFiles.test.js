const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../src/config/database');
const chatFiles = require('../src/services/chatFiles');

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]);
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);

test('only real documents and pictures up to 1 MB are accepted, checked by their first bytes', () => {
  assert.deepEqual(chatFiles.checkFile('Invoice March.pdf', pdf), { name: 'Invoice March.pdf', mime: 'application/pdf', size: pdf.length });
  assert.equal(chatFiles.checkFile('payroll.xlsx', zip).mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(chatFiles.checkFile('notes.txt', Buffer.from('hello')).mime, 'text/plain');
  // Over 1 MB: ask to compress.
  assert.throws(() => chatFiles.checkFile('big.pdf', Buffer.concat([pdf, Buffer.alloc(chatFiles.MAX_BYTES)])), /over 1 MB\. Please compress it first/);
  // Programs, web pages and renamed files are refused.
  assert.throws(() => chatFiles.checkFile('run.exe', Buffer.from('MZ....')), /cannot be sent/);
  assert.throws(() => chatFiles.checkFile('page.html', Buffer.from('<script>')), /cannot be sent/);
  assert.throws(() => chatFiles.checkFile('fake.pdf', Buffer.from('MZ not a pdf')), /does not match its type/);
  assert.throws(() => chatFiles.checkFile('blob.txt', Buffer.from([0x41, 0x00, 0x42])), /does not match its type/);
  // Odd characters in the name are made safe.
  assert.equal(chatFiles.checkFile('Report: Q4/2026?.pdf', pdf).name, 'Report Q4 2026 .pdf');
  // A name that would start with a dot (or a path) becomes a plain one.
  assert.equal(chatFiles.checkFile('../../etc/<x>.pdf', pdf).name, 'file.pdf');
});

async function client(t, identity = { id: 10, role: 'person', org_id: 1 }) {
  process.env.JWT_SECRET = 'chat-files-test-only';
  const app = express(); app.use(express.json({ limit: '1mb' })); app.use(require('../src/routes/chat'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const token = jwt.sign(identity, process.env.JWT_SECRET);
  return (path, { method = 'GET', body, headers = {} } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, ...headers }, ...(body !== undefined ? { body } : {}),
  });
}
// Person 10 is in team 2 only; thread 5 is a direct chat between 10 and 11.
const access = (sql, params) => {
  if (sql.startsWith('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?')) return [Number(params[0]) === 2 && Number(params[1]) === 10 ? [{ id: 1 }] : []];
  return null;
};

test('a file is uploaded as raw bytes by a team member, at most 1 MB', async (t) => {
  let saved;
  t.mock.method(db, 'execute', async (sql, params) => {
    const a = access(sql, params); if (a) return a;
    if (sql.startsWith('DELETE FROM chat_attachments')) return [{ affectedRows: 0 }];
    if (sql.startsWith('INSERT INTO chat_attachments')) { saved = params; return [{ insertId: 31 }]; }
    throw Error(`Unexpected query: ${sql.slice(0, 60)}`);
  });
  const send = await client(t);
  const up = (team, bytes, name) => send(`/${team}/files`, { method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) } });
  const ok = await up(2, pdf, 'Bank statement (Oct).pdf');
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), { id: 31, file_name: 'Bank statement (Oct).pdf', mime: 'application/pdf', size: pdf.length });
  assert.deepEqual(saved.slice(0, 5), [2, 10, 'Bank statement (Oct).pdf', 'application/pdf', pdf.length]);
  assert.ok(Buffer.isBuffer(saved[5]));
  const big = await up(2, Buffer.concat([pdf, Buffer.alloc(chatFiles.MAX_BYTES)]), 'big.pdf');
  assert.equal(big.status, 413);
  assert.match((await big.json()).error, /Please compress it first/);
  assert.equal((await up(3, pdf, 'x.pdf')).status, 403);
  assert.equal((await up(2, Buffer.from('MZ'), 'tool.exe')).status, 422);
});

test('a message carries the uploaded file only for the person who uploaded it; downloads follow who can see the chat', async (t) => {
  const claims = [];
  t.mock.method(db, 'execute', async (sql, params) => {
    const a = access(sql, params); if (a) return a;
    if (sql.includes('FROM team_discussion_threads t') && sql.includes('WHERE t.id = ?')) {
      const [threadId, , u1, u2] = params;
      const thread = { id: 5, team_id: 2, title: '', created_by: 10, is_default: 0, thread_type: 'direct', direct_user_one: 10, direct_user_two: 11, created_by_name: 'A' };
      return [Number(threadId) === 5 && [Number(u1), Number(u2)].some((u) => [10, 11].includes(u)) ? [thread] : []];
    }
    if (sql.startsWith('SELECT id FROM chat_attachments WHERE id = ?')) return [Number(params[0]) === 31 && Number(params[2]) === 10 ? [{ id: 31 }] : []];
    if (sql.trim().startsWith('INSERT INTO team_messages')) return [{ insertId: 900 }];
    if (sql.startsWith('UPDATE chat_attachments SET message_id')) { claims.push(params); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM team_messages m') && sql.includes('WHERE m.id = ?')) return [[{ id: 900, team_id: 2, thread_id: 5, message: '', user_id: 10, user_name: 'Navneet' }]];
    if (sql.startsWith('SELECT id, message_id, file_name, mime, size FROM chat_attachments')) return [[{ id: 31, message_id: 900, file_name: 'Bank statement.pdf', mime: 'application/pdf', size: 209 }]];
    if (sql.includes('FROM chat_attachments a JOIN team_messages m')) return [Number(params[0]) === 31 ? [{ id: 31, file_name: 'Bank statement.pdf', mime: 'application/pdf', size: pdf.length, data: pdf, thread_id: 5 }] : []];
    return [[]];
  });
  const send = await client(t);
  const post = (body) => send('/2', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  // Text is optional when a file is attached.
  const sent = await post({ thread_id: 5, attachment_id: 31 });
  assert.equal(sent.status, 200);
  assert.deepEqual((await sent.json()).attachment, { id: 31, file_name: 'Bank statement.pdf', mime: 'application/pdf', size: 209 });
  assert.deepEqual(claims[0], [900, 31, 2, 10]);
  assert.equal((await post({ thread_id: 5, attachment_id: 99 })).status, 422);
  assert.equal((await post({ thread_id: 5 })).status, 422);
  const file = await send('/2/files/31');
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(file.headers.get('content-disposition'), /^attachment; filename="Bank statement\.pdf"/);
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf);
});

test('someone who cannot see a direct chat cannot download its files', async (t) => {
  t.mock.method(db, 'execute', async (sql) => {
    if (sql.startsWith('SELECT id FROM teams WHERE id = ? AND org_id = ?')) return [[{ id: 2 }]];
    if (sql.includes('FROM chat_attachments a JOIN team_messages m')) return [[{ id: 31, file_name: 'x.pdf', mime: 'application/pdf', size: 3, data: pdf, thread_id: 5 }]];
    if (sql.includes('FROM team_discussion_threads t') && sql.includes('WHERE t.id = ?')) return [[]];
    return [[]];
  });
  const other = await client(t, { id: 12, role: 'admin', org_id: 1 });
  assert.equal((await other('/2/files/31')).status, 404);
});
