import React, { useEffect, useState } from 'react';
import { localDate } from '../../services/localDate';
import RecurrenceControl from './RecurrenceControl';
import api, { tasks } from '../../services/api';

export default function TaskWorkflowPanel({ task, members, onUpdate, disabled }) {
  const [items, setItems] = useState([]), [following, setFollowing] = useState(false);
  const [title, setTitle] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [reason, setReason] = useState(task.blocked_reason || '');
  const [waitingOn, setWaitingOn] = useState(task.waiting_on || '');
  const [note, setNote] = useState(task.review_note || '');
  const [retry, setRetry] = useState(0);
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || localStorage.getItem('company_user') || '{}');
  const canReview = ['admin', 'company_admin'].includes(user.role) || Number(user.id) === Number(task.assigned_by);
  const url = `/task-workflow/${task.id}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get(url, { signal: controller.signal }).then(response => { setItems(response.data.checklist); setFollowing(response.data.following); setRecurrenceEnabled(response.data.recurrence_worker_enabled); setError(''); })
      .catch(err => { if (!controller.signal.aborted) setError('Could not load checklist and following status.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, retry]);
  const run = async action => {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.response?.data?.error || 'Action failed. Please retry.'); }
    finally { setBusy(false); }
  };
  const update = patch => run(async () => {
    const response = await api.patch(url, { ...patch, version: task.version }); onUpdate(response.data);
  });
  return <section className="rounded-2xl border bg-white p-4 space-y-3">
    <header className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">Work checklist & review</h3>
      <button type="button" disabled={busy || loading || disabled} onClick={() => run(async () => { const response = await api.put(`${url}/follow`, { following: !following }); setFollowing(response.data.following); })} className="text-sm text-blue-700">{following ? 'Following · Unfollow' : 'Follow updates'}</button></header>
    {disabled && <p className="text-sm text-amber-700">Save or discard your edits before changing workflow.</p>}
    {loading && <p role="status" className="text-sm">Loading checklist...</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error} <button onClick={() => setRetry(value => value + 1)} className="underline">Reload</button></p>}
    <fieldset disabled={disabled || busy || loading} className="space-y-3">
      <p className="text-xs text-slate-500">{items.filter(item => item.is_done).length} of {items.length} steps complete</p>
      {items.map(item => <div key={item.id} className="flex items-center gap-2 text-sm"><label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={Boolean(item.is_done)} onChange={() => run(async () => { await api.patch(`${url}/checklist/${item.id}`, { is_done: !item.is_done }); setItems(prev => prev.map(row => row.id === item.id ? { ...row, is_done: !row.is_done } : row)); })} /><span className={item.is_done ? 'line-through text-slate-400' : ''}>{item.title}</span></label><button aria-label={`Delete checklist item ${item.title}`} onClick={() => { if (window.confirm('Delete this checklist item?')) run(async () => { await api.delete(`${url}/checklist/${item.id}`); setItems(prev => prev.filter(row => row.id !== item.id)); }); }}>×</button></div>)}
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (title.trim()) run(async () => { const response = await api.post(`${url}/checklist`, { title }); setItems(prev => [...prev, response.data]); setTitle(''); }); }}><input aria-label="New checklist item" maxLength={255} value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a small step..." className="min-w-0 flex-1 rounded-lg border p-2 text-sm" /><button disabled={!title.trim()} className="text-sm text-blue-700">Add</button></form>
      <label className="block text-sm font-semibold">Blocked by<textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="What is stopping this task? Clear to unblock." className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
      <label className="block text-sm">Help needed from<select value={waitingOn} onChange={e => setWaitingOn(e.target.value)} className="ml-2 rounded-lg border p-2"><option value="">Nobody selected</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <button onClick={() => update({ blocked_reason: reason, waiting_on: reason ? waitingOn : null })} className="rounded-lg border px-3 py-2 text-sm">Save blocker</button>
      <div className="border-t pt-3"><p className="text-sm font-semibold">Review: {(task.review_status || 'NONE').replaceAll('_', ' ')}</p>
        <textarea aria-label="Review note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Review notes or changes needed" className="my-2 w-full rounded-lg border p-2 text-sm" />
        <div className="flex flex-wrap gap-2"><button onClick={() => update({ review_status: 'READY', review_note: note })} className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">Request review</button>
          {canReview && task.review_status === 'READY' && <><button onClick={() => update({ review_status: 'APPROVED', review_note: note })} className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Approve & complete</button><button disabled={!note.trim()} onClick={() => update({ review_status: 'CHANGES_REQUESTED', review_note: note })} className="rounded-lg border px-3 py-2 text-sm">Request changes</button></>}
          <button onClick={() => run(async () => { if (!window.confirm('Create an unassigned copy in this team?')) return; const response = await tasks.create({ ...task, title: `Copy of ${task.title}`.slice(0, 255), assigned_to: null, due_date: null, start_date: null, assigned_date: localDate() }); alert(`Created task #${response.data.id}`); onUpdate({ ...task }); })} className="rounded-lg border px-3 py-2 text-sm">Duplicate task</button>
        </div>
      </div>
      {canReview && <RecurrenceControl task={task} enabled={recurrenceEnabled} disabled={busy || disabled} onUpdate={onUpdate} />}
    </fieldset>
  </section>;
}
