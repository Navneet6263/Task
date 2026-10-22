import React, { useEffect, useRef, useState } from 'react';
import { Banner, Button, Input, Select, Textarea } from '../../ui';
import { changed, errorText, updatesApi } from './updatesApi';

const initials = name => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');

// Report a problem with an update as a private bug task for one chosen person.
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
  const set = key => e => setDraft({ ...draft, [key]: e.target.value });
  return (
    <form className="updates-form flex max-w-3xl flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5" onSubmit={submit}>
      <Banner tone="info"><strong>Private bug task.</strong> Only the person you pick can see this report — not other teammates or admins. You get a confirmation, but cannot reopen it unless you assign it to yourself.</Banner>
      <p className="text-xs text-muted">Regarding: <span className="font-medium text-ink">{update.title}</span> · Version {update.version}</p>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium">What went wrong?</span>
        <Textarea required maxLength={5000} rows={4} placeholder="Describe what you saw" value={draft.description} onChange={set('description')} /></label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Report title</span>
          <Input required maxLength={160} value={draft.title} onChange={set('title')} /></label>
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Priority</span>
          <Select value={draft.priority} onChange={set('priority')}><option>LOW</option><option>MEDIUM</option><option>HIGH</option></Select></label>
      </div>
      <label className="flex flex-col gap-1"><span className="text-sm font-medium">Steps to reproduce / expected result <span className="font-normal text-muted">(optional)</span></span>
        <Textarea maxLength={5000} rows={3} value={draft.steps} onChange={set('steps')} /></label>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1"><span className="text-sm font-medium">Send to</span>
          <Input placeholder="Search by name, including admins" value={query} onChange={e => { setQuery(e.target.value); setPeople([]); }} /></label>
        {lookupBusy && <p role="status" className="text-xs text-muted">Finding people...</p>}
        {lookupError && <p className="text-sm text-danger" role="alert">{lookupError} <button type="button" className="font-medium underline" onClick={() => setRetry(retry + 1)}>Retry search</button></p>}
        {!lookupBusy && !lookupError && !people.length && <p className="text-xs text-muted">No matching people. Try another name.</p>}
        <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2" role="group" aria-label="Choose assignee">
          {people.map(person => {
            const active = selected?.id === person.id;
            return (
              <button type="button" key={person.id} aria-pressed={active} disabled={busy} onClick={() => setSelected(person)}
                className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left ${active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle'}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted'}`}>{initials(person.name)}</span>
                <span className="min-w-0"><strong className="block truncate text-sm">{person.name}</strong><small className="block truncate text-xs capitalize text-muted">{person.role} · User #{person.id}</small></span>
              </button>
            );
          })}
        </div>
        <p aria-live="polite" className="text-xs text-muted">{selected ? `Send privately to: ${selected.name} (#${selected.id})` : 'Select one person to continue.'}</p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div><Button type="submit" variant="primary" className="updates-primary" disabled={busy || !selected}>{busy ? 'Sending...' : 'Create private bug task'}</Button></div>
    </form>
  );
}
