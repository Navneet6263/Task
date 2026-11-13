const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/database');
const avatars = require('../src/services/avatars');

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const asUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;

test('only real PNG, JPEG or WebP pictures under 300 KB are accepted; never SVG', () => {
  assert.equal(avatars.readImage(asUrl('image/png', png)).mime, 'image/png');
  assert.equal(avatars.readImage(asUrl('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).mime, 'image/jpeg');
  assert.throws(() => avatars.readImage(asUrl('image/svg+xml', Buffer.from('<svg onload=alert(1)>'))), /PNG, JPEG or WebP/);
  assert.throws(() => avatars.readImage(asUrl('image/png', Buffer.from('<html>not a picture'))), /not a real picture/);
  assert.throws(() => avatars.readImage(asUrl('image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(avatars.MAX_BYTES)]))), /300 KB/);
});

test('a saved photo gets a fresh random link, and the bytes are stored as binary', async (t) => {
  const calls = [];
  t.mock.method(db, 'execute', async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 1 }]; });
  const url = await avatars.saveAvatar(10, asUrl('image/png', png), 'https://task.example.com');
  assert.match(url, /^https:\/\/task\.example\.com\/api\/users\/avatar\/[a-f0-9]{32}$/);
  assert.ok(Buffer.isBuffer(calls[0].params[3]));
  assert.deepEqual(calls[1].params, [url, 10]);
});

test('a photo link with a bad token is a plain 404, without touching the database', async (t) => {
  let queried = false;
  t.mock.method(db, 'execute', async () => { queried = true; return [[]]; });
  const res = { status(code) { this.code = code; return this; }, end() { return this; } };
  await avatars.serveAvatar({ params: { token: '../../etc/passwd' } }, res);
  assert.equal(res.code, 404);
  assert.equal(queried, false);
});
