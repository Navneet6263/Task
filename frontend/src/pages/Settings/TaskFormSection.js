import React, { useCallback, useEffect, useState } from 'react';
import { tasks } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Card, Input, Loading, Select } from '../../ui';
import Section from './Section';

const GROUPS = [
  { key: 'task_type', list: 'task_types', title: 'Task types', help: 'What kind of work a task is, for example Feature or Testing.' },
  { key: 'product', list: 'products', title: 'Products / modules', help: 'Which part of your product the task belongs to.' },
  { key: 'category', list: 'categories', title: 'Categories', help: 'A finer label. Can be limited to one task type.' },
];

function OptionGroup({ group, options, taskTypes, onSaved }) {
  const [label, setLabel] = useState('');
  const [parent, setParent] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, message) => {
    setBusy(true);
    try { await fn(); notify(message, 'success'); await onSaved(); return true; }
    catch (err) { notify(err.response?.data?.error || 'Could not save the option.'); return false; }
    finally { setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    const payload = { option_group: group.key, label: label.trim(), parent_value: group.key === 'category' ? parent : '' };
    if (!payload.label) return;
    const ok = editing
      ? await run(() => tasks.updateFormOption(editing.id, payload), `Renamed to "${payload.label}".`)
      : await run(() => tasks.createFormOption(payload), `Added "${payload.label}".`);
    if (ok) { setLabel(''); setParent(''); setEditing(null); }
  };

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div><h3 className="text-[15px] font-semibold">{group.title}</h3><p className="text-xs text-muted">{group.help}</p></div>
        <span className="rounded-full bg-subtle px-2 font-mono text-xs text-muted">{options.length}</span>
      </div>
      <ul className="max-h-64 flex-1 overflow-y-auto p-2">
        {!options.length && <li className="px-2 py-4 text-center text-sm text-muted">No options yet. Add the first one below.</li>}
        {options.map((option) => (
          <li key={option.id} className={`group flex items-center gap-2 rounded px-2 py-1.5 ${editing?.id === option.id ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{option.label}</span>
              {group.key === 'category' && <span className="text-xs text-muted">{option.parent_value ? `Only for ${option.parent_value}` : 'All task types'}</span>}
            </span>
            <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(option); setLabel(option.label); setParent(option.parent_value || ''); }}>Edit</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => window.confirm(`Delete "${option.label}"?`) && run(() => tasks.deleteFormOption(option.id), `Deleted "${option.label}".`)}>Delete</Button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex flex-col gap-2 border-t border-line p-3">
        <div className="flex gap-2">
          <Input aria-label={`New ${group.title} option`} placeholder={editing ? 'New name' : `Add ${group.title.toLowerCase().replace(/s( \/.*)?$/, '')}`} value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button type="submit" variant={editing ? 'primary' : 'secondary'} disabled={busy || !label.trim()}>{editing ? 'Save' : 'Add'}</Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setLabel(''); setParent(''); }}>Cancel</Button>}
        </div>
        {group.key === 'category' && (
          <Select aria-label="Limit to task type" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Available for all task types</option>
            {taskTypes.map((t) => <option key={t.id || t.label} value={t.label}>Only for {t.label}</option>)}
          </Select>
        )}
      </form>
    </Card>
  );
}

export default function TaskFormSection() {
  const [options, setOptions] = useState(null);
  const load = useCallback(async () => {
    try { const r = await tasks.getFormOptions(); setOptions(r.data || {}); }
    catch (err) { notify(err.response?.data?.error || 'Could not load task form options.'); setOptions({}); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Section title="Task form options" description="The dropdown choices people see when they create a task. Changes apply to everyone in this organization.">
      {!options ? <Loading>Loading options…</Loading> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {GROUPS.map((group) => <OptionGroup key={group.key} group={group} options={options[group.list] || []} taskTypes={options.task_types || []} onSaved={load} />)}
        </div>
      )}
    </Section>
  );
}
