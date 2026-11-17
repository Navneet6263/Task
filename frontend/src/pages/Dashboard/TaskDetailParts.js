import React, { useEffect, useRef, useState } from 'react';
import { taskWorkflow } from '../../services/api';
import { notify } from '../../services/feedback';
import { Button, Textarea } from '../../ui';
import { EyeIcon } from '../../components/shell/icons';

// Small pieces of the task window: click-to-edit title and description, the watch button and the "…" menu.

export function IconButton({ label, onClick, active = false, children, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} {...rest}
      className={`grid h-8 min-w-[32px] place-items-center rounded-md border px-1.5 transition ${active ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent/50 hover:text-ink'}`}>
      {children}
    </button>
  );
}

// The title: looks like a heading, becomes a box on click. Enter or leaving the box saves; Esc cancels.
export function InlineTitle({ value, onSave, disabled = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  useEffect(() => { if (!editing) setText(value || ''); }, [value, editing]);
  const done = () => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== value) onSave(next); else setText(value || '');
  };
  if (editing) {
    return (
      <textarea autoFocus aria-label="Title" rows={2} maxLength={255} value={text} onChange={(e) => setText(e.target.value)} onBlur={done}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } if (e.key === 'Escape') { e.stopPropagation(); setText(value || ''); setEditing(false); } }}
        className="-mx-2 w-[calc(100%+1rem)] resize-none rounded-md border border-accent bg-surface px-2 py-1 text-[22px] font-bold leading-tight outline-none" />
    );
  }
  return (
    <h2 className="m-0">
      <button type="button" disabled={disabled} onClick={() => setEditing(true)} title="Click to edit the title"
        className="-mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left text-[22px] font-bold leading-tight hover:bg-subtle disabled:hover:bg-transparent">{value}</button>
    </h2>
  );
}

// The description: shown as text; click to edit with Save and Cancel.
export function InlineDescription({ value, onSave, disabled = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  useEffect(() => { if (!editing) setText(value || ''); }, [value, editing]);
  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Textarea autoFocus aria-label="Description" rows={5} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => { setEditing(false); if (text !== (value || '')) onSave(text); }}>Save</Button>
          <Button size="sm" onClick={() => { setText(value || ''); setEditing(false); }}>Cancel</Button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={() => setEditing(true)} title="Click to edit the description"
      className="-mx-2 w-[calc(100%+1rem)] whitespace-pre-wrap rounded-md px-2 py-1.5 text-left text-sm hover:bg-subtle disabled:hover:bg-transparent">
      {value ? value : <span className="text-muted">Add a description…</span>}
    </button>
  );
}

// Watch: get a notification for every change and comment on this task. Shows how many people watch it.
export function WatchButton({ taskId }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => taskWorkflow.get(taskId))
      .then(({ data }) => { if (alive) setState({ following: Boolean(data.following), watchers: Number(data.watchers ?? (data.following ? 1 : 0)) }); })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [taskId]);
  if (!state) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      const { data } = await taskWorkflow.follow(taskId, !state.following);
      const now = Boolean(data.following);
      setState((s) => ({ following: now, watchers: Math.max(0, s.watchers + (now === s.following ? 0 : now ? 1 : -1)) }));
      notify(now ? 'You are watching this task. Changes and comments will notify you.' : 'You stopped watching this task.', 'success');
    } catch { notify('Could not change watching.'); }
    finally { setBusy(false); }
  };
  return (
    <IconButton label={state.following ? `Watching (${state.watchers}). Click to stop` : `Watch this task (${state.watchers} watching)`} active={state.following} onClick={toggle} disabled={busy} aria-pressed={state.following}>
      <span className="flex items-center gap-1 text-xs font-semibold"><EyeIcon size={15} />{state.watchers}</span>
    </IconButton>
  );
}

// "…": less common actions for this task.
export function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={root} className="relative">
      <IconButton label="More actions" active={open} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </IconButton>
      {open && (
        <ul role="menu" aria-label="More actions" className="absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop">
          {items.filter(Boolean).map((item, i) => (item === '-' ? <li key={`sep-${i}`} role="separator" className="my-1 border-t border-line" /> : (
            <li key={item.label} role="none">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); item.run(); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-subtle ${item.danger ? 'text-danger' : ''}`}>{item.label}</button>
            </li>
          )))}
        </ul>
      )}
    </div>
  );
}
