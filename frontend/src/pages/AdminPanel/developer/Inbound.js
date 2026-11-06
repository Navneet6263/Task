import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Banner, Button, Chip, EmptyState, Input, Modal, Select, Switch, Table, TableWrap, Td, Th } from '../../../ui';
import { CodeBlock, SecretOnce, apiBase, errorOf, when } from './devShared';

const addressOf = (token) => `${apiBase()}/inbound/${token}`;
const sampleCurl = (url) => `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '{ "ticket": { "id": "T-981", "subject": "Printer not working", "owner": "asha@company.com", "due": "2026-11-30" } }'`;
const OUTCOME_TONE = { created: 'ok', updated: 'info', sample: 'neutral', skipped: 'warn', error: 'danger' };

function CreateInbound({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.post('/developer/inbound', { name }); setCreated(data); onCreated(); }
    catch (err) { notify(errorOf(err, 'Could not create the connection.')); }
    finally { setBusy(false); }
  };
  if (created) {
    const url = addressOf(created.token);
    return (
      <Modal size="md" title="Connection ready" onClose={onClose} footer={<><span className="flex-1" /><Button variant="primary" onClick={onClose}>I have saved it</Button></>}>
        <SecretOnce label="Address" value={url}>
          <p className="text-sm text-muted"><strong className="text-ink">Next:</strong> set your other software to POST its normal JSON to this address, or send one record by hand. The first record is kept as a sample, so you can match its fields to task fields. Nothing becomes a task until you go live.</p>
          <CodeBlock title="Send a sample by hand" code={sampleCurl(url)} />
          <p className="text-xs text-muted">The address itself is the password: anyone who has it can send tasks. Share it only with the other system, and make a new one here if it leaks.</p>
        </SecretOnce>
      </Modal>
    );
  }
  return (
    <Modal title="Add an incoming connection" subtitle="Your CRM, HRMS or any system sends its own JSON here. You match the fields, no code needed." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><span className="flex-1" /><Button variant="primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Creating…' : 'Create'}</Button></>}>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium">Name</span>
        <Input autoFocus maxLength={100} placeholder="e.g. CRM tickets" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="text-xs text-muted">Tasks from it are marked with this source, so the same record id always updates the same task.</span></label>
    </Modal>
  );
}

// Match their fields to task fields, try it on the sample, then go live.
function Matching({ hookId, fields, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [mapping, setMapping] = useState({});
  const [required, setRequired] = useState(new Set());
  const [teamId, setTeamId] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/developer/inbound/${hookId}`).then(({ data: d }) => {
    setData(d); setMapping(d.mapping || {}); setRequired(new Set(d.required || [])); setTeamId(d.team_id ? String(d.team_id) : String(d.teams[0]?.id || ''));
  }).catch((err) => notify(errorOf(err, 'Could not open the connection.'))), [hookId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data?.has_sample || !mapping.title) { setPreview(null); return undefined; }
    const timer = setTimeout(() => api.post(`/developer/inbound/${hookId}/preview`, { mapping, required: [...required] }).then((r) => setPreview(r.data)).catch(() => setPreview(null)), 300);
    return () => clearTimeout(timer);
  }, [mapping, required, hookId, data?.has_sample]);

  const save = async (goLive) => {
    setBusy(true);
    try {
      await api.patch(`/developer/inbound/${hookId}`, { mapping, required: [...required], team_id: Number(teamId), ...(goLive !== undefined ? { listening: !goLive } : {}) });
      notify(goLive ? 'Live. New records now become tasks.' : 'Saved.', 'success'); onSaved(); onClose();
    } catch (err) { notify(errorOf(err, 'Could not save.')); }
    finally { setBusy(false); }
  };

  if (!data) return <Modal title="Loading…" onClose={onClose}><p className="text-sm text-muted">Opening…</p></Modal>;
  return (
    <Modal size="lg" title={`Match fields: ${data.name}`} subtitle="Pick which of their fields fills each task field." onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button><span className="flex-1" />
        {data.has_sample && <Button disabled={busy || !mapping.title} onClick={() => save()}>Save</Button>}
        {data.has_sample && <Button variant="primary" disabled={busy || !mapping.title || !teamId || preview?.problems?.length > 0} onClick={() => save(true)}>{data.listening ? 'Save and go live' : 'Save'}</Button>}
      </>}>
      {!data.has_sample ? (
        <div className="flex flex-col gap-3">
          <Banner tone="info">Waiting for the first record. Send one from your system (or with the command below), then press Refresh.</Banner>
          <Button className="self-start" onClick={load}>Refresh</Button>
          <p className="text-xs text-muted">The address was shown when you created the connection. Lost it? Use "New address" on the connection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3">
            <TableWrap>
              <Table>
                <thead><tr><Th>Task field</Th><Th>Their field</Th><Th>Value in the sample</Th><Th align="right">Must be filled</Th></tr></thead>
                <tbody>
                  {fields.map((f) => {
                    const path = mapping[f.key] || '';
                    const hit = data.paths.find((p) => p.path === path);
                    return (
                      <tr key={f.key} className="border-t border-line">
                        <Td className="align-middle"><span className="font-medium">{f.label}</span>{f.always && <span className="text-danger"> *</span>}{f.hint && <span className="block text-[11px] text-muted">{f.hint}</span>}</Td>
                        <Td className="align-middle">
                          <Select aria-label={`Field for ${f.label}`} className="!w-auto min-w-[170px] py-1 font-mono text-xs" value={path} onChange={(e) => {
                            const next = e.target.value; setMapping((m) => ({ ...m, [f.key]: next }));
                            if (!next) setRequired((r) => { const n = new Set(r); n.delete(f.key); return n; });
                          }}>
                            <option value="">{f.always ? 'Choose…' : 'Not used'}</option>
                            {data.paths.map((p) => <option key={p.path} value={p.path}>{p.path}</option>)}
                          </Select>
                        </Td>
                        <Td className="max-w-[200px] truncate align-middle text-xs text-muted">{hit ? hit.sample || '(empty)' : ''}</Td>
                        <Td align="right" className="align-middle">{f.always ? <span className="text-xs text-muted">Always</span>
                          : <Switch label={`${f.label} must be filled`} checked={required.has(f.key)} disabled={!path} onChange={() => setRequired((r) => { const n = new Set(r); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })} />}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
            <label className="flex flex-col gap-1"><span className="text-sm font-medium">Put the tasks in</span>
              <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>{data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
          </div>
          <aside className="flex flex-col gap-3">
            <div className="rounded-lg border border-line p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">The sample becomes</p>
              {!preview && <p className="text-xs text-muted">Choose the title field to see a preview.</p>}
              {preview?.problems?.length > 0 && <ul className="mb-2 list-disc pl-4 text-xs text-danger">{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
              {preview && (
                <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                  {Object.entries(preview.body).filter(([k]) => !['team', 'source'].includes(k)).map(([k, v]) => <React.Fragment key={k}><dt className="text-muted">{k}</dt><dd className="truncate font-medium">{Array.isArray(v) ? v.join(', ') : String(v)}</dd></React.Fragment>)}
                </dl>
              )}
            </div>
            <details className="rounded-lg border border-line p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Their sample (JSON)</summary>
              <pre className="mt-2 max-h-60 overflow-auto rounded bg-subtle p-2 font-mono text-[11px]">{JSON.stringify(data.sample, null, 2)}</pre>
            </details>
            {data.events.length > 0 && (
              <div className="rounded-lg border border-line p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Recent records</p>
                <ul className="flex flex-col gap-1 text-xs">{data.events.slice(0, 8).map((e) => <li key={e.id} className="flex items-center gap-2"><Chip tone={OUTCOME_TONE[e.outcome] || 'neutral'}>{e.outcome}</Chip><span className="min-w-0 flex-1 truncate">{e.message}</span></li>)}</ul>
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

// Admin → Developer → Incoming.
export default function Inbound({ status }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [matching, setMatching] = useState(null);
  const [newAddress, setNewAddress] = useState(null);
  const load = useCallback(() => api.get('/developer/inbound').then((r) => setRows(r.data)).catch((err) => { notify(errorOf(err, 'Could not load connections.')); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);
  const act = async (request, message) => { try { const r = await request(); if (message) notify(message, 'success'); await load(); return r.data; } catch (err) { notify(errorOf(err, 'Something went wrong.')); return null; } };
  const rotate = async (hook) => {
    if (!window.confirm('Make a new address? The old one stops working at once, so update your other system right after.')) return;
    const data = await act(() => api.post(`/developer/inbound/${hook.id}/rotate`));
    if (data?.token) setNewAddress(addressOf(data.token));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Your system sends its own JSON (one record, or a list of up to {status.inbound_batch}); you match the fields once. No code to change on their side.</p>
        <Button variant="primary" onClick={() => setAdding(true)}>+ Add connection</Button>
      </div>
      {rows?.length === 0 && <EmptyState title="No incoming connections yet" action={<Button variant="primary" onClick={() => setAdding(true)}>Add a connection</Button>}>For software that can send data to an address but cannot follow our format.</EmptyState>}
      {(rows || []).map((hook) => (
        <div key={hook.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">{hook.name}
                {!hook.is_active ? <Chip tone="warn">Paused</Chip> : hook.listening ? <Chip tone="info">{hook.has_sample ? 'Sample received · not live' : 'Waiting for a sample'}</Chip> : <Chip tone="ok">Live</Chip>}</p>
              <p className="font-mono text-xs text-muted">{apiBase()}/inbound/{hook.token_prefix}_••••</p>
            </div>
            <p className="text-right text-xs text-muted">Source: <code>{hook.source}</code><br />Last record: {when(hook.last_received_at)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setMatching(hook.id)}>{hook.listening ? 'Match fields' : 'Edit matching'}</Button>
            <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/developer/inbound/${hook.id}`, { is_active: !hook.is_active }), hook.is_active ? 'Paused.' : 'Turned on.')}>{hook.is_active ? 'Pause' : 'Turn on'}</Button>
            {!hook.listening && <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/developer/inbound/${hook.id}`, { listening: true }), 'Listening for a new sample. Records are not turned into tasks meanwhile.')}>Take a new sample</Button>}
            <Button size="sm" variant="ghost" onClick={() => rotate(hook)}>New address</Button>
            <span className="flex-1" />
            <Button size="sm" variant="danger" onClick={() => window.confirm(`Delete "${hook.name}"? Tasks it made stay.`) && act(() => api.delete(`/developer/inbound/${hook.id}`), 'Deleted.')}>Delete</Button>
          </div>
        </div>
      ))}
      {adding && <CreateInbound onClose={() => setAdding(false)} onCreated={load} />}
      {matching && <Matching hookId={matching} fields={status.inbound_fields} onClose={() => setMatching(null)} onSaved={load} />}
      {newAddress && (
        <Modal title="New address" onClose={() => setNewAddress(null)} footer={<><span className="flex-1" /><Button variant="primary" onClick={() => setNewAddress(null)}>I have saved it</Button></>}>
          <SecretOnce label="Address" value={newAddress} />
        </Modal>
      )}
    </div>
  );
}
