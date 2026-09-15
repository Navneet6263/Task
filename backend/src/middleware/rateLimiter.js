const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again after 15 minutes.', code: 'RATE_LIMIT', status: 429 }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      const user = jwt.verify(token, process.env.JWT_SECRET);
      return `user:${user.role}:${user.company_admin_id || ''}:${user.id}`;
    } catch { return req.ip; }
  },
  message: { error: 'Too many requests. Slow down.', code: 'RATE_LIMIT', status: 429 }
});

module.exports = { authLimiter, apiLimiter };
