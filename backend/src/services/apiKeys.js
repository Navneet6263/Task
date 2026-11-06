const crypto = require('crypto');
const net = require('net');
const db = require('../config/database');
const { isModuleEnabled } = require('./orgModules');

// Company API keys for the public API (/api/v1). A key is shown once; only its SHA-256 is stored,
// looked up by a short public prefix and compared in constant time.

const SCOPES = {
  'tasks:read': 'Read tasks',
  'tasks:write': 'Create and update tasks, and add comments',
  'users:read': 'Read people and teams',
};
const SCOPE_KEYS = Object.keys(SCOPES);
const RATE_PER_MINUTE = 60;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// gt_live_<12 hex public id>_<43 char secret> (gt_test_ for test keys); the part before the last
// underscore is the public prefix.
function generateKey(mode = 'live') {
  const id = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  const prefix = `gt_${mode === 'test' ? 'test' : 'live'}_${id}`;
  return { key: `${prefix}_${secret}`, prefix, hash: sha256(`${prefix}_${secret}`) };
}
const prefixOf = (key) => {
  const m = String(key || '').match(/^(gt_(?:live|test)_[a-f0-9]{12})_[A-Za-z0-9_-]{43}$/);
  return m ? m[1] : null;
};

// Allowed callers: exact IPv4/IPv6 addresses or IPv4 ranges like 203.0.113.0/24.
function parseAllowedIps(text) {
  const list = String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (list.length > 20) throw fail(422, 'invalid_ips', 'Allow at most 20 addresses');
  list.forEach((entry) => {
    const [ip, bits] = entry.split('/');
    const ok = bits === undefined ? net.isIP(ip) !== 0 : net.isIPv4(ip) && /^\d+$/.test(bits) && Number(bits) >= 8 && Number(bits) <= 32;
    if (!ok) throw fail(422, 'invalid_ips', `"${entry}" is not an IP address or IPv4 range`);
  });
  return list;
}
const ipv4ToInt = (ip) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
function ipAllowed(ip, allowed) {
  if (!allowed.length) return true;
  const clean = String(ip || '').replace(/^::ffff:/, '');
  return allowed.some((entry) => {
    const [base, bits] = entry.split('/');
    if (bits === undefined) return base === clean;
    if (!net.isIPv4(clean)) return false;
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (ipv4ToInt(clean) & mask) === (ipv4ToInt(base) & mask);
  });
}

// Per-key calls left in the current minute. Counted in the database so every backend process shares
// one limit; if that count cannot be read, a per-process count keeps the limit in force.
const windows = new Map();
function takeLocalToken(keyId, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  const w = windows.get(keyId);
  if (!w || w.minute !== minute) { windows.set(keyId, { minute, count: 1 }); return RATE_PER_MINUTE - 1; }
  w.count += 1;
  return RATE_PER_MINUTE - w.count;
}
async function takeToken(keyId, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  try {
    const [result] = await db.execute(
      `MERGE api_rate_windows WITH (HOLDLOCK) AS w
       USING (SELECT ? AS key_id, ? AS minute) AS s ON w.key_id = s.key_id AND w.minute = s.minute
       WHEN MATCHED THEN UPDATE SET count = w.count + 1
       WHEN NOT MATCHED THEN INSERT (key_id, minute, count) VALUES (s.key_id, s.minute, 1)
       OUTPUT inserted.count AS used;`,
      [keyId, minute]
    );
    const used = Number(result?.rows?.[0]?.used);
    if (!Number.isFinite(used)) throw new Error('no count');
    return RATE_PER_MINUTE - used;
  } catch {
    return takeLocalToken(keyId, now);
  }
}

// Express middleware for /api/v1: who is calling, for which company, with which rights.
async function apiKeyAuth(req, res, next) {
  const started = Date.now();
  try {
    const header = req.headers.authorization || '';
    const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-api-key'] || '').trim();
    const prefix = prefixOf(raw);
    if (!prefix) throw fail(401, 'invalid_key', 'Send your API key as "Authorization: Bearer <key>"');
    const [[key]] = await db.execute(
      `SELECT k.*, u.is_deleted AS user_deleted, u.role AS user_role FROM api_keys k JOIN users u ON u.id = k.created_by WHERE k.key_prefix = ?`, [prefix]
    );
    const given = Buffer.from(sha256(raw), 'hex');
    const stored = Buffer.from(key?.key_hash || '0'.repeat(64), 'hex');
    if (!key || !crypto.timingSafeEqual(given, stored)) throw fail(401, 'invalid_key', 'This API key is not valid');
    if (key.revoked_at) throw fail(401, 'revoked_key', 'This API key was revoked');
    if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) throw fail(401, 'expired_key', 'This API key has expired');
    if (key.user_deleted) throw fail(401, 'owner_removed', 'The person who created this key no longer has an account');
    // A key acts as the admin who made it, so it stops when that person stops being an admin.
    if (key.user_role !== 'admin') throw fail(401, 'owner_not_admin', 'The person who created this key is no longer an admin');
    if (!await isModuleEnabled(key.org_id, 'developer_api')) throw fail(403, 'api_disabled', 'The developer API is turned off for this company');
    if (!ipAllowed(req.ip, parseAllowedIps(key.allowed_ips))) throw fail(403, 'ip_not_allowed', `Calls from ${req.ip} are not allowed for this key`);
    const left = await takeToken(key.id);
    res.set('X-RateLimit-Limit', String(RATE_PER_MINUTE));
    res.set('X-RateLimit-Remaining', String(Math.max(0, left)));
    if (left < 0) throw fail(429, 'rate_limited', `Too many requests. The limit is ${RATE_PER_MINUTE} a minute.`);

    req.apiKey = { id: key.id, name: key.name, mode: key.mode === 'test' ? 'test' : 'live', scopes: String(key.scopes).split(',').filter(Boolean) };
    res.set('X-GreenTask-Mode', req.apiKey.mode);
    req.orgId = Number(key.org_id);
    req.userId = Number(key.created_by);
    req.userRole = 'api';
    res.on('finish', () => {
      db.execute('INSERT INTO api_request_logs (key_id, org_id, method, path, status, ip, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [key.id, key.org_id, req.method, String(req.originalUrl).split('?')[0].slice(0, 300), res.statusCode, String(req.ip || '').slice(0, 64), Date.now() - started])
        .then(() => db.execute('UPDATE api_keys SET last_used_at = SYSDATETIME(), last_used_ip = ? WHERE id = ?', [String(req.ip || '').slice(0, 64), key.id]))
        .catch(() => {});
    });
    next();
  } catch (error) {
    res.status(error.status || 500).json({ error: { code: error.code || 'server_error', message: error.status ? error.message : 'Something went wrong' } });
  }
}

const requireScope = (scope) => (req, res, next) => (req.apiKey?.scopes.includes(scope)
  ? next()
  : res.status(403).json({ error: { code: 'missing_scope', message: `This key needs the "${scope}" permission` } }));

async function createKey(orgId, userId, body) {
  const name = String(body?.name || '').trim().slice(0, 100);
  if (!name) throw fail(422, 'invalid_name', 'Give the key a name, like "CRM connection"');
  const scopes = [...new Set((Array.isArray(body?.scopes) ? body.scopes : []).filter((s) => SCOPE_KEYS.includes(s)))];
  if (!scopes.length) throw fail(422, 'invalid_scopes', 'Choose at least one permission');
  const days = Number(body?.expires_in_days || 0);
  if (days && (!Number.isInteger(days) || days < 1 || days > 730)) throw fail(422, 'invalid_expiry', 'Expiry must be 1 to 730 days');
  const allowed = parseAllowedIps(body?.allowed_ips);
  const [[{ active }]] = await db.execute('SELECT COUNT(*) AS active FROM api_keys WHERE org_id = ? AND revoked_at IS NULL', [orgId]);
  if (Number(active) >= 20) throw fail(409, 'too_many_keys', 'A company can have 20 active keys. Revoke one first.');
  const mode = body?.mode === 'test' ? 'test' : 'live';
  const { key, prefix, hash } = generateKey(mode);
  const [created] = await db.execute(
    `INSERT INTO api_keys (org_id, name, key_prefix, key_hash, scopes, allowed_ips, created_by, mode, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${days ? 'DATEADD(DAY, ?, SYSDATETIME())' : 'NULL'})`,
    [orgId, name, prefix, hash, scopes.join(','), allowed.length ? allowed.join(', ') : null, userId, mode, ...(days ? [days] : [])]
  );
  return { id: created.insertId, key, prefix, name, scopes, mode };
}

// A fresh key with the same settings. The old one keeps working for 24 hours (or until its own
// expiry, if sooner), so the other software can switch over without a single failed call.
async function rotateKey(orgId, userId, keyId) {
  const [[old]] = await db.execute('SELECT * FROM api_keys WHERE id = ? AND org_id = ? AND revoked_at IS NULL', [keyId, orgId]);
  if (!old) throw fail(404, 'not_found', 'Key not found or already revoked');
  if (old.replaced_by) throw fail(409, 'already_rotated', 'This key was already replaced. Rotate the new one instead.');
  const { key, prefix, hash } = generateKey(old.mode);
  const [created] = await db.execute(
    'INSERT INTO api_keys (org_id, name, key_prefix, key_hash, scopes, allowed_ips, created_by, mode, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [orgId, old.name, prefix, hash, old.scopes, old.allowed_ips, userId, old.mode, old.expires_at]
  );
  await db.execute(
    `UPDATE api_keys SET replaced_by = ?, expires_at = CASE WHEN expires_at IS NOT NULL AND expires_at < DATEADD(HOUR, 24, SYSDATETIME())
       THEN expires_at ELSE DATEADD(HOUR, 24, SYSDATETIME()) END WHERE id = ?`,
    [created.insertId, old.id]
  );
  return { id: created.insertId, key, prefix, name: old.name, scopes: String(old.scopes).split(','), mode: old.mode, old_works_until_hours: 24 };
}

module.exports = { SCOPES, SCOPE_KEYS, RATE_PER_MINUTE, generateKey, prefixOf, parseAllowedIps, ipAllowed, takeToken, takeLocalToken, apiKeyAuth, requireScope, createKey, rotateKey, sha256 };
