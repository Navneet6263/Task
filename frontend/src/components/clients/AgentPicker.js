import React from 'react';
import { Select } from '../../ui';
import useClients from './useClients';

// The Agent field on task forms: the accounting firm a client comes through (Settings → Clients → Agents).
export default function AgentPicker({ id, value, onChange, disabled = false, agents: given }) {
  const live = useClients();
  const agents = (given || live.agents || []).filter((a) => a.is_active !== false);
  const v = value === null || value === undefined ? '' : String(value);
  const list = v && !agents.some((a) => String(a.id) === v) ? [{ id: v, name: 'Agent no longer active' }, ...agents] : agents;
  return (
    <Select id={id} disabled={disabled} value={v} onChange={(e) => onChange(e.target.value)}>
      <option value="">{agents.length ? 'All agents' : 'No agents yet'}</option>
      {list.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
    </Select>
  );
}

// Clients that sit under the given agent (all clients when no agent is chosen).
export const clientsForAgent = (clients, agentId) => (agentId ? clients.filter((c) => String(c.agent_id || '') === String(agentId)) : clients);
