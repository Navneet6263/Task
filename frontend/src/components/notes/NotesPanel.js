import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { notes as notesApi } from '../../services/api';
import NoteEditor from './NoteEditor';
import { draftIds, readDraft } from './notesDraft';

const DOT = { none: 'bg-line', green: 'bg-accent', blue: 'bg-info', amber: 'bg-warn', red: 'bg-danger' };
const when = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// Private notes in a side panel. Only you can see them.
export default function NotesPanel({ open, onClose }) {
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = list, null = new note, object = existing
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState([]);

  const load = useCallback(() => {
    setError('');
    notesApi.list().then((r) => setList(r.data)).catch((err) => { setList([]); setError(err.response?.status === 404 ? 'Notes need the latest backend. Restart the server.' : 'Could not load your notes.'); });
    setDrafts(draftIds());
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const upsert = useCallback((note) => setList((current) => [note, ...(current || []).filter((n) => n.id !== note.id)]), []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list || []).filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || String(b.updated_at).localeCompare(String(a.updated_at)));
  }, [list, query]);
  const newDraft = drafts.includes('new') ? readDraft(null) : null;

  if (!open) return null;
  return (
    <aside aria-label="Notes" className="fixed bottom-0 right-0 z-[60] flex w-full flex-col border-l border-line bg-surface shadow-pop sm:w-[420px]" style={{ top: 'var(--shell-header-height, 57px)' }}>
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div><p className="text-[15px] font-semibold">My notes</p><p className="text-[11px] text-muted">Private to you · saved to your account</p></div>
        <div className="flex items-center gap-1">
          {editing === undefined && <button type="button" onClick={() => setEditing(null)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">+ New note</button>}
          <button type="button" aria-label="Close notes" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-lg text-muted hover:bg-subtle hover:text-ink">&times;</button>
        </div>
      </header>
      {editing !== undefined ? (
        <NoteEditor key={editing?.id || 'new'} note={editing} onSaved={upsert} onDeleted={(id) => { setList((c) => c.filter((n) => n.id !== id)); setEditing(undefined); setDrafts(draftIds()); }}
          onBack={() => { setEditing(undefined); setDrafts(draftIds()); }} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="p-2"><input aria-label="Search notes" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-md border border-line bg-subtle px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:bg-surface" /></div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {error && <p role="alert" className="px-2 py-3 text-sm text-danger">{error}</p>}
            {newDraft && (
              <button type="button" onClick={() => setEditing(null)} className="mb-2 w-full rounded-md border border-dashed border-warn/60 bg-warn-soft/40 p-3 text-left">
                <span className="block text-sm font-semibold">{newDraft.title || 'Untitled draft'}</span>
                <span className="block truncate text-xs text-muted">Unsaved draft on this device · tap to continue</span>
              </button>
            )}
            {list === null && <p role="status" className="px-2 py-6 text-center text-sm text-muted">Loading…</p>}
            {list && !shown.length && !newDraft && <p className="px-4 py-10 text-center text-sm text-muted">{query ? 'No note matches.' : 'No notes yet. Use "+ New note" to jot down meeting points, ideas or to-dos.'}</p>}
            <ul className="flex flex-col gap-1.5">
              {shown.map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => setEditing(note)} className="w-full rounded-md border border-line p-3 text-left hover:border-muted">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[note.color] || DOT.none}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{note.title || note.body.split('\n')[0] || 'Untitled'}</span>
                      {note.is_pinned && <span className="text-[10px] font-semibold uppercase text-accent">Pinned</span>}
                      <span className="shrink-0 text-[11px] text-muted">{when(note.updated_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-4 text-xs text-muted">{note.title ? note.body.replace(/\s+/g, ' ').slice(0, 120) : ''}</span>
                    {drafts.includes(String(note.id)) && <span className="mt-1 block pl-4 text-[11px] font-semibold text-warn">Has unsaved changes on this device</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  );
}
