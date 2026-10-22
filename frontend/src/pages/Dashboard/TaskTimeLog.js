import React, { useCallback, useEffect, useState } from 'react';
import { tasks } from '../../services/api';
import { notify } from '../../services/feedback';
import { localToday } from '../../components/taskForm/useTaskFormLayout';
import { Button, Input, Select } from '../../ui';
import { Sec, dateLabel } from './TaskDetailFields';

const fmt = (hours) => `${Number(hours || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} h`;

// "Who spent how long": per-person totals, the entries, and a quick way to add your own time.
export default function TaskTimeLog({ task, members }) {
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canForOthers = ['admin', 'manager', 'company_admin'].includes(user.role);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ hours: '', work_date: localToday(), note: '', user_id: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => tasks.timeLogs(task.id).then((r) => setData(r.data)).catch(() => setData({ logs: [], by_person: [], total_hours: 0, failed: true })), [task.id]);
  useEffect(() => { load(); }, [load]);

  const add = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { data: next } = await tasks.addTimeLog(task.id, { hours: Number(form.hours), work_date: form.work_date, note: form.note, ...(form.user_id ? { user_id: Number(form.user_id) } : {}) });
      setData(next); setForm((f) => ({ ...f, hours: '', note: '' }));
      notify('Time added.', 'success');
    } catch (err) { notify(err.response?.data?.error || 'Could not add the time.'); }
    finally { setBusy(false); }
  };
  const remove = async (log) => {
    if (!window.confirm(`Remove ${fmt(log.hours)} logged by ${log.user_name}?`)) return;
    try { setData((await tasks.deleteTimeLog(task.id, log.id)).data); }
    catch (err) { notify(err.response?.data?.error || 'Could not remove the time.'); }
  };

  const max = Math.max(1, ...(data?.by_person || []).map((p) => p.hours));
  return (
    <Sec title="Time spent">
      {!data ? <p className="py-2 text-sm text-muted">Loading time…</p> : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-2xl font-semibold">{fmt(data.total_hours)}</p>
            <p className="text-xs text-muted">{data.by_person.length} {data.by_person.length === 1 ? 'person' : 'people'} · {data.logs.length} entries</p>
          </div>
          {data.by_person.map((p) => (
            <div key={p.user_id}>
              <div className="flex justify-between text-sm"><span className="font-medium">{p.name}</span><span className="font-mono">{fmt(p.hours)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle"><div className="h-full origin-left rounded-full bg-accent motion-safe:animate-grow-x" style={{ width: `${(p.hours / max) * 100}%` }} /></div>
            </div>
          ))}
          <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-lg bg-subtle p-2.5 sm:grid-cols-[90px_140px_minmax(0,1fr)_auto]">
            <Input aria-label="Hours" type="number" min="0.25" max="24" step="0.25" placeholder="Hours" required value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            <Input aria-label="Date" type="date" max={localToday()} value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
            {canForOthers ? (
              <Select aria-label="Person" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Me</option>{(members || []).filter((m) => Number(m.id) !== Number(user.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            ) : <Input aria-label="Note" maxLength={500} placeholder="What did you do? (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
            <Button type="submit" variant="primary" disabled={busy || !form.hours}>{busy ? 'Adding…' : 'Add time'}</Button>
          </form>
          {data.logs.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {data.logs.slice(0, 20).map((log) => (
                <li key={log.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-20 shrink-0 text-xs text-muted">{dateLabel(log.work_date)}</span>
                  <span className="min-w-0 flex-1 truncate">{log.user_name}{log.note && <span className="text-muted"> · {log.note}</span>}</span>
                  <span className="font-mono">{fmt(log.hours)}</span>
                  {(canForOthers || Number(log.user_id) === Number(user.id) || Number(log.created_by) === Number(user.id)) && (
                    <button type="button" aria-label="Remove time entry" onClick={() => remove(log)} className="px-1 text-muted hover:text-danger">×</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sec>
  );
}
