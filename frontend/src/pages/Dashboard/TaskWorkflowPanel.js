import React, { useEffect, useState } from 'react';
import { localDate } from '../../services/localDate';
import RecurrenceControl from './RecurrenceControl';
import api, { tasks } from '../../services/api';
import { Button, ErrorText, Input, Meter, Select, Textarea } from '../../ui';

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
  const toggleItem = (item) => run(async () => {
    await api.patch(`${url}/checklist/${item.id}`, { is_done: !item.is_done });
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_done: !row.is_done } : row)));
  });
  const deleteItem = (item) => {
    if (window.confirm('Delete this checklist item?')) run(async () => { await api.delete(`${url}/checklist/${item.id}`); setItems((prev) => prev.filter((row) => row.id !== item.id)); });
  };
  const addItem = (event) => {
    event.preventDefault();
    if (title.trim()) run(async () => { const response = await api.post(`${url}/checklist`, { title }); setItems((prev) => [...prev, response.data]); setTitle(''); });
  };
  const duplicate = () => run(async () => {
    if (!window.confirm('Create an unassigned copy in this team?')) return;
    const response = await tasks.create({ ...task, title: `Copy of ${task.title}`.slice(0, 255), assigned_to: null, due_date: null, start_date: null, assigned_date: localDate() });
    alert(`Created task #${response.data.id}`);
    onUpdate({ ...task });
  });
  const toggleFollow = () => run(async () => { const response = await api.put(`${url}/follow`, { following: !following }); setFollowing(response.data.following); });
  const doneCount = items.filter((item) => item.is_done).length;

  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Work checklist &amp; review</h3>
        <Button size="sm" variant="ghost" disabled={busy || loading || disabled} onClick={toggleFollow}>{following ? 'Following · Unfollow' : 'Follow updates'}</Button>
      </header>
      {disabled && <p className="text-sm text-warn">Save or discard your edits before changing workflow.</p>}
      {loading && <p role="status" className="text-sm text-muted">Loading checklist...</p>}
      <ErrorText onRetry={() => setRetry((value) => value + 1)}>{error}</ErrorText>
      <fieldset disabled={disabled || busy || loading} className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs text-muted">{doneCount} of {items.length} steps complete</p>
          {items.length > 0 && <Meter value={doneCount} max={items.length} label="Checklist progress" />}
        </div>
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <label className="flex flex-1 items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={Boolean(item.is_done)} onChange={() => toggleItem(item)} />
              <span className={item.is_done ? 'text-muted line-through' : ''}>{item.title}</span>
            </label>
            <button type="button" aria-label={`Delete checklist item ${item.title}`} className="px-1 text-muted hover:text-danger" onClick={() => deleteItem(item)}>&times;</button>
          </div>
        ))}
        <form className="flex gap-2" onSubmit={addItem}>
          <Input aria-label="New checklist item" maxLength={255} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a small step..." className="min-w-0 flex-1" />
          <Button type="submit" size="sm" disabled={!title.trim()}>Add</Button>
        </form>
        <div className="flex flex-col gap-1">
          <label htmlFor={`blocked-${task.id}`} className="text-xs font-medium text-muted">Blocked by</label>
          <Textarea id={`blocked-${task.id}`} value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="What is stopping this task? Clear to unblock." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`waiting-${task.id}`} className="text-xs font-medium text-muted">Help needed from</label>
          <Select id={`waiting-${task.id}`} className="!w-auto" value={waitingOn} onChange={(event) => setWaitingOn(event.target.value)}>
            <option value="">Nobody selected</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </Select>
          <Button size="sm" onClick={() => update({ blocked_reason: reason, waiting_on: reason ? waitingOn : null })}>Save blocker</Button>
        </div>
        <div className="border-t border-line pt-3">
          <p className="text-sm font-semibold">Review: <span className="font-normal text-muted">{(task.review_status || 'NONE').replaceAll('_', ' ')}</span></p>
          <Textarea aria-label="Review note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Review notes or changes needed" className="my-2" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => update({ review_status: 'READY', review_note: note })}>Request review</Button>
            {canReview && task.review_status === 'READY' && <>
              <Button size="sm" variant="primary" onClick={() => update({ review_status: 'APPROVED', review_note: note })}>Approve &amp; complete</Button>
              <Button size="sm" disabled={!note.trim()} onClick={() => update({ review_status: 'CHANGES_REQUESTED', review_note: note })}>Request changes</Button>
            </>}
            <Button size="sm" variant="ghost" onClick={duplicate}>Duplicate task</Button>
          </div>
        </div>
        {canReview && <RecurrenceControl task={task} enabled={recurrenceEnabled} disabled={busy || disabled} onUpdate={onUpdate} />}
      </fieldset>
    </section>
  );
}
