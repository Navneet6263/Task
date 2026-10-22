import React, { useState } from 'react';
import { chat } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Input, Segmented, Switch } from '../../ui';

const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// Choose who can watch (one person or the whole team), add a short note, then start.
export default function StartShare({ teamId, members, selfId, live, preset }) {
  const [audience, setAudience] = useState('person');
  const [personId, setPersonId] = useState(preset || null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [mic, setMic] = useState(true);
  const people = members.filter((m) => Number(m.id) !== Number(selfId) && m.name.toLowerCase().includes(query.trim().toLowerCase()));

  const start = async () => {
    let threadId;
    if (audience === 'person') {
      if (!personId) { notify('Pick the person you want to share with.'); return; }
      try { threadId = (await chat.direct(teamId, personId)).data.id; }
      catch (err) { notify(err.response?.data?.error || 'Could not open a 1:1 conversation.'); return; }
    }
    await live.start({ threadId, note: note.trim(), mic });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Who can watch?</p>
        <Segmented label="Audience" value={audience} onChange={setAudience} options={[['person', 'One person (1:1)'], ['team', 'Whole team']]} className="w-full [&>button]:flex-1 [&>button]:py-1.5" />
      </div>
      {audience === 'person' ? (
        <div className="flex flex-col gap-2">
          <Input aria-label="Find a person" placeholder="Search your team" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2" role="radiogroup" aria-label="Person to share with">
            {people.map((m) => {
              const active = Number(personId) === Number(m.id);
              return (
                <button key={m.id} type="button" role="radio" aria-checked={active} onClick={() => setPersonId(m.id)}
                  className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left ${active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-subtle'}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${active ? 'bg-accent text-accent-fg' : 'bg-subtle text-muted'}`}>{initials(m.name)}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{m.name}</span><span className="block truncate text-xs text-muted">{m.team_role || 'Member'}</span></span>
                </button>
              );
            })}
            {!people.length && <p className="col-span-2 py-4 text-center text-sm text-muted">No one matches.</p>}
          </div>
          <p className="text-xs text-muted">Only this person can see and join. They get a live alert to watch.</p>
        </div>
      ) : <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">Everyone in the team gets an alert and can join to watch.</p>}
      <label className="flex flex-col gap-1"><span className="text-xs font-medium text-muted">What are you showing? <span className="font-normal">(optional)</span></span>
        <Input maxLength={200} placeholder="e.g. Walkthrough of the new invoice screen" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
        <span><span className="font-medium">Talk while sharing</span><span className="block text-xs text-muted">Viewers hear your microphone</span></span>
        <Switch checked={mic} onChange={setMic} label="Use microphone" />
      </label>
      <Button variant="primary" className="py-2.5" disabled={Boolean(live.busy)} onClick={start}>{live.busy === 'start' ? 'Starting…' : 'Start sharing'}</Button>
      <p className="text-center text-xs text-muted">Your browser asks which screen, window or tab to share. Nothing is recorded.</p>
    </div>
  );
}
