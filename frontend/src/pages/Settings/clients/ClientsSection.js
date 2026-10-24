import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { clients as clientsApi } from '../../../services/api';
import { notify } from '../../../services/feedback';
import { announceClientsChange } from '../../../components/clients/useClients';
import { Button, Input, Loading, Segmented, Select, StatTile, Textarea } from '../../../ui';
import Section from '../Section';
import ClientRule from './ClientRule';
import ClientTable from './ClientTable';
import AgentsPanel from './AgentsPanel';

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  tasks: (a, b) => b.task_count - a.task_count || a.name.localeCompare(b.name),
  recent: (a, b) => String(b.last_used || '').localeCompare(String(a.last_used || '')),
  hours: (a, b) => b.hours - a.hours,
};

// Settings → Clients: add client names once, choose whether task forms may only use this list.
export default function ClientsSection() {
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('active');
  const [sort, setSort] = useState('name');
  const [agentFilter, setAgentFilter] = useState('');
  const [newAgent, setNewAgent] = useState('');

  const load = useCallback(() => clientsApi.list().then((r) => setData(r.data)).catch(() => setData({ failed: true, clients: [] })), []);
  useEffect(() => { load(); }, [load]);
  const changed = async () => { announceClientsChange(); await load(); };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.clients || []).filter((c) => (show === 'all' || (show === 'active' ? c.is_active : !c.is_active)) && (!q || c.name.toLowerCase().includes(q))
      && (!agentFilter || (agentFilter === 'none' ? !c.agent_id : String(c.agent_id) === agentFilter))).sort(SORTS[sort]);
  }, [data, query, show, sort, agentFilter]);

  if (!data) return <Loading>Loading clients…</Loading>;
  const all = data.clients || [];
  const active = all.filter((c) => c.is_active).length;

  const add = async (event) => {
    event.preventDefault();
    const names = [...new Set(name.split(/\r?\n/).map((n) => n.trim()).filter(Boolean))];
    if (!names.length) { notify('Type a client name first.'); return; }
    setBusy('add');
    let added = 0; const skipped = [];
    for (const n of names) {
      try { await clientsApi.create(n, newAgent || undefined); added += 1; }
      catch (err) { skipped.push(err.response?.status === 409 ? `${n} (already there)` : n); }
    }
    setBusy('');
    if (added) { setName(''); await changed(); }
    notify(added ? `${added} ${added === 1 ? 'client' : 'clients'} added. ${skipped.length ? `Skipped: ${skipped.join(', ')}.` : 'They now show in Create task.'}` : `Nothing added. ${skipped.join(', ')}`, added ? 'success' : 'error');
  };
  const setRule = async (pickOnly) => {
    setBusy('rule');
    try { await clientsApi.setPickOnly(pickOnly); await changed(); notify(pickOnly ? 'Create task now shows a client dropdown from this list.' : 'People can type any client name again.', 'success'); }
    catch (err) { notify(err.response?.data?.error || 'Could not save the rule.'); }
    finally { setBusy(''); }
  };
  const rename = async (client, next) => {
    setBusy(client.id);
    try {
      const { data: r } = await clientsApi.update(client.id, { name: next.trim() });
      await changed();
      notify(r.renamed_tasks ? `Renamed. ${r.renamed_tasks} ${r.renamed_tasks === 1 ? 'task' : 'tasks'} updated too.` : 'Client renamed.', 'success');
      return true;
    } catch (err) { notify(err.response?.data?.error || 'Could not rename the client.'); return false; }
    finally { setBusy(''); }
  };
  const moveAgent = async (client, agentId) => {
    setBusy(client.id);
    try {
      await clientsApi.update(client.id, { agent_id: agentId ? Number(agentId) : null }); await changed();
      notify(agentId ? `${client.name} now sits under ${data.agents.find((a) => String(a.id) === String(agentId))?.name}. Earlier entries keep their agent.` : `${client.name} has no agent now.`, 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not change the agent.'); }
    finally { setBusy(''); }
  };
  const toggle = async (client) => {
    setBusy(client.id);
    try { await clientsApi.update(client.id, { is_active: !client.is_active }); await changed(); notify(client.is_active ? `${client.name} turned off. Older tasks keep the name.` : `${client.name} is back in the list.`, 'success'); }
    catch (err) { notify(err.response?.data?.error || 'Could not change the client.'); }
    finally { setBusy(''); }
  };

  return (
    <Section title="Clients" description="Add your client names once. They appear in the Client field every time someone creates a task.">
      <ClientRule pickOnly={Boolean(data.pick_only)} onChange={setRule} busy={busy === 'rule'} />
      <AgentsPanel agents={data.agents || []} onChanged={changed} filter={agentFilter} onFilter={setAgentFilter} />

      <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold">Add a client</h3>
          <button type="button" onClick={() => setBulk(!bulk)} className="text-xs font-semibold text-accent hover:underline">{bulk ? 'Add one at a time' : 'Add several at once'}</button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          {bulk
            ? <Textarea aria-label="Client names, one per line" rows={4} placeholder={'Riverside Motors\nAcme Pvt Ltd\nNorthwind Traders'} className="flex-1" value={name} onChange={(e) => setName(e.target.value)} />
            : <Input aria-label="Client name" maxLength={255} placeholder="Client name, e.g. Riverside Motors" className="flex-1" value={name} onChange={(e) => setName(e.target.value)} />}
          <Select aria-label="Agent for the new client" className="sm:!w-56" value={newAgent} onChange={(e) => setNewAgent(e.target.value)}>
            <option value="">No agent</option>{(data.agents || []).filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Button type="submit" variant="primary" className="sm:h-10" disabled={busy === 'add' || !name.trim()}>{busy === 'add' ? 'Adding…' : bulk ? 'Add all' : 'Add client'}</Button>
        </div>
        <p className="text-xs text-muted">{bulk ? 'One name per line. Names already in the list are skipped.' : 'Press Enter to add. Client names already used on tasks are listed below automatically.'}</p>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Clients" value={all.length} />
        <StatTile label="Active" value={active} />
        <StatTile label="With tasks" value={all.filter((c) => c.task_count > 0).length} />
        <StatTile label="Hours logged" value={Math.round(all.reduce((s, c) => s + (c.hours || 0), 0) * 10) / 10} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Search clients" placeholder="Search clients" className="!w-56" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Segmented label="Show" value={show} onChange={setShow} options={[['active', `Active · ${active}`], ['inactive', `Off · ${all.length - active}`], ['all', `All · ${all.length}`]]} className="[&>button]:normal-case" />
          <Select aria-label="Filter by agent" className="!w-auto" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">All agents</option><option value="none">No agent</option>{(data.agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <span className="flex-1" />
          <Select aria-label="Sort clients" className="!w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name A–Z</option><option value="tasks">Most tasks</option><option value="recent">Recently used</option><option value="hours">Most hours</option>
          </Select>
        </div>
        <ClientTable rows={rows} busyId={busy} onRename={rename} onToggle={toggle} agents={data.agents || []} onMoveAgent={moveAgent}
          emptyText={all.length ? 'No clients match.' : 'No clients yet. Add your first one above.'} />
        <p className="text-xs text-muted">Turning a client off hides it from Create task. Tasks that already use it keep the name. Renaming updates those tasks too.</p>
      </div>
    </Section>
  );
}
