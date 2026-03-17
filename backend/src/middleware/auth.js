const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

module.exports = { authenticate, adminOnly };
