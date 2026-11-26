import React, { useEffect, useMemo, useState } from 'react';
import { tasks as tasksApi } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, FieldError, Input, Modal, Textarea } from '../../ui';

// Hand over: a manager or team leader moves a task to another team of the company, to that team's leader.
// The receiver keeps it, gives it to someone in their team, or sends it back one step (with a reason).

const MAX_NOTE = 500;
const me = () => { try { return JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}'); } catch { return {}; } };

// Who sees the button: managers, admins and the leader of the task's team (members carry is_reporting_manager).
export const canHandOver = (task, members = []) => {
  if (!task || task.status === 'DONE' || task.parent_task_id) return false;
  const user = me();
  if (['admin', 'manager', 'company_admin'].includes(user.role)) return true;
  return members.some((m) => Number(m.id) === Number(user.id) && (m.is_reporting_manager === true || m.is_reporting_manager === 1));
};

export function HandOverModal({ task, onClose, onDone }) {
  const [options, setOptions] = useState(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    tasksApi.handoverOptions(task.id)
      .then((r) => { if (live) setOptions(r.data); })
      .catch((err) => { if (live) setOptions({ allowed: false, reason: err.response?.data?.error || 'Could not load the teams.', teams: [] }); });
    return () => { live = false; };
  }, [task.id]);

  // Grouped by workspace, filtered by team, leader or workspace name.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (options?.teams || []).filter((t) => !q || [t.name, t.workspace, t.leader?.name].some((v) => String(v || '').toLowerCase().includes(q)));
    return list.reduce((acc, team) => { (acc[team.workspace] ||= []).push(team); return acc; }, {});
  }, [options, query]);

  const submit = async () => {
    if (!picked) { setError('Pick the team that should take this task.'); return; }
    if (!picked.leader) { setError(`${picked.name} has no team leader yet. Ask its admin to set one.`); return; }
    setBusy(true); setError('');
    try {
      const { data } = await tasksApi.handOver(task.id, picked.id, note.trim(), task.version);
      notify(data.message || 'Task handed over.', 'success');
      onDone?.(data);
      onClose();
    } catch (err) { setError(err.response?.data?.error || 'Could not hand the task over. Try again.'); }
    finally { setBusy(false); }
  };

  const blocked = options && options.allowed === false;
  return (
    <Modal title="Hand over to another team" subtitle={task.title} onClose={onClose} size="md"
      footer={<><span className="flex-1" /><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={busy || blocked || !picked}>{busy ? 'Handing over…' : 'Hand over'}</Button></>}>
      {!options ? <p className="text-sm text-muted">Loading teams…</p> : blocked ? <p className="text-sm text-muted">{options.reason}</p> : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">The task moves to that team and goes to its leader. They can keep it, give it to someone in their team, or send it back to you. You can follow its status in My Tasks → Handed over.</p>
          <Input aria-label="Find a team" placeholder="Find a team, leader or workspace" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-64 overflow-y-auto rounded-md border border-line" role="radiogroup" aria-label="Teams">
            {Object.entries(groups).map(([workspace, list]) => (
              <div key={workspace}>
                <p className="sticky top-0 bg-subtle px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{workspace}</p>
                {list.map((team) => {
                  const active = picked?.id === team.id;
                  return (
                    <button key={team.id} type="button" role="radio" aria-checked={active} onClick={() => { setPicked(team); setError(''); }}
                      className={`flex w-full items-center justify-between gap-3 border-t border-line px-3 py-2 text-left text-sm ${active ? 'bg-accent-soft' : 'hover:bg-subtle'}`}>
                      <span className="font-medium">{team.name}</span>
                      <span className={`text-xs ${team.leader ? 'text-muted' : 'text-warn'}`}>{team.leader ? `Leader: ${team.leader.name}` : 'No leader yet'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {!Object.keys(groups).length && <p className="px-3 py-4 text-center text-sm text-muted">No other team matches.</p>}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Note for them <span className="text-xs font-normal text-muted">(optional)</span>
            <Textarea aria-label="Note for the other team" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="For example: please send the quote by Friday." />
          </label>
          <FieldError text={error} />
        </div>
      )}
    </Modal>
  );
}

const STATUS_TEXT = { TODO: 'To do', IN_PROGRESS: 'In progress', PENDING: 'Pending', DONE: 'Done' };
const STATUS_TONE = { TODO: 'bg-subtle text-muted', IN_PROGRESS: 'bg-info-soft text-info', PENDING: 'bg-warn-soft text-warn', DONE: 'bg-accent-soft text-accent' };

// My Tasks → Handed over: where each task I handed over is now, and its status. Read-only.
export function HandedOverSection() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => tasksApi.handedOver())
      .then((r) => { if (live) setRows(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, []);
  if (!rows || !rows.length) return null;
  const active = rows.filter((r) => r.status !== 'DONE' && !r.is_deleted).length;
  return (
    <section className="rounded-lg border border-line bg-surface">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-[15px] font-semibold">Handed over <span className="ml-1 text-xs font-normal text-muted">{active} still open · you can see their status here</span></span>
        <span aria-hidden="true" className={`text-muted transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.title}</span>
                <span className="block text-xs text-muted">
                  {row.from_team} → {row.to_team}
                  {row.current_team && row.current_team !== row.to_team ? ` · now in ${row.current_team}` : ''}
                  {row.workspace ? ` (${row.workspace})` : ''}
                  {row.assignee ? ` · with ${row.assignee}` : ''}
                  {row.due_date ? ` · due ${row.due_date}` : ''}
                </span>
              </span>
              {row.sent_back && <span className="rounded bg-warn-soft px-1.5 py-px text-[11px] font-semibold text-warn">Sent back</span>}
              {row.is_deleted
                ? <span className="rounded bg-danger-soft px-1.5 py-px text-[11px] font-semibold text-danger">Deleted</span>
                : <span className={`rounded px-1.5 py-px text-[11px] font-semibold ${STATUS_TONE[row.status] || 'bg-subtle text-muted'}`}>{STATUS_TEXT[row.status] || row.status}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
