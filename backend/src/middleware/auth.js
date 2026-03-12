const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.orgId = decoded.org_id || 1;
    req.orgIds = decoded.org_ids || (decoded.org_id ? [decoded.org_id] : null);
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
