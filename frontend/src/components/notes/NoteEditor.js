import React, { useCallback, useEffect, useRef, useState } from 'react';
import { notes as notesApi } from '../../services/api';
import { notify } from '../../services/feedback';
import { clearDraft, isEmpty, readDraft, writeDraft } from './notesDraft';

const COLORS = [['none', 'bg-line'], ['green', 'bg-accent'], ['blue', 'bg-info'], ['amber', 'bg-warn'], ['red', 'bg-danger']];
const pick = (n) => ({ title: n?.title || '', body: n?.body || '', color: n?.color || 'none' });
const same = (a, b) => a.title === b.title && a.body === b.body && a.color === b.color;
const clock = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// Autosaves to your account a moment after you stop typing; until then the text is a
// draft kept in this browser. The status line always says which one you are looking at.
export default function NoteEditor({ note: initial, onSaved, onDeleted, onBack }) {
  const [note, setNote] = useState(initial);
  const [form, setForm] = useState(() => pick(initial));
  const [status, setStatus] = useState(initial ? 'saved' : 'empty');
  const [savedAt, setSavedAt] = useState(initial?.updated_at || null);
  const [restore, setRestore] = useState(() => { const d = readDraft(initial?.id); return d && !isEmpty(d) && !same(pick(d), pick(initial)) ? d : null; });
  const formRef = useRef(form), noteRef = useRef(note), timer = useRef(null), saving = useRef(false);
  formRef.current = form; noteRef.current = note;

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const current = formRef.current, existing = noteRef.current;
    if (isEmpty(current) || saving.current || (existing && same(current, pick(existing)))) return;
    saving.current = true; setStatus('saving');
    try {
      const r = existing ? await notesApi.update(existing.id, { ...current, version: existing.version }) : await notesApi.create(current);
      clearDraft(existing?.id); clearDraft(null);
      setNote(r.data); noteRef.current = r.data; setSavedAt(r.data.updated_at); onSaved(r.data);
      setStatus(same(formRef.current, pick(r.data)) ? 'saved' : 'draft');
      if (!same(formRef.current, pick(r.data))) timer.current = setTimeout(save, 800);
    } catch (err) { setStatus(err.response?.status === 409 ? 'conflict' : 'offline'); }
    finally { saving.current = false; }
  }, [onSaved]);

  const change = (patch) => {
    const next = { ...formRef.current, ...patch };
    setForm(next); formRef.current = next;
    if (isEmpty(next)) { setStatus(noteRef.current ? 'draft' : 'empty'); return; }
    writeDraft(noteRef.current?.id, { ...next, baseVersion: noteRef.current?.version || 0 });
    setStatus('draft');
    clearTimeout(timer.current); timer.current = setTimeout(save, 1200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const back = async () => { if (status === 'draft') await save(); onBack(); };
  const togglePin = async () => {
    if (!note) return;
    try { await notesApi.pin(note.id, !note.is_pinned); const next = { ...note, is_pinned: !note.is_pinned }; setNote(next); onSaved(next); }
    catch { notify('Could not pin the note.'); }
  };
  const remove = async () => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    clearDraft(note?.id); clearDraft(null);
    if (!note) { onBack(); return; }
    try { await notesApi.remove(note.id); onDeleted(note.id); }
    catch { notify('Could not delete the note.'); }
  };
  const reloadSaved = async () => {
    const r = await notesApi.list(); const fresh = r.data.find((n) => n.id === note.id);
    if (fresh) { setNote(fresh); noteRef.current = fresh; setForm(pick(fresh)); clearDraft(fresh.id); setStatus('saved'); onSaved(fresh); }
  };

  const STATUS = {
    empty: ['text-muted', 'Start typing. Your note saves automatically.'],
    draft: ['text-warn', 'Draft kept on this device · saving shortly'],
    saving: ['text-muted', 'Saving to your account…'],
    saved: ['text-accent', savedAt ? `Saved to your account · ${clock(savedAt)}` : 'Saved to your account'],
    offline: ['text-danger', 'Not saved to your account yet. Your draft is safe on this device.'],
    conflict: ['text-danger', 'This note changed in another tab or device.'],
  }[status];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <button type="button" aria-label="Back to notes" onClick={back} className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">‹</button>
        <div className="flex flex-1 items-center gap-1.5" role="radiogroup" aria-label="Note colour">
          {COLORS.map(([value, cls]) => <button key={value} type="button" role="radio" aria-checked={form.color === value} aria-label={value} onClick={() => change({ color: value })} className={`h-4 w-4 rounded-full ${cls} ${form.color === value ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`} />)}
        </div>
        {note && <button type="button" onClick={togglePin} aria-pressed={note.is_pinned} className={`rounded-md px-2 py-1 text-xs font-medium ${note.is_pinned ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle'}`}>{note.is_pinned ? 'Pinned' : 'Pin'}</button>}
        <button type="button" onClick={remove} className="rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft">Delete</button>
      </div>
      {restore && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-warn-soft/60 px-3 py-2 text-xs">
          <span>You have an unsaved draft from {new Date(restore.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.</span>
          <span className="flex gap-2">
            <button type="button" className="font-semibold text-accent" onClick={() => { setRestore(null); change(pick(restore)); }}>Restore draft</button>
            <button type="button" className="text-muted" onClick={() => { setRestore(null); clearDraft(note?.id); }}>Discard</button>
          </span>
        </div>
      )}
      <input aria-label="Note title" placeholder="Title" value={form.title} maxLength={200} onChange={(e) => change({ title: e.target.value })}
        className="border-0 bg-transparent px-4 pb-1 pt-3 text-lg font-semibold text-ink outline-none placeholder:text-muted focus:!shadow-none" />
      <textarea aria-label="Note" placeholder="Write anything: meeting points, ideas, to-dos…" value={form.body} onChange={(e) => change({ body: e.target.value })}
        className="min-h-[200px] flex-1 resize-none border-0 bg-transparent px-4 py-2 text-sm leading-relaxed text-ink outline-none placeholder:text-muted focus:!shadow-none" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs">
        <span className={STATUS[0]} role="status">{STATUS[1]}</span>
        {status === 'offline' && <button type="button" className="font-semibold text-accent" onClick={save}>Retry</button>}
        {status === 'conflict' && <button type="button" className="font-semibold text-accent" onClick={reloadSaved}>Load the saved version</button>}
        {status === 'draft' && <button type="button" className="font-semibold text-accent" onClick={save}>Save now</button>}
      </div>
    </div>
  );
}
