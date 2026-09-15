import React, { useEffect, useRef, useState } from 'react';
import { changed, errorText, updatesApi } from './updatesApi';

export default function ReportProblem({ update, onSent, onBusy }) {
  const [query, setQuery] = useState(''), [people, setPeople] = useState([]), [selected, setSelected] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false), [lookupError, setLookupError] = useState(''), [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState({ title: `Problem with ${update.title}`.slice(0, 160), description: '', steps: '', priority: 'MEDIUM' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestKey = useRef(null);
  // This is an idempotency key, not a credential; fallback supports non-HTTPS LAN previews.
  if (!requestKey.current) requestKey.current = window.crypto?.randomUUID?.()
    || `report-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  useEffect(() => {
    const controller = new AbortController(); setLookupBusy(true); setLookupError('');
    const timer = setTimeout(() => updatesApi.assignees(query, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setPeople(data);
    }).catch(err => { if (!controller.signal.aborted) { setPeople([]); setLookupError(errorText(err)); } })
      .finally(() => { if (!controller.signal.aborted) setLookupBusy(false); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, retry]);
  const submit = async event => {
    event.preventDefault(); if (busy || !selected) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const { data } = await updatesApi.report({ ...draft, update_id: update.id, update_version: update.version,
        assigned_to: selected.id, request_key: requestKey.current });
      changed(); onSent(`REPORT-${data.id} sent to ${selected.name}. Only this assignee can view the private task in My Tasks or Updates → My private reports.`);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); onBusy(false); }
  };
  return <form className="updates-form" onSubmit={submit}>
    <div className="updates-privacy"><strong>Private bug task</strong><p>Only the person you select can view this report—not other teammates or other admins. You receive a submission confirmation, but cannot reopen it unless you assign it to yourself.</p></div>
    <p className="updates-hint">Regarding: {update.title} · Version {update.version}</p>
    <label>Report title<input required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
    <label>What went wrong?<textarea required maxLength={5000} rows={4} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
    <label>Steps to reproduce / expected result (optional)<textarea maxLength={5000} rows={3} value={draft.steps} onChange={e => setDraft({ ...draft, steps: e.target.value })} /></label>
    <label>Priority<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label>
    <label>Find the person to assign<input placeholder="Search by name, including admins" value={query} onChange={e => { setQuery(e.target.value); setPeople([]); }} /></label>
    {lookupBusy && <p role="status">Finding people...</p>}
    {lookupError && <p className="updates-error" role="alert">{lookupError} <button type="button" onClick={() => setRetry(retry + 1)}>Retry search</button></p>}
    {!lookupBusy && !lookupError && !people.length && <p>No matching people. Try another name.</p>}
    <div className="updates-people" role="group" aria-label="Choose assignee">{people.map(person => <button type="button" key={person.id}
      aria-pressed={selected?.id === person.id} disabled={busy} onClick={() => setSelected(person)}>
      <strong>{person.name}</strong><small>{person.role} · User #{person.id}</small></button>)}</div>
    <p aria-live="polite">{selected ? `Send privately to: ${selected.name} (#${selected.id})` : 'Select one assignee to continue.'}</p>
    {error && <p role="alert" className="updates-error">{error}</p>}
    <button className="updates-primary" disabled={busy || !selected}>{busy ? 'Sending...' : 'Create private bug task'}</button>
  </form>;
}
