const db = require('../config/database');
const canPublish = role => ['admin', 'company_admin'].includes(role);
const memberClause = `(u.org_id = ? OR EXISTS
  (SELECT 1 FROM user_org_access oa WHERE oa.user_id = u.id AND oa.org_id = ?))`;
const fail = (status, message) => Object.assign(new Error(message), { status });
function textField(body, key, limit, required = true) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    throw fail(422, `${key.replaceAll('_', ' ')} must be ${required ? 'non-empty and ' : ''}at most ${limit} characters`);
  return value.trim();
}
function positive(value, label = 'ID') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw fail(422, `Invalid ${label}`);
  return number;
}
const pageNumber = req => req.query.page === undefined ? 1 : positive(req.query.page, 'page');
const route = handler => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to complete request. Please retry.' }); }
};
// Recheck current account/access; a stale JWT must not retain revoked publishing rights.
const requireActiveMember = route(async (req, res, next) => {
  if (!req.orgId) throw fail(403, 'Select an organization first');
  const [[user]] = await db.execute(`SELECT u.id, u.role FROM users u
    WHERE u.id = ? AND u.is_deleted = FALSE AND ${memberClause}`, [req.userId, req.orgId, req.orgId]);
  if (!user) throw fail(403, 'Organization access denied');
  req.canPublishUpdates = canPublish(req.userRole) && canPublish(user.role);
  next();
});
function requirePublisher(req, res, next) {
  if (!req.canPublishUpdates) return res.status(403).json({ error: 'Only admins can publish or edit updates' });
  next();
}
module.exports = { db, memberClause, fail, textField, positive, pageNumber, route, requireActiveMember, requirePublisher };
