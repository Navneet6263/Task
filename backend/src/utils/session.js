const jwt = require('jsonwebtoken');

// How long a sign-in lasts: a month with "Keep me signed in", otherwise one working day.
const LONG_SESSION_SECONDS = 30 * 24 * 60 * 60;
const SHORT_SESSION_SECONDS = 12 * 60 * 60;

const signSession = (payload, remember = true) => jwt.sign(payload, process.env.JWT_SECRET, {
  expiresIn: remember === false ? SHORT_SESSION_SECONDS : LONG_SESSION_SECONDS,
});

// Sign-ins from before sessions expired carry no exp; they end a month after they were issued.
const isExpiredLegacy = (decoded) => !decoded.exp && (!decoded.iat || decoded.iat * 1000 + LONG_SESSION_SECONDS * 1000 < Date.now());

module.exports = { signSession, isExpiredLegacy, LONG_SESSION_SECONDS, SHORT_SESSION_SECONDS };
