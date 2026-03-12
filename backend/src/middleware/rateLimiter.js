const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again after 15 minutes.', code: 'RATE_LIMIT', status: 429 }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Slow down.', code: 'RATE_LIMIT', status: 429 }
});

module.exports = { authLimiter, apiLimiter };
