const crypto = require('crypto');
const db = require('../config/database');
const { signSession, LONG_SESSION_SECONDS, SHORT_SESSION_SECONDS } = require('../utils/session');
const { getAccessibleOrgIds } = require('../utils/orgAccess');

// Every sign-in is a row here, so a session can be ended from the server: "Sign out" on one device,
// "Sign out all other devices", a password change, a removed account or a changed role all take
// effect at once instead of when the 30-day token runs out. The row also records when and from where
// (IP and browser) someone signed in.
//
// The token carries only a random session id (sid). Each request looks the session up (cached for
// CACHE_MS), checks the account still exists, and reads the role and organizations from the database,
// never from the token. `stamp` is a fingerprint of the password hash at sign-in: any password change,
// wherever it happens, ends every older session without each place having to remember to do it.

const CACHE_MS = 30 * 1000;
const SEEN_EVERY_MS = 5 * 60 * 1000;
const MAX_CACHE = 5000;
const cache = new Map();
const lastSeen = new Map();

async function ensureSessionSchema() {
  await db.query(`
    IF OBJECT_ID('dbo.auth_sessions', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.auth_sessions (
        id INT IDENTITY PRIMARY KEY,
        sid CHAR(32) NOT NULL CONSTRAINT uq_auth_sessions_sid UNIQUE,
        user_id INT NOT NULL,
        company_admin_id INT NULL,
        kind VARCHAR(20) NOT NULL,
        stamp CHAR(16) NOT NULL,
        remember BIT NOT NULL DEFAULT 1,
        ip NVARCHAR(64) NULL,
        user_agent NVARCHAR(300) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        last_seen_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        expires_at DATETIME2 NOT NULL,
        revoked_at DATETIME2 NULL,
        revoked_reason VARCHAR(30) NULL);
      CREATE INDEX ix_auth_sessions_user ON dbo.auth_sessions(user_id, revoked_at);
    END
  `);
}

const fingerprint = (...parts) => crypto.createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 16);
const kindOf = (payload) => (payload.role === 'company_admin' ? (payload.co_admin ? 'co_admin' : 'owner') : 'user');
const sameStamp = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The company owner signs in with company_admins.password; everyone else with users.password.
const stampOf = (kind, row) => (kind === 'owner' ? fingerprint(row.ca_email, row.ca_password) : fingerprint(row.user_password));

async function principal(kind, userId, companyAdminId) {
  const [[row]] = await db.execute(
    `SELECT u.id, u.role, u.org_id, u.is_deleted, u.password AS user_password,
       ca.email AS ca_email, ca.password AS ca_password, ca.status AS ca_status
     FROM users u LEFT JOIN company_admins ca ON ca.id = ?
     WHERE u.id = ?`,
    [companyAdminId || null, userId]);
  if (!row) return null;
  if (kind === 'owner' && !row.ca_password) return null;
  return row;
}

const clientIp = (req) => String(req?.ip || '').replace(/^::ffff:/, '').slice(0, 64) || null;
const clientAgent = (req) => String(req?.headers?.['user-agent'] || '').slice(0, 300) || null;

// Signs someone in: records the session and returns the token for it.
async function issueSession(req, payload, remember = true) {
  const kind = kindOf(payload);
  const row = await principal(kind, payload.id, payload.company_admin_id);
  if (!row) throw Object.assign(new Error('Account not found'), { status: 401 });
  const sid = crypto.randomBytes(16).toString('hex');
  const keep = remember !== false;
  await db.execute(
    `INSERT INTO auth_sessions (sid, user_id, company_admin_id, kind, stamp, remember, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATEADD(SECOND, ?, SYSDATETIME()))`,
    [sid, payload.id, payload.company_admin_id || null, kind, stampOf(kind, row), keep ? 1 : 0,
      clientIp(req), clientAgent(req), keep ? LONG_SESSION_SECONDS : SHORT_SESSION_SECONDS]);
  return signSession({ ...payload, sid }, keep);
}

async function companyOrgIds(companyAdminId) {
  const [rows] = await db.execute('SELECT id FROM organizations WHERE company_admin_id = ? ORDER BY id ASC', [companyAdminId]);
  return rows.map((r) => Number(r.id));
}

const ended = (code = 'SESSION_ENDED') => ({ ok: false, code });

// The live check behind every signed-in request. Returns { ok, role, orgIds, primaryOrgId } or { ok: false, code }.
async function checkSession(decoded) {
  if (!decoded || typeof decoded.sid !== 'string' || !/^[0-9a-f]{32}$/.test(decoded.sid)) return ended('SESSION_OLD');
  const hit = cache.get(decoded.sid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const [[s]] = await db.execute(
    `SELECT s.user_id, s.company_admin_id, s.kind, s.stamp,
       CASE WHEN s.revoked_at IS NULL AND s.expires_at > SYSDATETIME() THEN 1 ELSE 0 END AS live
     FROM auth_sessions s WHERE s.sid = ?`, [decoded.sid]);
  let result;
  if (!s || !Number(s.live) || Number(s.user_id) !== Number(decoded.id)
    || Number(s.company_admin_id || 0) !== Number(decoded.company_admin_id || 0)) {
    result = ended();
  } else {
    result = await liveAccess(s);
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(decoded.sid, { at: Date.now(), result });
  if (result.ok) touch(decoded.sid);
  return result;
}

async function liveAccess(s) {
  const row = await principal(s.kind, s.user_id, s.company_admin_id);
  if (!row || !sameStamp(stampOf(s.kind, row), s.stamp)) return ended();
  if (s.kind === 'owner') {
    if (row.ca_status !== 'approved') return ended();
    const orgIds = await companyOrgIds(s.company_admin_id);
    return { ok: true, role: 'company_admin', orgIds, primaryOrgId: orgIds[0] || null };
  }
  if (row.is_deleted === true || Number(row.is_deleted) === 1) return ended();
  if (s.kind === 'co_admin') {
    const company = await require('./coAdmins').companyOfCoAdmin(s.user_id);
    if (!company || Number(company.id) !== Number(s.company_admin_id)) return ended('CO_ADMIN_REMOVED');
    const orgIds = await companyOrgIds(s.company_admin_id);
    return { ok: true, role: 'company_admin', orgIds, primaryOrgId: orgIds.includes(Number(row.org_id)) ? Number(row.org_id) : orgIds[0] || null };
  }
  const orgIds = await getAccessibleOrgIds(db, s.user_id, row.org_id);
  return { ok: true, role: row.role, orgIds, primaryOrgId: row.org_id ? Number(row.org_id) : orgIds[0] || null };
}

// "Last active" on the device list, written at most every few minutes per session.
function touch(sid) {
  const at = lastSeen.get(sid) || 0;
  if (Date.now() - at < SEEN_EVERY_MS) return;
  if (lastSeen.size >= MAX_CACHE) lastSeen.delete(lastSeen.keys().next().value);
  lastSeen.set(sid, Date.now());
  db.execute('UPDATE auth_sessions SET last_seen_at = SYSDATETIME() WHERE sid = ?', [sid]).catch(() => {});
}

const forget = (sid) => { cache.delete(sid); };
const forgetAll = () => { cache.clear(); };

async function revokeSession(sid, reason) {
  await db.execute(`UPDATE auth_sessions SET revoked_at = SYSDATETIME(), revoked_reason = ? WHERE sid = ? AND revoked_at IS NULL`, [reason, sid]);
  forget(sid);
}

// Ends every session of this account except (optionally) the one making the request.
async function revokeUserSessions(userId, { exceptSid = null, reason = 'signed_out' } = {}) {
  const [result] = await db.execute(
    `UPDATE auth_sessions SET revoked_at = SYSDATETIME(), revoked_reason = ?
     WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR sid <> ?)`,
    [reason, userId, exceptSid, exceptSid]);
  forgetAll();
  return Number(result?.affectedRows || 0);
}

// Someone changes their own password: this device stays signed in, every other one is signed out.
// The new password, the company owner's copy and this session's new stamp are written in one transaction,
// so a request from this same browser in between can never see a stamp mismatch and sign itself out.
// The company owner signs in with company_admins.password, so that copy changes too (otherwise the
// next sign-in copied the old one back).
async function changeOwnPassword(req, hashed) {
  const [[s]] = req.sessionId
    ? await db.execute('SELECT kind, company_admin_id FROM auth_sessions WHERE sid = ? AND user_id = ?', [req.sessionId, req.userId])
    : [[null]];
  let stamp = fingerprint(hashed);
  if (s?.kind === 'owner') {
    const [[ca]] = await db.execute('SELECT email FROM company_admins WHERE id = ?', [s.company_admin_id]);
    stamp = fingerprint(ca?.email, hashed);
  }
  await db.execute(`SET XACT_ABORT ON;
    BEGIN TRAN;
    UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?;
    UPDATE company_admins SET password = ? WHERE email = (SELECT email FROM users WHERE id = ?);
    UPDATE auth_sessions SET stamp = ? WHERE sid = ?;
    COMMIT TRAN;`, [hashed, req.userId, hashed, req.userId, stamp, req.sessionId || '']);
  await revokeUserSessions(req.userId, { exceptSid: req.sessionId, reason: 'password_changed' });
}

async function listSessions(userId) {
  const [rows] = await db.execute(
    `SELECT id, sid, kind, ip, user_agent, remember, created_at, last_seen_at, expires_at
     FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > SYSDATETIME()
     ORDER BY last_seen_at DESC`, [userId]);
  return rows;
}

// Old ended rows are kept 90 days as a sign-in record, then removed.
async function purgeOldSessions() {
  await db.execute(`DELETE FROM auth_sessions WHERE expires_at < DATEADD(DAY, -90, SYSDATETIME())
    OR (revoked_at IS NOT NULL AND revoked_at < DATEADD(DAY, -90, SYSDATETIME()))`);
}

module.exports = {
  ensureSessionSchema, issueSession, checkSession, check: checkSession, revokeSession, revokeUserSessions,
  changeOwnPassword, listSessions, purgeOldSessions, forgetSessions: forgetAll, fingerprint,
};
