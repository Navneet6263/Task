const crypto = require('crypto');
const db = require('../config/database');
const { keyedHash, sameHash } = require('./superAdminAccess');

// One-time email codes for console sign-in. Only keyed hashes are stored; each sign-in attempt gets
// a random challenge id, so a code is useless without the browser that passed the password step.
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const RESEND_GAP_SECONDS = 60;

const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const codeHash = (challenge, code) => keyedHash(`otp:${challenge}:${code}`);

async function createChallenge(email, ip) {
  const challenge = crypto.randomBytes(32).toString('hex');
  const code = newCode();
  await db.execute('DELETE FROM super_admin_otps WHERE created_at < DATEADD(DAY, -1, SYSDATETIME())');
  await db.execute(
    `INSERT INTO super_admin_otps (email, challenge_hash, code_hash, expires_at, ip_address)
     VALUES (?, ?, ?, DATEADD(MINUTE, ${CODE_TTL_MINUTES}, SYSDATETIME()), ?)`,
    [email, keyedHash(`challenge:${challenge}`), codeHash(challenge, code), ip || null],
  );
  return { challenge, code };
}

async function findChallenge(challenge) {
  const [rows] = await db.execute(
    `SELECT id, email, code_hash, attempts, resends, consumed_at,
       CASE WHEN expires_at > SYSDATETIME() THEN 0 ELSE 1 END AS expired,
       DATEDIFF(SECOND, last_sent_at, SYSDATETIME()) AS since_sent
     FROM super_admin_otps WHERE challenge_hash = ?`,
    [keyedHash(`challenge:${challenge}`)],
  );
  return rows[0] || null;
}

const ENDED = { ok: false, status: 410, error: 'This code has expired. Sign in again.' };
const TOO_MANY = { ok: false, status: 429, error: 'Too many wrong codes. Sign in again.' };

// Checks a code. Wrong codes count toward the limit; a right code can be used only once.
async function checkCode(challenge, code) {
  const row = await findChallenge(challenge);
  if (!row || row.consumed_at || Number(row.expired)) return ENDED;
  if (Number(row.attempts) >= MAX_ATTEMPTS) return TOO_MANY;
  if (!/^\d{6}$/.test(String(code)) || !sameHash(row.code_hash, codeHash(challenge, code))) {
    await db.execute('UPDATE super_admin_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const left = MAX_ATTEMPTS - Number(row.attempts) - 1;
    return left > 0 ? { ok: false, status: 401, error: `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` } : TOO_MANY;
  }
  const [result] = await db.execute('UPDATE super_admin_otps SET consumed_at = SYSDATETIME() WHERE id = ? AND consumed_at IS NULL', [row.id]);
  if (Number(result?.affectedRows) !== 1) return ENDED;
  return { ok: true, email: row.email };
}

// Sends a fresh code for the same challenge, at most every 60 seconds and three times in total.
async function resendCode(challenge) {
  const row = await findChallenge(challenge);
  if (!row || row.consumed_at) return ENDED;
  if (Number(row.resends) >= MAX_RESENDS) return { ok: false, status: 429, error: 'You have asked for too many codes. Sign in again.' };
  const wait = RESEND_GAP_SECONDS - Number(row.since_sent || 0);
  if (wait > 0) return { ok: false, status: 429, error: `Wait ${wait} seconds before asking for a new code.`, retry_in: wait };
  const code = newCode();
  await db.execute(
    `UPDATE super_admin_otps SET code_hash = ?, attempts = 0, resends = resends + 1, last_sent_at = SYSDATETIME(),
       expires_at = DATEADD(MINUTE, ${CODE_TTL_MINUTES}, SYSDATETIME()) WHERE id = ?`,
    [codeHash(challenge, code), row.id],
  );
  return { ok: true, email: row.email, code };
}

module.exports = { CODE_TTL_MINUTES, RESEND_GAP_SECONDS, MAX_ATTEMPTS, createChallenge, checkCode, resendCode };
