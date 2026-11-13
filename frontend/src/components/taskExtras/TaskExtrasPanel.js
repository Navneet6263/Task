import React, { useCallback, useEffect, useState } from 'react';
import { taskExtras, tasks } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Input, Select } from '../../ui';
import LabelPicker from './LabelPicker';
import TaskSearchPicker from './TaskSearchPicker';
import { useReloadSummaries, useTaskMeta } from './taskExtrasStore';

const errorOf = (err, fallback) => err?.response?.data?.error || fallback;
const STATUS_DOT = { DONE: 'bg-accent', IN_PROGRESS: 'bg-info', PENDING: 'bg-warn', TODO: 'bg-muted' };
const STATUS_TEXT = { DONE: 'Done', IN_PROGRESS: 'In progress', PENDING: 'Pending', TODO: 'To do' };
// How a link reads from this task's side.
const RELATIONS = [
  ['blocks', false, 'blocks'], ['blocks', true, 'is blocked by'],
  ['relates', false, 'relates to'], ['duplicates', false, 'duplicates'], ['duplicates', true, 'is duplicated by'],
];
const relationOf = (link) => (RELATIONS.find(([type, inward]) => type === link.type && inward === !link.outward) || RELATIONS[2])[2];

function Section({ title, aside, children }) {
  return (
    <section className="rounded-lg border border-line">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3.5 py-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>{aside}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function TaskLine({ task, keyOf, onOpen, right }) {
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-subtle">
      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[task.status] || 'bg-muted'}`} title={STATUS_TEXT[task.status]} />
      <button type="button" onClick={() => onOpen?.(task.id)} className="shrink-0 font-mono text-[11px] font-semibold text-accent hover:underline">{keyOf(task.id)}</button>
      <span className={`min-w-0 flex-1 truncate text-sm ${task.status === 'DONE' ? 'text-muted line-through' : ''}`}>{task.title}</span>
      {right}
    </div>
  );
}

// Task screen → Labels, parent, subtasks and linked work, Jira-style.
export default function TaskExtrasPanel({ task, members = [], onOpenTask, onChanged }) {
  const { keyOf } = useTaskMeta();
  const reloadCards = useReloadSummaries();
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [sub, setSub] = useState({ title: '', assigned_to: '', due_date: '' });
  const [linking, setLinking] = useState(false);
  const [relation, setRelation] = useState(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => Promise.resolve().then(() => taskExtras.detail(task.id)).then(({ data: d }) => setData(d)).catch(() => setData(null)), [task.id]);
  useEffect(() => { setData(null); load(); }, [load]);

  const run = async (request, message) => {
    setBusy(true);
    try { const { data: d } = await request(); if (d?.labels) setData(d); else await load(); if (message) notify(message, 'success'); reloadCards(); onChanged?.(); return true; }
    catch (err) { notify(errorOf(err, 'Could not save.')); return false; }
    finally { setBusy(false); }
  };

  if (!data) return null;
  const done = data.subtasks.filter((s) => s.status === 'DONE').length;
  const pct = data.subtasks.length ? Math.round((done / data.subtasks.length) * 100) : 0;
  const isSubtask = Boolean(data.parent);

  const addSubtask = async (event) => {
    event.preventDefault();
    if (!sub.title.trim()) return;
    if (await run(() => taskExtras.addSubtask(task.id, { ...sub, title: sub.title.trim(), assigned_to: sub.assigned_to || null, due_date: sub.due_date || null }), 'Subtask added.')) {
      setSub({ title: '', assigned_to: sub.assigned_to, due_date: '' });
    }
  };
  // "Add several": one subtask per line, all with the same owner and due date.
  const addMany = async (event) => {
    event.preventDefault();
    const titles = bulkText.split(/\r?\n/).map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 20);
    if (!titles.length) return;
    setBusy(true);
    let made = 0;
    try {
      for (const title of titles) {
        // eslint-disable-next-line no-await-in-loop
        await taskExtras.addSubtask(task.id, { title: title.slice(0, 255), assigned_to: sub.assigned_to || null, due_date: sub.due_date || null });
        made += 1;
      }
      notify(`${made} subtasks added.`, 'success'); setBulkText(''); setBulk(false);
    } catch (err) { notify(errorOf(err, `${made} added, then it stopped.`)); }
    finally { setBusy(false); await load(); reloadCards(); onChanged?.(); }
  };
  const toggleSub = (s) => run(() => tasks.update(s.id, { status: s.status === 'DONE' ? 'TODO' : 'DONE', version: s.version }));
  const addLink = (other) => {
    const [type, inward] = RELATIONS[relation];
    run(() => taskExtras.addLink(task.id, { type, inward, task_id: other.id }), 'Tasks linked.').then((ok) => ok && setLinking(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Labels">
        <LabelPicker id={`labels-${task.id}`} value={data.labels.map((l) => l.id)} onChange={(next) => run(() => taskExtras.setLabels(task.id, next))} />
      </Section>

      {isSubtask ? (
        <Section title="Subtask of" aside={<button type="button" disabled={busy} className="text-xs font-semibold text-muted hover:text-danger" onClick={() => run(() => taskExtras.setParent(task.id, null), 'Now a main task.')}>Detach</button>}>
          <TaskLine task={data.parent} keyOf={keyOf} onOpen={onOpenTask} />
        </Section>
      ) : (
        <Section title={`Subtasks${data.subtasks.length ? ` · ${done}/${data.subtasks.length}` : ''}`}
          aside={!adding && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setAdding(true)}>+ Add subtask</button>}>
          {data.subtasks.length > 0 && (
            <div className="mb-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} /></div>
              <span className="font-mono text-xs font-semibold">{pct}%</span>
            </div>
          )}
          <div className="flex flex-col">
            {data.subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <input type="checkbox" aria-label={`${s.title} done`} className="h-4 w-4 shrink-0 accent-[rgb(var(--c-accent))]" disabled={busy} checked={s.status === 'DONE'} onChange={() => toggleSub(s)} />
                <div className="min-w-0 flex-1"><TaskLine task={s} keyOf={keyOf} onOpen={onOpenTask}
                  right={<span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                    {s.priority === 'HIGH' && <span className="font-semibold text-danger" title="High priority">↑</span>}
                    {s.due_date && <span className={String(s.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10) && s.status !== 'DONE' ? 'font-semibold text-danger' : ''}>{new Date(s.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
                    <span>{s.assigned_to_name || 'Unassigned'}</span>
                  </span>} /></div>
              </div>
            ))}
          </div>
          {!data.subtasks.length && !adding && <p className="text-sm text-muted">Break this task into smaller steps that can each have their own owner.</p>}
          {adding && !bulk && (
            <form onSubmit={addSubtask} className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-line p-2.5 sm:grid-cols-[1fr_150px_140px_auto]">
              <Input autoFocus aria-label="Subtask title" placeholder="What needs to be done?" maxLength={255} value={sub.title} onChange={(e) => setSub({ ...sub, title: e.target.value })} />
              <Select aria-label="Subtask assignee" value={sub.assigned_to} onChange={(e) => setSub({ ...sub, assigned_to: e.target.value })}>
                <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <Input aria-label="Subtask due date" type="date" value={sub.due_date} onChange={(e) => setSub({ ...sub, due_date: e.target.value })} />
              <span className="flex gap-1"><Button size="sm" type="submit" variant="primary" disabled={busy || !sub.title.trim()}>Add</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Done</Button></span>
              <button type="button" onClick={() => setBulk(true)} className="justify-self-start text-xs font-semibold text-accent hover:underline sm:col-span-4">Add several at once</button>
            </form>
          )}
          {adding && bulk && (
            <form onSubmit={addMany} className="mt-2 flex flex-col gap-2 rounded-lg border border-dashed border-line p-2.5">
              <textarea autoFocus aria-label="Subtasks, one per line" rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                placeholder={'One subtask per line, e.g.\nCollect payslips\nCheck totals\nSend to client'}
                className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent" />
              <div className="flex flex-wrap items-center gap-2">
                <Select aria-label="Owner for all" className="!w-auto" value={sub.assigned_to} onChange={(e) => setSub({ ...sub, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
                <Input aria-label="Due date for all" type="date" className="!w-auto" value={sub.due_date} onChange={(e) => setSub({ ...sub, due_date: e.target.value })} />
                <span className="flex-1 text-xs text-muted">{bulkText.split(/\n/).filter((l) => l.trim()).length} subtasks (up to 20)</span>
                <Button size="sm" variant="ghost" onClick={() => setBulk(false)}>One at a time</Button>
                <Button size="sm" type="submit" variant="primary" disabled={busy || !bulkText.trim()}>{busy ? 'Adding…' : 'Add all'}</Button>
              </div>
            </form>
          )}
          {!data.subtasks.length && !adding && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1.5 text-xs text-muted">Or make this a subtask of another task</p>
              <TaskSearchPicker label="Parent task" placeholder="Search the main task…" teamId={task.team_id} exclude={[task.id]} onlyMain onPick={(p) => run(() => taskExtras.setParent(task.id, p.id), `Now a subtask of ${keyOf(p.id)}.`)} />
            </div>
          )}
        </Section>
      )}

      <Section title={`Linked work${data.links.length ? ` · ${data.links.length}` : ''}`}
        aside={!linking && <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setLinking(true)}>+ Link task</button>}>
        {RELATIONS.map(([, , text]) => text).filter((text, i, all) => all.indexOf(text) === i).map((text) => {
          const group = data.links.filter((l) => relationOf(l) === text);
          if (!group.length) return null;
          return (
            <div key={text} className="mb-2">
              <p className={`mb-0.5 px-2 text-[11px] font-semibold uppercase tracking-wider ${text === 'is blocked by' ? 'text-danger' : 'text-muted'}`}>{text}</p>
              {group.map((l) => (
                <TaskLine key={l.id} task={l.task} keyOf={keyOf} onOpen={onOpenTask}
                  right={<button type="button" aria-label={`Remove link to ${keyOf(l.task.id)}`} disabled={busy} onClick={() => run(() => taskExtras.removeLink(task.id, l.id))} className="text-muted opacity-0 hover:text-danger group-hover:opacity-100">×</button>} />
              ))}
            </div>
          );
        })}
        {!data.links.length && !linking && <p className="text-sm text-muted">Show which tasks block this one, or which are related or duplicates.</p>}
        {linking && (
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-dashed border-line p-2.5 sm:flex-row">
            <Select aria-label="How they are linked" className="sm:!w-44" value={relation} onChange={(e) => setRelation(Number(e.target.value))}>
              {RELATIONS.map(([, , text], i) => <option key={text} value={i}>This task {text}</option>)}
            </Select>
            <div className="min-w-0 flex-1"><TaskSearchPicker label="Task to link" exclude={[task.id, ...data.links.map((l) => l.task.id)]} onPick={addLink} /></div>
            <Button size="sm" variant="ghost" onClick={() => setLinking(false)}>Cancel</Button>
          </div>
        )}
      </Section>
    </div>
  );
}
