const jwt = require('jsonwebtoken');
const { isExpiredLegacy } = require('../utils/session');

const authenticate = (req, res, next) => {
  let decoded;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (isExpiredLegacy(decoded)) return res.status(401).json({ error: 'Invalid token' });

    const tokenOrgIds = Array.isArray(decoded.org_ids) ? decoded.org_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0) : [];
    const primaryOrgId = decoded.org_id ? Number(decoded.org_id) : null;
    const mergedOrgIds = tokenOrgIds.length > 0 ? tokenOrgIds : (primaryOrgId ? [primaryOrgId] : []);

    const requestedOrg = req.headers['x-org-id'] ? Number(req.headers['x-org-id']) : null;
    const activeOrgId = requestedOrg && mergedOrgIds.includes(requestedOrg)
      ? requestedOrg
      : (primaryOrgId || mergedOrgIds[0] || null);

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.orgId = activeOrgId;
    req.orgIds = mergedOrgIds.length > 0 ? mergedOrgIds : null;
    req.companyAdminId = decoded.company_admin_id || null;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!decoded.co_admin) return next();
  // Required here, not at the top, so the plain token check stays free of the database.
  return require('../services/coAdmins').stillCoAdmin(decoded.id, decoded.company_admin_id)
    .then((ok) => (ok ? next() : res.status(401).json({ error: 'Your company admin access was removed. Sign in again.', code: 'CO_ADMIN_REMOVED' })))
    .catch(() => res.status(503).json({ error: 'Could not check your access. Try again.' }));
};

const adminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

module.exports = { authenticate, adminOnly };
