const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Who may use the platform console, how its sessions are signed, and the console audit log.
const SESSION_HOURS = 8;
const masterEmail = () => String(process.env.SUPER_ADMIN_EMAIL || 'superadmin@navtask.com').trim().toLowerCase();
const isMasterEmail = (email) => String(email || '').trim().toLowerCase() === masterEmail();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
// Where sign-in codes for an account go. The master login can use a different, real inbox (SUPER_ADMIN_OTP_EMAIL).
const codeRecipient = (email) => (isMasterEmail(email) ? normalizeEmail(process.env.SUPER_ADMIN_OTP_EMAIL) || masterEmail() : normalizeEmail(email));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// HMAC with the server secret, so a leaked database row cannot be turned back into a code or link.
const secret = () => process.env.OTP_SECRET || process.env.JWT_SECRET;
const keyedHash = (value) => crypto.createHmac('sha256', secret()).update(String(value)).digest('hex');
const sameHash = (a, b) => {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};
const sameText = (a, b) => sameHash(keyedHash(`text:${a}`), keyedHash(`text:${b}`));

// Tokens carry `mfa: true` only after password + email code, so tokens from the old
// email-only sign-in stop working.
const signConsoleToken = ({ email, name, isMaster }) => jwt.sign(
  { email, name, role: 'super_admin', is_master: Boolean(isMaster), mfa: true },
  process.env.JWT_SECRET,
  { expiresIn: `${SESSION_HOURS}h` },
);

async function saLog(email, name, action, targetType, targetId, description, ip) {
  try {
    await db.execute(
      'INSERT INTO super_admin_logs (actor_email, actor_name, action, target_type, target_id, description, ip_address) VALUES (?,?,?,?,?,?,?)',
      [email, name || email, action, targetType || null, targetId || null, description || null, ip || null],
    );
  } catch { /* logging must never block the request */ }
}

// Helpers (non-master) must still be active, so removing access signs them out on the next request.
const verifySA = async (req, res, next) => {
  let decoded;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch { return res.status(401).json({ error: 'Your session has ended. Sign in again.' }); }
  if (decoded.role !== 'super_admin') return res.status(403).json({ error: 'Super admin only' });
  if (!decoded.mfa) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  if (!isMasterEmail(decoded.email)) {
    try {
      const [rows] = await db.execute('SELECT id FROM super_admin_users WHERE email = ? AND is_active = TRUE', [decoded.email]);
      if (!rows.length) return res.status(401).json({ error: 'Your console access was removed' });
    } catch { return res.status(503).json({ error: 'Could not check your access. Try again.' }); }
  }
  req.saEmail = decoded.email;
  req.saName = decoded.name;
  next();
};

const requireMaster = (req, res, next) => (isMasterEmail(req.saEmail) ? next() : res.status(403).json({ error: 'Only the master admin can manage console access' }));

const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email).split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
};

// Console passwords: 10–128 characters with at least one letter and one number, not built from the email.
function passwordProblem(password, email) {
  const value = String(password || '');
  if (value.length < 10) return 'Use at least 10 characters.';
  if (value.length > 128) return 'Use 128 characters or fewer.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use both letters and numbers.';
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && value.toLowerCase().includes(local)) return 'Do not use your email name in the password.';
  return null;
}

module.exports = {
  SESSION_HOURS, EMAIL_RE, masterEmail, isMasterEmail, normalizeEmail, codeRecipient, keyedHash, sameHash, sameText,
  signConsoleToken, saLog, verifySA, requireMaster, maskEmail, passwordProblem,
};
