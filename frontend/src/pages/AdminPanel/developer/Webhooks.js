import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Chip, EmptyState, Input, Modal } from '../../../ui';
import { CodeBlock, SecretOnce, errorOf, when } from './devShared';

export const VERIFY_SNIPPET = `// Node.js: check that a webhook really came from GreenTask
const crypto = require('crypto');

function isFromGreenTask(rawBody, headers, secret) {
  const timestamp = headers['x-greentask-timestamp'];
  const signature = headers['x-greentask-signature'];          // "sha256=..."
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // older than 5 minutes
  const expected = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(timestamp + '.' + rawBody).digest('hex');
  return signature && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}`;

function HookForm({ events, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', url: '', events: ['task.created', 'task.completed'] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const toggle = (e) => setForm((f) => ({ ...f, events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] }));
  const save = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post('/developer/webhooks', form); setSecret(data.secret); onCreated(); }
    catch (err) { setError(errorOf(err, 'Could not save the webhook.')); }
    finally { setBusy(false); }
  };
  if (secret) {
    return (
      <Modal size="md" title="Webhook added" onClose={onClose} footer={<><span className="flex-1" /><Button variant="primary" onClick={onClose}>I have saved it</Button></>}>
        <SecretOnce label="Signing secret" value={secret}>
          <p className="text-sm text-muted">Every call carries a signature made with this secret. Check it on your server, so nobody else can pretend to be GreenTask:</p>
          <CodeBlock title="Verify a webhook" code={VERIFY_SNIPPET} />
        </SecretOnce>
      </Modal>
    );
  }
  return (
    <Modal size="md" title="Add a webhook" subtitle="GreenTask calls this address when something happens to a task." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><span className="flex-1" /><Button variant="primary" disabled={busy || !form.name.trim() || !form.url.trim() || !form.events.length} onClick={save}>{busy ? 'Saving…' : 'Add webhook'}</Button></>}>
      <div className="flex flex-col gap-4">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Name</span>
          <Input autoFocus maxLength={100} placeholder="e.g. Update CRM tickets" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Address</span>
          <Input placeholder="https://crm.yourcompany.com/hooks/greentask" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <span className="text-xs text-muted">Must start with https://. Private and internal addresses are not allowed.</span></label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Send when</span>
          {Object.entries(events).map(([event, text]) => (
            <label key={event} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-subtle">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={form.events.includes(event)} onChange={() => toggle(event)} />
              <code className="w-32 shrink-0 text-xs font-semibold text-accent">{event}</code><span className="text-sm">{text}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function Deliveries({ hook }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get(`/developer/webhooks/${hook.id}/deliveries`).then((r) => setRows(r.data)).catch(() => setRows([])); }, [hook.id, hook.last_delivery_at]);
  if (!rows) return <p className="text-xs text-muted">Loading…</p>;
  if (!rows.length) return <p className="text-xs text-muted">Nothing sent yet. Press "Send test".</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-md border border-line text-xs">
      {rows.slice(0, 10).map((d) => {
        const ok = d.status_code >= 200 && d.status_code < 300;
        return (
          <li key={d.id} className="flex items-center gap-3 px-3 py-1.5">
            <span className={`h-2 w-2 rounded-full ${ok ? 'bg-accent' : 'bg-danger'}`} />
            <code className="w-28 shrink-0">{d.event}</code>
            <span className={ok ? 'text-accent' : 'text-danger'}>{d.status_code ? `HTTP ${d.status_code}` : 'No answer'}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{d.error || ''}</span>
            <span className="text-muted">{d.duration_ms} ms · {when(d.created_at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Admin → Developer → Webhooks.
export default function Webhooks({ status }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rotated, setRotated] = useState(null);
  const load = useCallback(() => api.get('/developer/webhooks').then((r) => setRows(r.data)).catch((err) => { notify(errorOf(err, 'Could not load webhooks.')); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);
  const act = async (hook, request, message) => {
    setBusy(hook.id);
    try { const { data } = await request(); if (message) notify(typeof message === 'function' ? message(data) : message, data?.ok === false ? 'error' : 'success'); await load(); return data; }
    catch (err) { notify(errorOf(err, 'Something went wrong.')); return null; }
    finally { setBusy(null); }
  };
  const test = (hook) => act(hook, () => api.post(`/developer/webhooks/${hook.id}/test`), (r) => (r.ok ? `Delivered (HTTP ${r.status}, ${r.ms} ms).` : `Failed: ${r.error || `HTTP ${r.status}`}`)).then(() => setOpen(hook.id));
  const rotate = async (hook) => {
    if (!window.confirm('Make a new signing secret? The old one stops working at once, so update your server right after.')) return;
    const data = await act(hook, () => api.post(`/developer/webhooks/${hook.id}/rotate-secret`));
    if (data?.secret) setRotated(data.secret);
  };
  const remove = (hook) => { if (window.confirm(`Delete "${hook.name}"?`)) act(hook, () => api.delete(`/developer/webhooks/${hook.id}`), 'Webhook deleted.'); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Each call is signed and gets 8 seconds to answer. A failed call is tried again after 1 min, 5 min, 30 min, 2 h and 6 h. After 20 failures in a row a webhook switches itself off.</p>
        <Button variant="primary" onClick={() => setAdding(true)}>+ Add webhook</Button>
      </div>
      {rows?.length === 0 && <EmptyState title="No webhooks yet" action={<Button variant="primary" onClick={() => setAdding(true)}>Add a webhook</Button>}>Tell your other software the moment a task is created, changed or done.</EmptyState>}
      {(rows || []).map((hook) => (
        <div key={hook.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">{hook.name}
                <Chip tone={hook.is_active ? 'ok' : hook.failure_count >= 20 ? 'danger' : 'warn'}>{hook.is_active ? 'Active' : hook.failure_count >= 20 ? 'Off after failures' : 'Paused'}</Chip></p>
              <p className="truncate font-mono text-xs text-muted">{hook.url}</p>
              <p className="mt-1 flex flex-wrap gap-1">{hook.events.map((e) => <Chip key={e} tone="info">{e}</Chip>)}</p>
            </div>
            <p className="text-right text-xs text-muted">Last call: {when(hook.last_delivery_at)}{hook.last_status ? ` · HTTP ${hook.last_status}` : ''}
              {hook.waiting > 0 && <span className="block font-semibold text-warn">{hook.waiting} waiting to be sent or retried</span>}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy === hook.id} onClick={() => test(hook)}>{busy === hook.id ? 'Sending…' : 'Send test'}</Button>
            <Button size="sm" onClick={() => setOpen(open === hook.id ? null : hook.id)}>{open === hook.id ? 'Hide deliveries' : 'Deliveries'}</Button>
            <Button size="sm" variant="ghost" disabled={busy === hook.id} onClick={() => act(hook, () => api.patch(`/developer/webhooks/${hook.id}`, { is_active: !hook.is_active }), hook.is_active ? 'Paused.' : 'Turned on.')}>{hook.is_active ? 'Pause' : 'Turn on'}</Button>
            <Button size="sm" variant="ghost" disabled={busy === hook.id} onClick={() => rotate(hook)}>New secret</Button>
            <span className="flex-1" />
            <Button size="sm" variant="danger" disabled={busy === hook.id} onClick={() => remove(hook)}>Delete</Button>
          </div>
          {open === hook.id && <Deliveries hook={hook} />}
        </div>
      ))}
      {adding && <HookForm events={status.events} onClose={() => setAdding(false)} onCreated={load} />}
      {rotated && (
        <Modal title="New signing secret" onClose={() => setRotated(null)} footer={<><span className="flex-1" /><Button variant="primary" onClick={() => setRotated(null)}>I have saved it</Button></>}>
          <SecretOnce label="Signing secret" value={rotated} />
        </Modal>
      )}
    </div>
  );
}
