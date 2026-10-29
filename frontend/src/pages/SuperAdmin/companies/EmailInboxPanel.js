import React, { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Chip, Input, Loading, Select } from '../../../ui';
import { dateLabel, errorOf, saApi } from '../consoleUtils';

const PRESETS = [
  ['imap.gmail.com', 'Gmail / Google Workspace', 'Use an app password (Google account → Security → App passwords).'],
  ['outlook.office365.com', 'Microsoft 365 / Outlook', 'Microsoft blocks password sign-in for most accounts; IMAP must be allowed for this mailbox.'],
  ['imap.zoho.in', 'Zoho Mail', 'Turn on IMAP access in Zoho Mail settings and use an app password.'],
];
const BLANK = { host: 'imap.gmail.com', port: 993, username: '', password: '', team_id: '' };

function Row({ label, help, children }) {
  return (
    <label className="grid gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start sm:gap-3">
      <span className="pt-2 text-sm font-medium">{label}</span>
      <span className="flex flex-col gap-1">{children}{help && <span className="text-xs text-muted">{help}</span>}</span>
    </label>
  );
}

// Company → Email to task: off for everyone until the platform team turns it on for an organization
// and gives it an inbox. New emails to that inbox become tasks in the chosen team every 2 minutes.
export default function EmailInboxPanel({ orgs, sa, onChanged }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id || null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);
  const org = orgs.find((o) => o.id === orgId) || orgs[0];

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const { data: next } = await saApi.get(`/organizations/${org.id}/email-inbox`);
      setData(next);
      setForm(next.inbox ? { ...BLANK, ...next.inbox, password: '', team_id: next.inbox.team_id || '' } : { ...BLANK, team_id: next.teams[0]?.id || '' });
    } catch (err) { setMessage({ tone: 'danger', text: errorOf(err, 'Could not load the inbox settings.') }); setData({ teams: [], inbox: null }); }
  }, [org]);
  useEffect(() => { setData(null); setMessage(null); load(); }, [load]);

  if (!org) return <p className="text-sm text-muted">This company has no organizations yet.</p>;
  const on = Boolean(org.modules?.email_to_task);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const preset = PRESETS.find(([host]) => host === form.host);
  const payload = () => ({ host: form.host, port: Number(form.port) || 993, username: form.username, team_id: Number(form.team_id), ...(form.password ? { password: form.password } : {}) });

  const toggle = async () => {
    setBusy('toggle');
    try { if (await sa.actions.toggleModule(org, 'email_to_task', !on)) await onChanged?.(); } finally { setBusy(''); }
  };
  const call = async (kind, request, ok) => {
    setBusy(kind); setMessage(null);
    try { const { data: res } = await request(); setMessage({ tone: 'ok', text: ok(res) }); if (kind !== 'test') load(); }
    catch (err) { setMessage({ tone: 'danger', text: errorOf(err, 'Something went wrong.') }); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col gap-4">
      {orgs.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Organization</span>
          <Select aria-label="Organization" value={org.id} onChange={(e) => setOrgId(Number(e.target.value))} className="w-auto">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
      )}

      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${on ? 'border-accent/40 bg-accent-soft/40' : 'border-line'}`}>
        <div className="min-w-0">
          <p className="font-semibold">Email to task for {org.name} <Chip tone={on ? 'ok' : 'neutral'}>{on ? 'On' : 'Off'}</Chip></p>
          <p className="mt-0.5 text-sm text-muted">Emails sent to this organization&apos;s inbox become tasks automatically (checked every 2 minutes). Off for every company until you turn it on here.</p>
        </div>
        <Button variant={on ? 'secondary' : 'primary'} disabled={busy === 'toggle'} onClick={toggle}>{busy === 'toggle' ? 'Saving…' : on ? 'Turn off' : 'Turn on'}</Button>
      </div>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {data === null ? <Loading>Loading inbox settings…</Loading> : (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Inbox</h3>
            {data.inbox && (
              <p className="text-xs text-muted">
                {data.inbox.last_checked_at ? `Last checked ${dateLabel(data.inbox.last_checked_at)}` : 'Not checked yet'} · {data.inbox.tasks_created || 0} tasks created
              </p>
            )}
          </div>
          {data.inbox?.last_error && <Banner tone="warn"><strong>Last check failed:</strong> {data.inbox.last_error}</Banner>}
          {!data.teams.length && <Banner tone="warn">This organization has no teams yet. Create a team first; new tasks go into it.</Banner>}

          <Row label="Mail provider" help={preset?.[2]}>
            <Select aria-label="Mail provider" value={preset ? form.host : 'other'} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value === 'other' ? '' : e.target.value }))}>
              {PRESETS.map(([host, label]) => <option key={host} value={host}>{label}</option>)}
              <option value="other">Other (type the IMAP server)</option>
            </Select>
          </Row>
          {!preset && <Row label="IMAP server"><Input aria-label="IMAP server" placeholder="imap.example.com" value={form.host} onChange={set('host')} /></Row>}
          <Row label="Port" help="Almost always 993."><Input aria-label="Port" type="number" value={form.port} onChange={set('port')} className="w-28" /></Row>
          <Row label="Inbox email"><Input aria-label="Inbox email" type="email" placeholder="tasks@company.com" value={form.username} onChange={set('username')} /></Row>
          <Row label="Password" help={data.inbox?.has_password ? 'Saved securely. Leave empty to keep it.' : 'Stored encrypted. Never shown again.'}>
            <Input aria-label="Inbox password" type="password" autoComplete="new-password" placeholder={data.inbox?.has_password ? '•••••••• (saved)' : 'App password'} value={form.password} onChange={set('password')} />
          </Row>
          <Row label="New tasks go to" help="Tasks are created as bugs in this team, with the sender as the client name.">
            <Select aria-label="Team for new tasks" value={form.team_id} onChange={set('team_id')}>
              <option value="">Choose a team</option>
              {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Row>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
            {data.inbox && <Button variant="danger" disabled={Boolean(busy)} onClick={() => { if (window.confirm('Remove this inbox? No more emails will become tasks.')) call('remove', () => saApi.delete(`/organizations/${org.id}/email-inbox`), () => 'Inbox removed.'); }}>Remove</Button>}
            <Button disabled={Boolean(busy)} onClick={() => call('test', () => saApi.post(`/organizations/${org.id}/email-inbox/test`, payload()), (r) => r.message || 'Signed in to the inbox.')}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
            <Button variant="primary" disabled={Boolean(busy)} onClick={() => call('save', () => saApi.put(`/organizations/${org.id}/email-inbox`, payload()), () => (on ? 'Saved. New emails become tasks within 2 minutes.' : 'Saved. Turn it on above to start creating tasks.'))}>{busy === 'save' ? 'Saving…' : 'Save inbox'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
