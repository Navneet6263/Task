// Loaded before every test file (see "test" in package.json). Route tests sign their own tokens and mock
// db.execute for the queries of the route they test, so here the session store is replaced by the token's
// own claims and a no-op store. The real functions stay on `sessions.real` for sessions.test.js.
const crypto = require('crypto');
const sessions = require('../src/services/sessions');
const { signSession } = require('../src/utils/session');

sessions.real = { ...sessions };

sessions.check = async (decoded) => {
  const fromToken = Array.isArray(decoded.org_ids) ? decoded.org_ids.map(Number).filter((id) => id > 0) : [];
  const primary = decoded.org_id ? Number(decoded.org_id) : null;
  const orgIds = [...new Set([...(primary ? [primary] : []), ...fromToken])];
  if (decoded.co_admin) {
    const ok = await require('../src/services/coAdmins').stillCoAdmin(decoded.id, decoded.company_admin_id);
    if (!ok) return { ok: false, code: 'CO_ADMIN_REMOVED' };
  }
  return { ok: true, role: decoded.role, orgIds, primaryOrgId: primary || orgIds[0] || null };
};
sessions.issueSession = async (req, payload, remember) => signSession({ ...payload, sid: crypto.randomBytes(16).toString('hex') }, remember !== false);
sessions.revokeSession = async () => {};
sessions.revokeUserSessions = async () => 0;
// Route tests look for the plain password update.
sessions.changeOwnPassword = async (req, hashed) => {
  await require('../src/config/database').execute('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [hashed, req.userId]);
};
sessions.forgetSessions = () => {};
