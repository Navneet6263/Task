import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '../../services/feedback';
import { errorOf, saApi, saUser } from './consoleUtils';

const EMPTY = { admins: [], pending_count: 0, total_orgs: 0, total_users: 0 };

// All console data and actions. Every change shows a message and reloads what it touched.
export default function useConsole({ onSignedOut }) {
  const me = saUser();
  const isMaster = Boolean(me.is_master);
  const [data, setData] = useState(EMPTY);
  const [logs, setLogs] = useState([]);
  const [subUsers, setSubUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoaded, setLastLoaded] = useState(null);
  const signedOut = useRef(onSignedOut);
  signedOut.current = onSignedOut;

  const guard = useCallback((error) => {
    if (error?.response?.status === 401) { signedOut.current(); return true; }
    return false;
  }, []);

  const loadDashboard = useCallback(async () => {
    const r = await saApi.get('/dashboard');
    const payload = r.data || {};
    setData({ admins: Array.isArray(payload.admins) ? payload.admins : [], pending_count: Number(payload.pending_count || 0), total_orgs: Number(payload.total_orgs || 0), total_users: Number(payload.total_users || 0) });
  }, []);
  const loadLogs = useCallback(async () => {
    const r = await saApi.get('/logs', { params: { limit: 300 } });
    setLogs(Array.isArray(r.data) ? r.data : []);
  }, []);
  const loadSubUsers = useCallback(async () => {
    if (!isMaster) return;
    const r = await saApi.get('/sub-users');
    setSubUsers(Array.isArray(r.data) ? r.data : []);
  }, [isMaster]);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const results = await Promise.allSettled([loadDashboard(), loadLogs(), loadSubUsers()]);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed && !guard(failed.reason)) notify(errorOf(failed.reason, 'Some console data could not be loaded. Try refreshing.'));
    setLoading(false); setRefreshing(false); setLastLoaded(new Date());
  }, [guard, loadDashboard, loadLogs, loadSubUsers]);

  useEffect(() => { reload(true); }, [reload]);

  const loadDetail = useCallback(async (id) => {
    try { return (await saApi.get(`/company-admins/${id}`)).data; }
    catch (error) { if (!guard(error)) notify(errorOf(error, 'Could not open this company.')); return null; }
  }, [guard]);

  const run = useCallback(async (request, success, fallback, after = () => reload(true)) => {
    try {
      const response = await request();
      notify(typeof success === 'function' ? success(response?.data || {}) : success, 'success');
      await after();
      return response?.data || true;
    }
    catch (error) { if (!guard(error)) notify(errorOf(error, fallback)); return false; }
  }, [guard, reload]);

  const actions = {
    approve: (admin, limits) => run(() => saApi.patch(`/company-admins/${admin.id}/approve`, limits), `${admin.name} is approved and can sign in now.`, 'Could not approve this company.'),
    reject: (admin, reason) => run(() => saApi.patch(`/company-admins/${admin.id}/reject`, { reason }), `${admin.name} was rejected.`, 'Could not reject this company.'),
    saveLimits: (admin, limits) => run(() => saApi.patch(`/company-admins/${admin.id}/limits`, limits), 'Limits saved.', 'Could not save the limits.'),
    toggleModule: (org, key, enabled) => run(() => saApi.patch(`/organizations/${org.id}/modules/${key}`, { enabled }),
      `${key[0].toUpperCase()}${key.slice(1)} is now ${enabled ? 'on' : 'off'} for ${org.name}.`, `Could not change the ${key} module.`, () => loadLogs().catch(() => {})),
    addSubUser: (email, name) => run(() => saApi.post('/sub-users', { email, name }),
      (r) => (r.invite_sent ? `Access given. ${email} got an email to set their password.` : 'Access given, but the email could not be sent. Share the setup link yourself.'), 'Could not add this person.'),
    resendInvite: (user) => run(() => saApi.post(`/sub-users/${user.id}/invite`),
      (r) => (r.invite_sent ? `New setup link sent to ${user.email}.` : 'The email could not be sent. Share the setup link yourself.'), 'Could not send a new link.'),
    removeSubUser: (user) => run(() => saApi.delete(`/sub-users/${user.id}`), `${user.email} no longer has access.`, 'Could not remove access.'),
  };

  return { me, isMaster, data, logs, subUsers, loading, refreshing, lastLoaded, reload, loadDetail, actions };
}
