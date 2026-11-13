import React, { useState } from 'react';
import { clients as clientsApi } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Input, SearchSelect } from '../../ui';
import useClients, { announceClientsChange } from './useClients';
import { clientsForAgent } from './AgentPicker';

// The client field on task forms. Follows Settings → Clients:
// "pick only" → a searchable list of active clients (managers can add one inline);
// otherwise free typing with suggestions from the list. Search matters: some companies have 400+ clients.
// Each client shows its agent, so two similar names are easy to tell apart.
// `agentId` narrows the list to that agent's clients; a new client added here goes under that agent.
export default function ClientPicker({ id, value, onChange, disabled = false, preview = null, agentId = null }) {
  const live = useClients();
  const { clients, pick_only: pickOnly, can_manage: canManage } = preview || live;
  const agents = (preview || live).agents || [];
  const agentName = (c) => (agentId ? '' : agents.find((a) => String(a.id) === String(c.agent_id || ''))?.name || '');
  const listed = clientsForAgent(clients.filter((c) => c.is_active !== false), agentId);
  const names = listed.map((c) => c.name);
  const options = listed.map((c) => ({ value: c.name, label: c.name, hint: agentName(c) }));
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);
  const v = value || '';

  const add = async () => {
    const name = String(adding || '').trim();
    if (!name || preview) return;
    setBusy(true);
    try {
      const { data } = await clientsApi.create(name, agentId);
      announceClientsChange(); onChange(data.name); setAdding(null);
      notify(`${data.name} added to your client list.`, 'success');
    } catch (err) {
      if (err.response?.status === 409) { onChange(name); setAdding(null); }
      notify(err.response?.data?.error || 'Could not add the client.');
    } finally { setBusy(false); }
  };

  if (!pickOnly) {
    return (
      <SearchSelect id={id} allowFree disabled={disabled} placeholder="Type or pick a client" value={v} onChange={(next) => onChange(String(next).slice(0, 255))} options={options} />
    );
  }

  const all = v && !names.includes(v) ? [{ value: v, label: v, hint: 'Not in the list' }, ...options] : options;
  return (
    <div className="flex flex-col gap-1.5">
      <SearchSelect id={id} disabled={disabled} value={v} onChange={onChange} options={all}
        placeholder={names.length ? `Search ${names.length} clients…` : 'No clients yet'} emptyText="No client with that name." />
      {canManage ? (
        adding === null ? (
          <button type="button" disabled={disabled} onClick={() => setAdding('')} className="w-fit text-xs font-semibold text-accent hover:underline">+ Add a new client</button>
        ) : (
          <div className="flex gap-2">
            <Input aria-label="New client name" autoFocus maxLength={255} placeholder="Client name" value={adding}
              onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') setAdding(null); }} />
            <Button size="sm" variant="primary" disabled={busy || !adding.trim()} onClick={add}>{busy ? 'Adding…' : 'Add'}</Button>
            <Button size="sm" onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        )
      ) : (
        <p className="text-xs text-muted">{names.length ? 'Client names are added by your manager or admin.' : 'No clients yet — ask your manager or admin to add them in Settings → Clients.'}</p>
      )}
    </div>
  );
}
