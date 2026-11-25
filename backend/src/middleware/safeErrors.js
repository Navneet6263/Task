const db = require('../config/database');

// Internal error text must never reach the browser: SQL Server messages name tables and columns,
// connection errors carry the database address, and JavaScript crashes show code paths.
// Many routes answer with `error.message`; this catches those answers in one place, logs the real
// text on the server and sends a plain message instead. Messages written for people pass through.
const INTERNAL = new RegExp([
  'Cannot read propert', 'Cannot set propert', 'is not a function', 'is not iterable', 'is not defined',
  'Maximum call stack', 'Unexpected token', 'Unexpected end of JSON',
  'Invalid column name', 'Invalid object name', 'Incorrect syntax', 'Violation of', 'conflicted with the',
  'Cannot insert', 'Conversion failed', 'String or binary data', 'Must declare the scalar', 'Ambiguous column',
  'multi-part identifier', 'Arithmetic overflow', 'Operand type clash', 'Error converting', 'deadlock',
  'Failed to connect', 'Login failed for user', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EREQUEST',
  'Timeout: Request failed', 'Connection is closed', 'getaddrinfo', 'Illegal arguments',
].map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

const GENERIC = 'Something went wrong. Please try again.';
const isInternal = (message) => INTERNAL.test(message) || (typeof db.isRecentError === 'function' && db.isRecentError(message));

function safeErrors(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    // A route may keep its text on purpose (res.locals.showErrorText), e.g. a mail-server test for the platform admin.
    if (res.statusCode >= 400 && !res.locals.showErrorText && body && typeof body.error === 'string' && isInternal(body.error)) {
      console.error(`[hidden error] ${req.method} ${req.originalUrl.split('?')[0]}: ${body.error}`);
      return json({ ...body, error: GENERIC });
    }
    return json(body);
  };
  next();
}

module.exports = { safeErrors, isInternal, GENERIC };
