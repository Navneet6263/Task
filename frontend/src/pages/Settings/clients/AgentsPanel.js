import React, { useState } from 'react';
import { clients as clientsApi } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { Button, Chip, Input, Switch } from '../../../ui';

// Agents: the accounting firms clients come through. Add, rename and switch them on/off.
export default function AgentsPanel({ agents, onChanged, filter, onFilter }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');

  const run = async (key, fn, success) => {
    setBusy(key);
    try { await fn(); notify(success, 'success'); await onChanged(); return true; }
    catch (err) { notify(err.response?.data?.error || 'Could not save the agent.'); return false; }
    finally { setBusy(''); }
  };
  const add = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (value && await run('add', () => clientsApi.createAgent(value), `${value} added. Pick it when you add a client.`)) setName('');
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">Agents</h3>
          <p className="text-xs text-muted">The firms your clients come through. Each client sits under one agent; in the timesheet, picking an agent shows only its clients.</p>
        </div>
        {filter && <Button size="sm" variant="ghost" onClick={() => onFilter('')}>Show all clients</Button>}
      </div>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input aria-label="Agent name" maxLength={255} placeholder="Agent name, e.g. ABR Accountants" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" disabled={busy === 'add' || !name.trim()}>{busy === 'add' ? 'Adding…' : 'Add agent'}</Button>
      </form>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {agents.map((agent) => (
          <li key={agent.id} className={`flex flex-wrap items-center gap-2 py-2 ${agent.is_active ? '' : 'opacity-60'}`}>
            {editing?.id === agent.id ? (
              <span className="flex flex-1 gap-2">
                <Input aria-label={`New name for ${agent.name}`} autoFocus maxLength={255} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }} />
                <Button size="sm" variant="primary" disabled={!editing.name.trim() || busy === agent.id}
                  onClick={async () => { if (await run(agent.id, () => clientsApi.updateAgent(agent.id, { name: editing.name.trim() }), 'Agent renamed.')) setEditing(null); }}>Save</Button>
                <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              </span>
            ) : (
              <>
                <button type="button" onClick={() => onFilter(filter === String(agent.id) ? '' : String(agent.id))} title="Show this agent's clients"
                  className={`min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-accent ${filter === String(agent.id) ? 'text-accent' : ''}`}>{agent.name}</button>
                <Chip>{agent.client_count} {agent.client_count === 1 ? 'client' : 'clients'}</Chip>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ id: agent.id, name: agent.name })}>Rename</Button>
                <span className="inline-flex"><Switch checked={agent.is_active} disabled={busy === agent.id} label={`${agent.name} active`}
                  onChange={() => run(agent.id, () => clientsApi.updateAgent(agent.id, { is_active: !agent.is_active }), agent.is_active ? `${agent.name} turned off.` : `${agent.name} is back.`)} /></span>
              </>
            )}
          </li>
        ))}
        {!agents.length && <li className="py-3 text-sm text-muted">No agents yet. Add the first one above.</li>}
      </ul>
    </section>
  );
}
