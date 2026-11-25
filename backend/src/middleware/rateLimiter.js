const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Sign-in: only wrong attempts count, so a whole office behind one IP can still sign in every morning,
// while password guessing from one IP stops after 20 misses. Each account also has its own limit
// (services/signInGuard.js), which holds even when the guesses come from many IPs.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many wrong sign-in attempts from this network. Try again after 15 minutes.', code: 'RATE_LIMIT', status: 429 }
});

// Sign-up, reset links and reset codes: every request counts, since each one can send an email.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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

// Platform console sign-in and password setup: a full sign-in takes 2–3 requests.
const consoleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again after 15 minutes.', code: 'RATE_LIMIT', status: 429 }
});

module.exports = { loginLimiter, accountLimiter, apiLimiter, consoleAuthLimiter };
