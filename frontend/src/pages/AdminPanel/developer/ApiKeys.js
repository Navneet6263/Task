import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Chip, EmptyState, Input, Modal, Select, Table, TableWrap, Td, Textarea, Th } from '../../../ui';
import { CodeBlock, SecretOnce, apiBase, errorOf, when } from './devShared';

const statusOf = (k) => (k.revoked_at ? ['Revoked', 'danger'] : k.expires_at && new Date(k.expires_at) < new Date() ? ['Expired', 'warn']
  : k.replaced_by ? ['Replaced · ends soon', 'warn'] : ['Active', 'ok']);

// A new key shown once, with a command to try it.
function KeyReveal({ created, onClose, rotated }) {
  return (
    <Modal size="md" title={rotated ? `New key for "${created.name}"` : `Key "${created.name}" is ready`} onClose={onClose} footer={<><span className="flex-1" /><Button variant="primary" onClick={onClose}>I have saved it</Button></>}>
      <SecretOnce label={created.mode === 'test' ? 'Test key' : 'API key'} value={created.key}>
        {rotated && <p className="rounded-lg bg-info-soft p-3 text-sm">The old key keeps working for 24 hours. Put this one in your other software today, then the old one stops by itself.</p>}
        {created.mode === 'test' && <p className="rounded-lg bg-info-soft p-3 text-sm">This is a <strong>test key</strong>: every call is checked as usual, but nothing is saved. Use it while building, then make a live key.</p>}
        <p className="text-sm text-muted">Try it from a terminal. You should see your company's name:</p>
        <CodeBlock title="Test the key" code={`curl ${apiBase()}/me \\\n  -H "Authorization: Bearer ${created.key}"`} />
        <p className="text-xs text-muted">Keep the key on your server only, never in a website or an app on someone's phone.</p>
      </SecretOnce>
    </Modal>
  );
}

function CreateKey({ scopes, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', mode: 'live', scopes: ['tasks:read', 'tasks:write'], expires_in_days: '365', allowed_ips: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const toggle = (scope) => setForm((f) => ({ ...f, scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope] }));
  const save = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post('/developer/keys', { ...form, expires_in_days: Number(form.expires_in_days) || 0 }); setCreated(data); onCreated(); }
    catch (err) { setError(errorOf(err, 'Could not create the key.')); }
    finally { setBusy(false); }
  };

  if (created) return <KeyReveal created={created} onClose={onClose} />;
  return (
    <Modal size="md" title="Create an API key" subtitle="Give each connected software its own key, so you can switch one off without touching the others." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><span className="flex-1" /><Button variant="primary" disabled={busy || !form.name.trim() || !form.scopes.length} onClick={save}>{busy ? 'Creating…' : 'Create key'}</Button></>}>
      <div className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Name</span>
          <Input autoFocus maxLength={100} placeholder="e.g. CRM connection" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          {[['live', 'Live key', 'Real tasks are created and changed.'], ['test', 'Test key', 'Everything is checked, nothing is saved. For building and trying.']].map(([mode, title, text]) => (
            <button key={mode} type="button" aria-pressed={form.mode === mode} onClick={() => setForm({ ...form, mode })}
              className={`rounded-lg border p-3 text-left transition ${form.mode === mode ? 'border-accent bg-accent-soft ring-2 ring-accent/15' : 'border-line hover:border-muted'}`}>
              <span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{text}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">What may it do?</span>
          {Object.entries(scopes).map(([scope, text]) => (
            <label key={scope} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2 hover:bg-subtle">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={form.scopes.includes(scope)} onChange={() => toggle(scope)} />
              <span><code className="text-xs font-semibold text-accent">{scope}</code><span className="block text-sm">{text}</span></span>
            </label>
          ))}
          <span className="text-xs text-muted">Give only what the software needs. A key that only reads cannot change anything.</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Expires</span>
            <Select value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })}>
              <option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In 1 year</option><option value="0">Never</option>
            </Select></label>
          <label className="flex flex-col gap-1"><span className="text-sm font-medium">Only from these IPs <span className="font-normal text-muted">(optional)</span></span>
            <Textarea rows={2} placeholder="e.g. 203.0.113.7, 198.51.100.0/24" value={form.allowed_ips} onChange={(e) => setForm({ ...form, allowed_ips: e.target.value })} />
            <span className="text-xs text-muted">Your other server's public IP. Calls from anywhere else are refused.</span></label>
        </div>
      </div>
    </Modal>
  );
}

// Admin → Developer → API keys.
export default function ApiKeys({ status }) {
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [rotated, setRotated] = useState(null);
  const load = useCallback(() => api.get('/developer/keys').then((r) => setRows(r.data)).catch((err) => { notify(errorOf(err, 'Could not load keys.')); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (k) => {
    if (!window.confirm(`Revoke "${k.name}"? Software using it stops working at once. This cannot be undone.`)) return;
    try { await api.delete(`/developer/keys/${k.id}`); notify(`"${k.name}" revoked.`, 'success'); load(); }
    catch (err) { notify(errorOf(err, 'Could not revoke the key.')); }
  };

  const rotate = async (k) => {
    if (!window.confirm(`Make a new key for "${k.name}"? The old one keeps working for 24 hours so you can switch over.`)) return;
    try { const { data } = await api.post(`/developer/keys/${k.id}/rotate`); setRotated(data); load(); }
    catch (err) { notify(errorOf(err, 'Could not rotate the key.')); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Each key works only for <strong className="text-ink">{status.organization?.name}</strong>, acts as the admin who made it, and allows {status.rate_per_minute} calls a minute.</p>
        <Button variant="primary" onClick={() => setCreating(true)}>+ Create API key</Button>
      </div>
      {rows?.length === 0 && <EmptyState title="No API keys yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Create your first key</Button>}>A key lets your CRM, HRMS or any software create and read tasks here.</EmptyState>}
      {rows?.length > 0 && (
        <TableWrap>
          <Table>
            <thead><tr><Th>Name</Th><Th>Key</Th><Th>Permissions</Th><Th>Last used</Th><Th align="right">Calls (24h)</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {rows.map((k) => {
                const [label, tone] = statusOf(k);
                return (
                  <tr key={k.id} className="border-t border-line">
                    <Td className="align-middle"><span className="flex items-center gap-1.5 font-semibold">{k.name}{k.mode === 'test' && <Chip tone="info">Test</Chip>}</span><span className="block text-xs text-muted">by {k.created_by_name} · {when(k.created_at)}</span></Td>
                    <Td className="align-middle font-mono text-xs">{k.key_prefix}_••••</Td>
                    <Td className="align-middle"><span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Chip key={s} tone="info">{s}</Chip>)}</span>{k.allowed_ips && <span className="block text-[11px] text-muted">IPs: {k.allowed_ips}</span>}</Td>
                    <Td className="whitespace-nowrap align-middle text-xs text-muted">{when(k.last_used_at)}{k.last_used_ip && <span className="block">{k.last_used_ip}</span>}</Td>
                    <Td align="right" mono className="align-middle">{k.calls_24h}</Td>
                    <Td className="align-middle"><Chip tone={tone}>{label}</Chip>{k.expires_at && !k.revoked_at && <span className="block text-[11px] text-muted">until {when(k.expires_at).slice(0, 11)}</span>}</Td>
                    <Td align="right" className="align-middle"><span className="flex justify-end gap-1.5">
                      {!k.revoked_at && !k.replaced_by && <Button size="sm" onClick={() => rotate(k)}>Rotate</Button>}
                      {!k.revoked_at && <Button size="sm" variant="danger" onClick={() => revoke(k)}>Revoke</Button>}
                    </span></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
      {creating && <CreateKey scopes={status.scopes} onClose={() => setCreating(false)} onCreated={load} />}
      {rotated && <KeyReveal created={rotated} rotated onClose={() => setRotated(null)} />}
    </div>
  );
}
