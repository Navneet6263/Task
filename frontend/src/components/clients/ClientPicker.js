import React, { useState } from 'react';
import { clients as clientsApi } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Input, Select } from '../../ui';
import useClients, { announceClientsChange } from './useClients';
import { clientsForAgent } from './AgentPicker';

// The client field on task forms. Follows Settings → Clients:
// "pick only" → a dropdown of active clients (managers can add one inline);
// otherwise free typing with suggestions from the list.
// `agentId` narrows the list to that agent's clients; a new client added here goes under that agent.
export default function ClientPicker({ id, value, onChange, disabled = false, preview = null, agentId = null }) {
  const live = useClients();
  const { clients, pick_only: pickOnly, can_manage: canManage } = preview || live;
  const names = clientsForAgent(clients.filter((c) => c.is_active !== false), agentId).map((c) => c.name);
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
      <>
        <Input id={id} list={`${id}-clients`} maxLength={255} disabled={disabled} placeholder="Type or pick a client" value={v} onChange={(e) => onChange(e.target.value)} />
        <datalist id={`${id}-clients`}>{names.map((name) => <option key={name} value={name} />)}</datalist>
      </>
    );
  }

  const options = v && !names.includes(v) ? [v, ...names] : names;
  return (
    <div className="flex flex-col gap-1.5">
      <Select id={id} disabled={disabled} value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">-Select client-</option>
        {options.map((name) => <option key={name} value={name}>{name}</option>)}
      </Select>
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
