import React, { useCallback, useEffect, useState } from 'react';
import { accountSessions } from '../../services/api';
import { notify } from '../../services/feedback';
import { clearAuthentication } from '../../services/preferences';
import { ago } from '../../components/taskExtras/TaskHistory';
import { Button, Card, Chip, Loading } from '../../ui';

// "Chrome on Windows" from the browser's user agent: enough to recognise a device, nothing more.
export function deviceName(agent = '') {
  const ua = String(agent);
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const system = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || 'Unknown device';
}

const signedIn = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Settings → Password & security: every device signed in to this account, with Sign out per device
// and for all other devices at once. Ending a sign-in works on the server, so a copied token stops too.
export default function SignedInDevices() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => accountSessions.list()
    .then((r) => setRows(r.data.sessions || []))
    .catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);

  const end = async (row) => {
    setBusy(String(row.id));
    try {
      await accountSessions.revoke(row.id);
      if (row.current) { clearAuthentication(); window.location.assign('/login'); return; }
      notify(`Signed out of ${deviceName(row.user_agent)}.`, 'success');
      await load();
    } catch (err) { notify(err.response?.data?.error || 'Could not sign that device out.'); }
    finally { setBusy(''); }
  };
  const endOthers = async () => {
    setBusy('others');
    try {
      const { data } = await accountSessions.revokeOthers();
      notify(data.ended ? `Signed out of ${data.ended} other ${data.ended === 1 ? 'device' : 'devices'}.` : 'No other devices were signed in.', 'success');
      await load();
    } catch (err) { notify(err.response?.data?.error || 'Could not sign the other devices out.'); }
    finally { setBusy(''); }
  };

  const others = (rows || []).filter((row) => !row.current).length;
  return (
    <Card className="px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
        <div>
          <h3 className="text-[15px] font-semibold">Where you are signed in</h3>
          <p className="text-xs text-muted">If you see a device you do not recognise, sign it out and change your password.</p>
        </div>
        <Button size="sm" disabled={!others || busy === 'others'} onClick={endOthers}>{busy === 'others' ? 'Signing out…' : 'Sign out all other devices'}</Button>
      </div>
      {!rows ? <div className="py-4"><Loading>Loading devices…</Loading></div> : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {deviceName(row.user_agent)}
                  {row.current && <Chip>This device</Chip>}
                  {!row.remember && <span className="text-xs font-normal text-muted">ends after 12 hours</span>}
                </p>
                <p className="text-xs text-muted">
                  {row.ip ? `IP ${row.ip} · ` : ''}Signed in {signedIn(row.created_at)} · Last active {ago(row.last_seen_at) || 'just now'}
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy === String(row.id)} onClick={() => end(row)}>
                {row.current ? 'Sign out here' : 'Sign out'}
              </Button>
            </li>
          ))}
          {!rows.length && <li className="py-3 text-sm text-muted">No other sign-ins.</li>}
        </ul>
      )}
    </Card>
  );
}
