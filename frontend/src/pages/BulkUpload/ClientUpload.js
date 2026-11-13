import React, { useEffect, useMemo, useState } from 'react';
import { clients as clientsApi } from '../../services/api';
import { announceClientsChange } from '../../components/clients/useClients';
import { Banner, Button, Chip, Input, Select } from '../../ui';
import { countOf, planClients } from './clientSheet';
import Progress from './Progress';

const CHUNK = 50;
const errorOf = (err) => err?.response?.data?.error || 'The upload stopped. Check your connection and try again.';

function Group({ group, agents, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const counts = countOf(group);
  const asking = group.choice === '';
  const toggle = (name) => onChange({ ...group, items: group.items.map((i) => (i.name === name ? { ...i, include: !i.include } : i)) });
  // Names that need a look come first.
  const ordered = [...group.items].sort((a, b) => Number(b.state === 'alike') - Number(a.state === 'alike'));
  return (
    <section className={`rounded-lg border bg-surface p-3.5 ${asking ? 'border-warn' : 'border-line'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="min-w-0 truncate text-[15px] font-semibold">{group.label}</h3>
        <span className="text-xs text-muted">{group.items.length} {group.items.length === 1 ? 'name' : 'names'} in the sheet</span>
      </div>
      <label className="mt-2.5 flex flex-col gap-1">
        <span className={`text-xs font-medium ${asking ? 'text-warn' : 'text-muted'}`}>
          {asking ? 'Which agent are these clients for?' : group.matched ? 'Add under (matched from the sheet)' : 'Add under'}
        </span>
        <Select aria-label={`Agent for ${group.label}`} disabled={disabled} value={group.choice} onChange={(e) => onChange({ ...group, choice: e.target.value, matched: false })}>
          {asking && <option value="">Choose…</option>}
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value="new">+ New agent…</option>
          <option value="none">No agent</option>
        </Select>
      </label>
      {group.choice === 'new' && (
        <Input aria-label={`New agent name for ${group.label}`} className="mt-2" maxLength={255} disabled={disabled} placeholder="Agent name" value={group.newName ?? group.label}
          onChange={(e) => onChange({ ...group, newName: e.target.value })} />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-y-1.5">
        <Chip tone="ok">{counts.add} will be added</Chip>
        {counts.existing > 0 && <Chip>{counts.existing} already in your list</Chip>}
        {counts.alike > 0 && <Chip tone="warn">{counts.alike} look like another client</Chip>}
        <button type="button" className="ml-1 text-sm font-semibold text-accent hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Hide names' : 'Check names'}</button>
      </div>
      {open && (
        <ul className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          {ordered.map((item) => (
            <li key={item.name} className="flex items-center gap-2.5 border-b border-line px-2.5 py-1.5 text-sm last:border-b-0">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" aria-label={`Add ${item.name}`} checked={item.include} disabled={disabled || item.state === 'existing'} onChange={() => toggle(item.name)} />
              <span className={`min-w-0 flex-1 truncate ${item.state === 'existing' ? 'text-muted' : ''}`}>{item.name}</span>
              {item.note && <span className={`max-w-[55%] shrink-0 truncate text-xs ${item.state === 'alike' ? 'font-semibold text-warn' : 'text-muted'}`} title={item.note}>{item.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// A client list: every tab goes under its agent. The tool matches what it can and asks about the rest.
export default function ClientUpload({ workbook, config, onChanged, onAgain, onDone, onBusy }) {
  const [groups, setGroups] = useState(() => planClients(workbook, { agents: config.agents || [], clients: config.clients || [] }));
  const [run, setRun] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { onBusy?.(Boolean(run) && !result); return () => onBusy?.(false); }, [run, result, onBusy]);
  const total = useMemo(() => groups.reduce((sum, g) => sum + countOf(g).add, 0), [groups]);
  const asking = groups.filter((g) => g.choice === '' && countOf(g).add > 0).length;
  const unnamed = groups.some((g) => g.choice === 'new' && countOf(g).add > 0 && !(g.newName ?? g.label).trim());

  const start = async () => {
    setError(''); setRun({ done: 0, total });
    let done = 0; let added = 0; let skipped = 0;
    try {
      for (const group of groups) {
        const names = group.items.filter((i) => i.include).map((i) => i.name);
        if (!names.length) continue;
        let agentId = null;
        if (group.choice === 'new') {
          const name = (group.newName ?? group.label).trim();
          try { agentId = (await clientsApi.createAgent(name)).data.id; } catch (err) {
            // Someone already made this agent: use it.
            if (err?.response?.status !== 409) throw err;
            const { data } = await clientsApi.list();
            agentId = (data.agents || []).find((a) => a.name.toLowerCase() === name.toLowerCase())?.id || null;
            if (!agentId) throw err;
          }
        } else if (group.choice !== 'none') agentId = Number(group.choice);
        for (let i = 0; i < names.length; i += CHUNK) {
          const chunk = names.slice(i, i + CHUNK);
          const { data } = await clientsApi.importList(chunk, agentId);
          added += data.added; skipped += chunk.length - data.added; done += chunk.length;
          setRun({ done, total });
        }
      }
      setResult({ added, skipped });
      onDone?.();
    } catch (err) {
      // Whatever went in stays; pressing the button again only adds what is still missing.
      setError(`${errorOf(err)}${added ? ` ${added} clients were added before it stopped.` : ''}`);
      setRun(null);
    }
    announceClientsChange(); onChanged?.();
  };

  if (!groups.length) return <><Banner tone="warn">We could not find any client names in this sheet. Put the names in one column, one client per line.</Banner><div><Button onClick={onAgain}>Choose another file</Button></div></>;
  if (result) {
    return (
      <>
        <Banner tone="ok"><strong>{result.added} {result.added === 1 ? 'client' : 'clients'} added.</strong>{result.skipped > 0 && ` ${result.skipped} were already in your list, so they were left as they are.`} They can be picked in tasks and timesheets now.</Banner>
        <div className="flex gap-2"><Button variant="primary" onClick={onAgain}>Upload another sheet</Button></div>
      </>
    );
  }
  const existing = groups.reduce((sum, g) => sum + countOf(g).existing, 0);
  return (
    <>
      <p className="text-sm text-muted">
        Found <strong className="text-ink">{groups.reduce((sum, g) => sum + g.items.length, 0)} names</strong> in “{workbook.name}”.
        {existing > 0 && ` ${existing} are already in your list and will be left as they are.`} Headings, blank lines and repeated names were skipped.
      </p>
      {asking > 0 && <Banner tone="warn">{asking === 1 ? 'One list needs an agent.' : `${asking} lists need an agent.`} Pick it below, or choose “No agent”.</Banner>}
      {error && <Banner tone="danger"><span role="alert">{error}</span></Banner>}
      {groups.map((group) => <Group key={group.id} group={group} agents={config.agents || []} disabled={Boolean(run)} onChange={(next) => setGroups((all) => all.map((g) => (g.id === next.id ? next : g)))} />)}
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        {run && <Progress done={run.done} total={run.total} label="Adding clients" />}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={Boolean(run) || !total || asking > 0 || unnamed} onClick={start}>{run ? 'Adding…' : `Add ${total} ${total === 1 ? 'client' : 'clients'}`}</Button>
          <Button disabled={Boolean(run)} onClick={onAgain}>Choose another file</Button>
        </div>
      </div>
    </>
  );
}
