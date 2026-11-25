const jwt = require('jsonwebtoken');
const { isExpiredLegacy } = require('../utils/session');
const sessions = require('../services/sessions');

// The token only proves who signed in and which session it is. Whether that session is still open,
// whether the account still exists, its role and its organizations come from the database
// (services/sessions.js), so signing out, removing someone or changing their role works at once.
const ENDED = {
  SESSION_OLD: 'Please sign in again.',
  SESSION_ENDED: 'Your sign-in has ended. Please sign in again.',
  CO_ADMIN_REMOVED: 'Your company admin access was removed. Sign in again.',
};

// Picks the organization for this request: the one asked for (X-Org-Id) if this person still has it.
function pickOrg(access, requested, tokenPrimary) {
  const orgIds = access.orgIds || [];
  if (requested && orgIds.includes(requested)) return requested;
  if (tokenPrimary && orgIds.includes(tokenPrimary)) return tokenPrimary;
  if (access.primaryOrgId && orgIds.includes(access.primaryOrgId)) return access.primaryOrgId;
  return orgIds[0] || access.primaryOrgId || null;
}

async function authorize(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { ok: false };
  }
  if (isExpiredLegacy(decoded)) return { ok: false };
  const access = await sessions.check(decoded);
  return { ...access, decoded };
}

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let result;
  try {
    result = await authorize(token);
  } catch (error) {
    console.error('[auth] session check failed', error.message);
    return res.status(503).json({ error: 'Could not check your sign-in. Try again.' });
  }
  if (!result.ok) {
    // "Invalid token" (or the co-admin code) is what open tabs already listen for to show the sign-in page.
    const code = result.code || 'INVALID_TOKEN';
    if (code === 'CO_ADMIN_REMOVED') return res.status(401).json({ error: ENDED.CO_ADMIN_REMOVED, code });
    return res.status(401).json({ error: 'Invalid token', code, message: ENDED[code] || ENDED.SESSION_ENDED });
  }
  const { decoded } = result;
  const requested = req.headers['x-org-id'] ? Number(req.headers['x-org-id']) : null;
  req.userId = decoded.id;
  req.userRole = result.role;
  req.orgId = pickOrg(result, requested, decoded.org_id ? Number(decoded.org_id) : null);
  req.orgIds = result.orgIds && result.orgIds.length ? result.orgIds : null;
  req.companyAdminId = decoded.company_admin_id || null;
  req.sessionId = decoded.sid || null;
  next();
};

const adminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

module.exports = { authenticate, adminOnly, authorize, pickOrg };
